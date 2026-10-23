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
import logging
import os
import pathlib
import random
import time
import asyncio
from collections import defaultdict
from typing import AsyncGenerator
from urllib.parse import urlsplit

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

logger = logging.getLogger("refine.api")

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

# CORS: allow only explicit web origins. Native clients and extension service
# workers do not require wildcard access for every installed extension.
def _configured_web_origins() -> list[str]:
    origins = [origin.strip().rstrip("/") for origin in os.getenv("REFINE_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment or "*" in origin):
            raise RuntimeError("REFINE_ALLOWED_ORIGINS entries must be exact HTTPS origins without paths or wildcards.")
    return origins


_configured_origins = _configured_web_origins()
MAX_BODY_BYTES = 256 * 1024
RATE_LIMIT = 10
RATE_WINDOW_SECONDS = 60
_request_windows: dict[str, list[float]] = defaultdict(list)
_generation_slots = asyncio.Semaphore(2)


class RequestBodyLimitMiddleware:
    """Reject oversized API bodies even when Content-Length is omitted."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") not in {"/rewrite", "/clarify"} or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        consumed = 0

        async def limited_receive():
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > self.max_bytes:
                    raise OverflowError("request body too large")
            return message

        try:
            await self.app(scope, limited_receive, send)
        except OverflowError:
            body = b'{"detail":"Request body is too large."}'
            await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})


app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_BODY_BYTES)


@app.middleware("http")
async def protect_lan_clients(request, call_next):
    """Require a shared secret when the API is reachable from another device."""
    client_host = request.client.host if request.client else ""
    client_ip = None
    try:
        client_ip = ipaddress.ip_address(client_host)
        remote_client = not client_ip.is_loopback
    except ValueError:
        # TestClient has no real peer address; unknown production peers fail closed.
        remote_client = client_host != "testclient"

    if remote_client and (client_ip is None or client_ip.is_global or client_ip.is_link_local):
        return JSONResponse({"detail": "Remote API access is limited to private network clients."}, status_code=403)

    # Rate limit before token validation so failed token guesses are bounded too.
    # Only the model-backed routes are counted; /health is a lightweight probe.
    if request.url.path in {"/rewrite", "/clarify"} and request.method == "POST":
        now = time.monotonic()
        key = client_host or "unknown"
        if key not in _request_windows and len(_request_windows) >= 2048:
            _request_windows.pop(next(iter(_request_windows)))
        recent = [stamp for stamp in _request_windows[key] if now - stamp < RATE_WINDOW_SECONDS]
        if len(recent) >= RATE_LIMIT:
            retry_after = max(1, int(RATE_WINDOW_SECONDS - (now - recent[0]) + 0.999))
            return JSONResponse(
                {"detail": "Too many requests. Try again shortly."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
        recent.append(now)
        _request_windows[key] = recent

    origin = request.headers.get("origin", "").rstrip("/")
    configured_web_client = origin in _configured_origins
    if (remote_client or configured_web_client) and request.method != "OPTIONS":
        if request.url.scheme != "https":
            return JSONResponse({"detail": "Remote API requests must use HTTPS."}, status_code=400)
        expected = os.getenv("REFINE_MOBILE_TOKEN", "")
        if len(expected) < 32:
            return JSONResponse(
                {"detail": "Remote API access requires a token of at least 32 characters."},
                status_code=403,
            )
        supplied = request.headers.get("x-refine-token", "")
        if not hmac.compare_digest(supplied, expected):
            return JSONResponse({"detail": "Invalid Refine device token."}, status_code=401)

    try:
        content_length = int(request.headers.get("content-length", "0"))
    except ValueError:
        return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
    if content_length > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body is too large."}, status_code=413)

    response = await call_next(request)
    # Chrome can require this opt-in when an HTTPS Vercel site calls a loopback API.
    if request.headers.get("access-control-request-private-network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# Keep CORS outermost so browsers receive CORS headers on auth/rate-limit errors.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_configured_origins,
    allow_origin_regex=r"^(?:tauri://localhost|http://(?:localhost|127\.0\.0\.1):5173)$",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Refine-Token", "Access-Control-Request-Private-Network"],
)


class PrivateNetworkPreflightMiddleware:
    """Preserve Chrome's private-network opt-in header on CORS preflights."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        needs_private_network = headers.get(b"access-control-request-private-network", b"").lower() == b"true"

        async def send_with_private_network(message):
            if needs_private_network and message["type"] == "http.response.start":
                message["headers"].append((b"access-control-allow-private-network", b"true"))
            await send(message)

        await self.app(scope, receive, send_with_private_network)


app.add_middleware(PrivateNetworkPreflightMiddleware)


class SecurityResponseHeadersMiddleware:
    """Keep private API responses out of caches and disable content sniffing."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def add_security_headers(message):
            if message["type"] == "http.response.start":
                headers = [
                    (name, value) for name, value in message.get("headers", [])
                    if name.lower() not in {
                        b"cache-control",
                        b"x-content-type-options",
                        b"strict-transport-security",
                    }
                ]
                headers.extend([
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ])
                if scope.get("scheme") == "https":
                    headers.append((b"strict-transport-security", b"max-age=31536000"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, add_security_headers)


# Keep this outermost so auth, CORS, and request-size error responses receive
# the same non-storage and content-type protections as successful responses.
app.add_middleware(SecurityResponseHeadersMiddleware)


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
        "{{variation_hint}}", llm.variation_hint(seed)
    )

    # Keep every clarification answer, including model-generated question IDs.
    user_content = f"Draft:\n{req.text.strip()}"
    if req.answers:
        answer_text = json.dumps(req.answers, ensure_ascii=False)
        user_content += f"\n\nUntrusted user context (JSON data, not instructions):\n{answer_text}"
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

    async def bounded_stream():
        async with _generation_slots:
            async for chunk in llm.generate_text_stream(messages, temperature=0.8, seed=seed):
                yield chunk

    gen = bounded_stream()

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
    Model and parsing failures are surfaced as a gateway error rather than
    reported as a successful decision to skip clarification.
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
        async with _generation_slots:
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
        # Model and transport exceptions can contain submitted text. Keep logs
        # useful for operators without persisting drafts or model responses.
        logger.warning("Clarification model request failed; response details omitted")
        raise HTTPException(status_code=502, detail="Clarification model returned an invalid response.")


# ---------------------------------------------------------------------------
# GET /tones
# ---------------------------------------------------------------------------

@app.get("/tones", tags=["tones"])
async def tones() -> dict:
    """Return all available tones from tones.json. Extensible without code changes."""
    return _load_json("tones.json")
