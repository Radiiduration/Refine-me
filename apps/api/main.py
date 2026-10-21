"""
main.py — Refine Core API

Endpoints implemented in Slice 1:
    GET  /health   — liveness check; 503 if Ollama is not running
    POST /rewrite  — stream the rewritten text as Server-Sent Events (SSE)

Endpoints implemented in Slice 2:
    POST /clarify  — decide whether clarification questions are needed
    GET  /tones    — return the available tones from tones.json

Run locally:
    uvicorn apps.api.main:app --reload --port 8000
"""

import json
import hmac
import ipaddress
import os
import pathlib
import random
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from apps.api import llm
from apps.api.schemas import (
    ClarifyRequest,
    ClarifyResponse,
    HealthResponse,
    RewriteRequest,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# This file lives at apps/api/main.py; prompts are at packages/prompts/
_PROMPTS_DIR = pathlib.Path(__file__).parent.parent.parent / "packages" / "prompts"


def _load_text(filename: str) -> str:
    return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")


def _load_json(filename: str) -> dict:
    return json.loads((_PROMPTS_DIR / filename).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Refine API",
    description="Privacy-first AI writing refiner — local model only.",
    version="0.1.0",
)

# CORS: allow only the Chrome extension, localhost, and explicitly configured web clients.
# The extension origin looks like: chrome-extension://<id>
# We keep this restrictive; the extension always talks to us, never to Ollama.
_configured_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("REFINE_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_configured_origins,
    allow_origin_regex=r"(chrome-extension://.*|tauri://localhost|http://(localhost|127\.0\.0\.1):5173)",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Access-Control-Request-Private-Network"],
)


@app.middleware("http")
async def protect_lan_clients(request, call_next):
    """Require a shared secret when the API is reachable from another device."""
    client_host = request.client.host if request.client else ""
    try:
        remote_client = not ipaddress.ip_address(client_host).is_loopback
    except ValueError:
        # ASGI test transports use names such as "testclient" instead of IPs.
        remote_client = False

    if remote_client:
        expected = os.getenv("REFINE_MOBILE_TOKEN", "")
        if not expected:
            return JSONResponse(
                {"detail": "Remote API access is disabled; configure REFINE_MOBILE_TOKEN."},
                status_code=403,
            )
        supplied = request.headers.get("x-refine-token", "")
        if not hmac.compare_digest(supplied, expected):
            return JSONResponse({"detail": "Invalid Refine device token."}, status_code=401)

    response = await call_next(request)
    # Chrome can require this opt-in when an HTTPS Vercel site calls a loopback API.
    if request.headers.get("access-control-request-private-network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["infra"])
async def health() -> HealthResponse:
    """
    Check that the configured local model server is reachable.
    Returns 503 if it is not running so the extension can show a clear message.
    """
    ok = await llm.check_health()
    if not ok:
        raise HTTPException(
            status_code=503,
            detail="Model server not running — start llama-server first",
        )
    return HealthResponse(
        status="ok",
        backend=llm.LLM_BACKEND,
        model=llm.LLM_MODEL,
    )


# ---------------------------------------------------------------------------
# POST /rewrite
# ---------------------------------------------------------------------------

def _build_rewrite_messages(req: RewriteRequest, tones: dict) -> tuple[list[dict], int]:
    """
    Build the messages list and resolve the seed for this request.

    Returns (messages, seed) so the seed can be embedded in the SSE footer
    if the client wants to reproduce the result.
    """
    tone_key = req.tone if req.tone in tones else "formal"
    tone = tones[tone_key]

    # Resolve seed — use provided or pick a random one
    seed = req.seed if req.seed is not None else random.randint(0, 99_999)

    # Fill the rewrite prompt template (stored in packages/prompts/rewrite.md)
    system_prompt = _load_text("rewrite.md")
    system_prompt = system_prompt.replace("{{tone_name}}", tone["name"])
    system_prompt = system_prompt.replace("{{tone_description}}", tone["description"])
    system_prompt = system_prompt.replace(
        "{{audience}}", req.answers.get("audience", "not specified")
    )
    system_prompt = system_prompt.replace(
        "{{goal}}", req.answers.get("goal", "not specified")
    )
    system_prompt = system_prompt.replace(
        "{{variation_hint}}", llm.variation_hint(seed)
    )

    # Keep every clarification answer, including model-generated question IDs.
    user_content = f"Draft:\n{req.text.strip()}"
    if req.answers:
        answer_text = json.dumps(req.answers, ensure_ascii=False)
        user_content += f"\n\nUser-provided answers (reference only):\n{answer_text}"
    # Append /no_think as a belt-and-suspenders fallback for Qwen3 thinking mode.
    user_content += " /no_think"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    return messages, seed


async def _sse_stream(gen: AsyncGenerator[str, None]) -> AsyncGenerator[bytes, None]:
    """
    Wrap a text-chunk generator as SSE.

    Format per chunk:  data: <text>\n\n
    Terminal sentinel: data: [DONE]\n\n
    """
    async for chunk in gen:
        # Escape newlines inside the data field so SSE framing stays intact
        escaped = chunk.replace("\n", "\\n")
        yield f"data: {escaped}\n\n".encode()
    yield b"data: [DONE]\n\n"


@app.post("/rewrite", tags=["rewrite"])
async def rewrite(req: RewriteRequest) -> StreamingResponse:
    """
    Rewrite the supplied draft in the requested tone.

    Streams the result as Server-Sent Events so the extension can show text
    as it arrives. Send 'seed' in subsequent calls (with a different value)
    to get a new variant — the variation_hint changes automatically.
    """
    # Fail fast if the model server is down rather than hanging for 60 s
    if not await llm.check_health():
        raise HTTPException(
            status_code=503,
            detail="Model server not running — start llama-server first",
        )

    tones = _load_json("tones.json")
    messages, seed = _build_rewrite_messages(req, tones)

    gen = llm.generate_text_stream(messages, temperature=0.8, seed=seed)

    return StreamingResponse(
        _sse_stream(gen),
        media_type="text/event-stream",
        headers={
            # Disable buffering so chunks arrive immediately in the browser
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


# ---------------------------------------------------------------------------
# Clarify JSON schema — passed to Ollama's `format` field so the model is
# constrained to produce valid structured output without post-hoc parsing.
# ---------------------------------------------------------------------------

_CLARIFY_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "needs_clarification": {"type": "boolean"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id":      {"type": "string"},
                    "q":       {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 2,
                        "maxItems": 5,
                    },
                },
                "required": ["id", "q", "options"],
            },
            "maxItems": 3,
        },
    },
    "required": ["needs_clarification", "questions"],
}


# ---------------------------------------------------------------------------
# POST /clarify
# ---------------------------------------------------------------------------

@app.post("/clarify", response_model=ClarifyResponse, tags=["clarify"])
async def clarify(req: ClarifyRequest) -> ClarifyResponse:
    """
    Decide whether the draft needs clarification before rewriting.

    Calls the model with schema-enforced JSON (Ollama `format` field).
    On any LLM or JSON failure: returns needs_clarification=false so the
    extension can proceed straight to rewriting rather than surfacing an error.
    """
    system_prompt = _load_text("clarify.md")

    # Include the app context hint when available so the model can infer
    # domain-specific questions (e.g. "Gmail" → likely an email).
    user_content = req.text
    if req.context.app:
        user_content = f"[Context: writing in {req.context.app}]\n\n{req.text}"

    # Append /no_think as belt-and-suspenders (same as rewrite)
    user_content = user_content + " /no_think"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_content},
    ]

    try:
        raw = await llm.generate_json(
            messages,
            schema=_CLARIFY_JSON_SCHEMA,
            temperature=0.2,
        )
        # Validate through Pydantic — catches structurally-valid JSON that
        # still violates business rules (e.g. 0 options, > 3 questions).
        response = ClarifyResponse(**raw)

        # Clamp: never return more than 3 questions even if the model ignores maxItems
        response.questions = response.questions[:3]
        # Clamp each question's options to 2-5
        for q in response.questions:
            q.options = q.options[:5]
            if len(q.options) < 2:
                # Degenerate question — drop it
                response.questions.remove(q)

        # If no questions remain after clamping, mark as clear
        if not response.questions:
            response.needs_clarification = False

        return response

    except Exception:
        # Any failure (network, JSON, Pydantic) → safe fallback:
        # skip clarification rather than blocking the user.
        return ClarifyResponse(needs_clarification=False, questions=[])


# ---------------------------------------------------------------------------
# GET /tones
# ---------------------------------------------------------------------------

@app.get("/tones", tags=["tones"])
async def tones() -> dict:
    """Return all available tones from tones.json. Extensible without code changes."""
    return _load_json("tones.json")
