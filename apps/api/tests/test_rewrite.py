"""
tests/test_rewrite.py — Slice 1 test suite

Tests for GET /health and POST /rewrite.
All LLM calls are mocked so no model server is required to run the suite.

Run:
    pytest apps/api/tests/ -v
"""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from apps.api.main import app

# ---------------------------------------------------------------------------
# Async generator helper — unittest.mock.AsyncMock doesn't support
# async generators, so we use a real async generator factory.
# ---------------------------------------------------------------------------

async def _fake_stream(*chunks: str):
    """Async generator that yields the given chunks."""
    for chunk in chunks:
        yield chunk


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_ok():
    """Health returns 200 when Ollama is reachable."""
    with patch("apps.api.llm.check_health", new_callable=AsyncMock, return_value=True):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "backend" in body
    assert "model" in body


@pytest.mark.asyncio
async def test_health_503_when_model_down():
    """Health returns 503 with a descriptive message when Ollama is not running."""
    with patch("apps.api.llm.check_health", new_callable=AsyncMock, return_value=False):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/health")

    assert resp.status_code == 503
    assert "Ollama" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# /rewrite — input validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rewrite_missing_text_returns_422():
    """Omitting 'text' should fail Pydantic validation."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/rewrite", json={})

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_rewrite_blank_text_returns_422():
    """A blank 'text' field should fail Pydantic validation."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/rewrite", json={"text": "   "})

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /rewrite — 503 propagation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rewrite_503_when_model_down():
    """Rewrite returns 503 immediately if Ollama is not running."""
    with patch("apps.api.llm.check_health", new_callable=AsyncMock, return_value=False):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/rewrite", json={"text": "hello"})

    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# /rewrite — SSE streaming
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rewrite_streams_sse():
    """
    Rewrite streams the LLM output as SSE, ending with [DONE].
    The text is encoded as:  data: <escaped_chunk>\n\n
    """
    def _mock_stream(messages, temperature, seed):
        return _fake_stream("Hello ", "world!")

    with (
        patch("apps.api.llm.check_health", new_callable=AsyncMock, return_value=True),
        patch("apps.api.llm.generate_text_stream", side_effect=_mock_stream),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/rewrite",
                json={"text": "hey can u send the report", "tone": "formal"},
            )

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    body = resp.text
    # Both content chunks must appear in the SSE body
    assert "Hello " in body or "Hello\\n" in body  # newlines are escaped
    assert "world!" in body
    # Stream must terminate with [DONE]
    assert "data: [DONE]" in body


@pytest.mark.asyncio
async def test_rewrite_unknown_tone_falls_back_to_formal():
    """An unrecognised tone key silently falls back to 'formal'."""
    captured_messages: list = []

    def _mock_stream(messages, temperature, seed):
        captured_messages.extend(messages)
        return _fake_stream("OK")

    with (
        patch("apps.api.llm.check_health", new_callable=AsyncMock, return_value=True),
        patch("apps.api.llm.generate_text_stream", side_effect=_mock_stream),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/rewrite",
                json={"text": "test", "tone": "nonexistent_tone_xyz"},
            )

    assert resp.status_code == 200
    # The system prompt must contain the Formal tone description
    system_content = captured_messages[0]["content"]
    assert "Formal" in system_content


@pytest.mark.asyncio
async def test_rewrite_strips_orphan_think_tag():
    """
    Unit-test _strip_think directly: Qwen3 sometimes emits a bare </think>
    when thinking mode is forced off. Both paired blocks and orphan tags
    must be removed.
    """
    from apps.api.llm import _strip_think

    # Paired block
    assert _strip_think("<think>internal monologue</think>result") == "result"
    # Orphan closing tag (observed with Q4_K_M + think=false)
    assert _strip_think("</think>\n\nHello!") == "Hello!"
    # Both present
    assert _strip_think("<think>x</think>middle</think>end") == "middleend"
    # Clean input unchanged
    assert _strip_think("Hello!") == "Hello!"


@pytest.mark.asyncio
async def test_rewrite_deterministic_with_seed():
    """The same seed must produce the same variation_hint in the prompt."""
    hints_seen: list[str] = []

    def _mock_stream(messages, temperature, seed):
        # Grab the variation hint line from the system prompt
        for msg in messages:
            if msg["role"] == "system":
                for line in msg["content"].splitlines():
                    if "Style guidance" in line:
                        hints_seen.append(line)
        return _fake_stream("result")

    with (
        patch("apps.api.llm.check_health", new_callable=AsyncMock, return_value=True),
        patch("apps.api.llm.generate_text_stream", side_effect=_mock_stream),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(2):
                await client.post(
                    "/rewrite", json={"text": "test", "tone": "formal", "seed": 42}
                )

    assert len(hints_seen) == 2
    assert hints_seen[0] == hints_seen[1], "Same seed must yield identical variation_hint"
