"""
main.py — Refine Core API

Endpoints implemented in Slice 1:
    GET  /health   — liveness check; 503 if Ollama is not running
    POST /rewrite  — stream the rewritten text as Server-Sent Events (SSE)

Endpoints stubbed for later slices:
    POST /clarify  (Slice 2)
    GET  /tones    (Slice 2)

Run locally:
    uvicorn apps.api.main:app --reload --port 8000
"""

import json
import pathlib
import random
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from apps.api import llm
from apps.api.schemas import HealthResponse, RewriteRequest

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

# CORS: allow only the Chrome extension origin and localhost for development.
# The extension origin looks like: chrome-extension://<id>
# We keep this restrictive; the extension always talks to us, never to Ollama.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"(chrome-extension://.*|http://localhost(:\d+)?)",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["infra"])
async def health() -> HealthResponse:
    """
    Check that the Ollama model server is reachable.
    Returns 503 if it is not running so the extension can show a clear message.
    """
    ok = await llm.check_health()
    if not ok:
        raise HTTPException(
            status_code=503,
            detail="Model server not running — start Ollama first",
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

    # Append /no_think as a belt-and-suspenders fallback for Qwen3 thinking mode
    user_content = req.text.strip() + " /no_think"

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
            detail="Model server not running — start Ollama first",
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
# Stubs for Slice 2 (not implemented yet)
# ---------------------------------------------------------------------------

@app.post("/clarify", tags=["clarify"], include_in_schema=False)
async def clarify_stub() -> dict:
    raise HTTPException(status_code=501, detail="Not implemented — coming in Slice 2")


@app.get("/tones", tags=["tones"], include_in_schema=False)
async def tones_stub() -> dict:
    raise HTTPException(status_code=501, detail="Not implemented — coming in Slice 2")
