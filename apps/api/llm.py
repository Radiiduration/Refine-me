"""
llm.py — the ONLY file that knows about the model backend.

Reads LLM_BACKEND, LLM_BASE_URL, and LLM_MODEL from the environment (.env).
Switching backends must never require changes outside this file.

Public interface:
    generate_text_stream(messages, temperature, seed) -> AsyncGenerator[str, None]
    generate_json(messages, schema, temperature)      -> dict
    check_health()                                    -> bool
"""

import json
import os
import re
from typing import Any, AsyncGenerator

import httpx
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config — only read here, nowhere else
# ---------------------------------------------------------------------------
LLM_BACKEND: str = os.getenv("LLM_BACKEND", "ollama")
LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "http://localhost:11434")
LLM_MODEL: str = os.getenv("LLM_MODEL", "hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M")

# How long to wait for a complete response (seconds)
TIMEOUT = 60.0

# Variation hints — indexed by (seed % len) so different seeds yield
# structurally different rewrites rather than just random word changes.
VARIATION_HINTS: list[str] = [
    "lead with the main point",
    "use shorter sentences",
    "warmer opening",
    "more direct",
    "stronger action verbs",
    "simpler vocabulary",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _strip_think(text: str) -> str:
    """
    Remove any <think>…</think> blocks Qwen3 may emit despite think=false.
    Also strips orphan </think> tags that appear when the model starts thinking
    mid-generation and is cut off (observed with Q4_K_M + think=false).
    """
    # Full paired blocks first
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Orphan closing tag (no matching opener)
    text = re.sub(r"</think>", "", text)
    return text.strip()


def _build_chat_payload(
    messages: list[dict],
    *,
    stream: bool,
    temperature: float,
    seed: int | None = None,
    format_schema: dict | None = None,
) -> dict:
    """Build the Ollama /api/chat request body."""
    payload: dict[str, Any] = {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": stream,
        # Disable Qwen3 thinking mode at the Ollama level
        "think": False,
        "options": {
            "temperature": temperature,
            "top_p": 0.9,
        },
    }
    if seed is not None:
        payload["options"]["seed"] = seed
    # Enforce structured JSON output (used by /clarify)
    if format_schema is not None:
        payload["format"] = format_schema
    return payload


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_text_stream(
    messages: list[dict],
    temperature: float = 0.8,
    seed: int | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream rewritten text from the model one chunk at a time.

    Yields raw text chunks (not SSE-framed — the caller handles framing).
    Strips <think> blocks from each chunk defensively.
    Raises httpx.HTTPStatusError / httpx.ConnectError on backend failure.
    """
    payload = _build_chat_payload(
        messages, stream=True, temperature=temperature, seed=seed
    )

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        async with client.stream(
            "POST", f"{LLM_BASE_URL}/api/chat", json=payload
        ) as resp:
            resp.raise_for_status()
            async for raw_line in resp.aiter_lines():
                if not raw_line:
                    continue
                try:
                    data = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue  # skip malformed lines

                chunk = data.get("message", {}).get("content", "")
                if chunk:
                    # Strip any stray think tokens mid-stream
                    chunk = _strip_think(chunk)
                    if chunk:
                        yield chunk

                if data.get("done"):
                    break


async def generate_json(
    messages: list[dict],
    schema: dict,
    temperature: float = 0.2,
) -> dict:
    """
    Generate a JSON-validated response from the model.

    Retries once on parse failure, then raises ValueError so the caller
    can decide on a safe fallback (e.g. needs_clarification=false).
    """
    payload = _build_chat_payload(
        messages,
        stream=False,
        temperature=temperature,
        format_schema=schema,
    )

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                resp = await client.post(f"{LLM_BASE_URL}/api/chat", json=payload)
                resp.raise_for_status()
                raw = resp.json()["message"]["content"]
                raw = _strip_think(raw)
                return json.loads(raw)
            except (json.JSONDecodeError, KeyError) as exc:
                last_error = exc
                # On first failure, retry immediately with the same payload.
                # The model sometimes emits a partial response on the first try.
                continue

        raise ValueError(f"Model returned invalid JSON after 2 attempts: {last_error}")


async def check_health() -> bool:
    """Return True if the Ollama server is reachable, False otherwise."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{LLM_BASE_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


def variation_hint(seed: int) -> str:
    """Pick a variation hint deterministically from the seed."""
    return VARIATION_HINTS[seed % len(VARIATION_HINTS)]
