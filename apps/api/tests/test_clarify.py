"""
tests/test_clarify.py — Slice 2 test suite

Tests for POST /clarify and GET /tones.
All LLM calls are mocked; no model server required.

Run:
    pytest apps/api/tests/ -v
"""

import json
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from apps.api.main import app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_CLARIFY_RESPONSE = {
    "needs_clarification": True,
    "questions": [
        {
            "id": "audience",
            "q": "Who is this for?",
            "options": ["Manager", "Colleague", "Client", "Friend"],
        },
        {
            "id": "goal",
            "q": "What's the goal?",
            "options": ["Request", "Follow up", "Inform"],
        },
    ],
}

_CLEAR_DRAFT_RESPONSE = {
    "needs_clarification": False,
    "questions": [],
}


# ---------------------------------------------------------------------------
# GET /tones
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tones_returns_all_five():
    """Tones endpoint must return all 5 built-in tones."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/tones")

    assert resp.status_code == 200
    body = resp.json()
    for key in ("formal", "kind", "friendly", "concise", "confident"):
        assert key in body, f"Missing tone: {key}"
        assert "name" in body[key]
        assert "description" in body[key]


@pytest.mark.asyncio
async def test_tones_structure():
    """Each tone entry must have 'name' and 'description' string fields."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/tones")

    for key, tone in resp.json().items():
        assert isinstance(tone["name"], str), f"{key}.name must be a string"
        assert isinstance(tone["description"], str), f"{key}.description must be a string"


# ---------------------------------------------------------------------------
# POST /clarify — input validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clarify_missing_text_returns_422():
    """Omitting 'text' must fail Pydantic validation."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/clarify", json={})

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_clarify_blank_text_returns_422():
    """Blank 'text' must fail Pydantic validation."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/clarify", json={"text": "   "})

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /clarify — happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clarify_returns_questions_when_needed():
    """When model says clarification is needed, questions are forwarded."""
    with patch(
        "apps.api.llm.generate_json",
        new_callable=AsyncMock,
        return_value=_VALID_CLARIFY_RESPONSE,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/clarify",
                json={"text": "hey can u send the report", "context": {"app": "gmail"}},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_clarification"] is True
    assert len(body["questions"]) == 2
    assert body["questions"][0]["id"] == "audience"
    # Each question must have 2-5 options
    for q in body["questions"]:
        assert 2 <= len(q["options"]) <= 5


@pytest.mark.asyncio
async def test_clarify_returns_false_when_draft_is_clear():
    """When model says draft is clear, needs_clarification is False."""
    with patch(
        "apps.api.llm.generate_json",
        new_callable=AsyncMock,
        return_value=_CLEAR_DRAFT_RESPONSE,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/clarify",
                json={"text": "Please send me the Q3 sales report by Friday. Thanks."},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_clarification"] is False
    assert body["questions"] == []


# ---------------------------------------------------------------------------
# POST /clarify — clamping / defensive guardrails
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clarify_clamps_to_max_3_questions():
    """Even if the model returns 4 questions, only 3 are forwarded."""
    four_questions = {
        "needs_clarification": True,
        "questions": [
            {"id": f"q{i}", "q": f"Question {i}?", "options": ["A", "B"]}
            for i in range(4)
        ],
    }
    with patch(
        "apps.api.llm.generate_json",
        new_callable=AsyncMock,
        return_value=four_questions,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/clarify", json={"text": "some text"})

    assert resp.status_code == 200
    assert len(resp.json()["questions"]) == 3


@pytest.mark.asyncio
async def test_clarify_clamps_options_to_max_5():
    """Even if the model returns 6 options, only 5 are forwarded."""
    six_options = {
        "needs_clarification": True,
        "questions": [
            {"id": "q1", "q": "Pick one?", "options": ["A", "B", "C", "D", "E", "F"]},
        ],
    }
    with patch(
        "apps.api.llm.generate_json",
        new_callable=AsyncMock,
        return_value=six_options,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/clarify", json={"text": "some text"})

    assert resp.status_code == 200
    assert len(resp.json()["questions"][0]["options"]) == 5


# ---------------------------------------------------------------------------
# POST /clarify — fallback on LLM failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clarify_returns_false_on_json_error():
    """If generate_json raises (bad JSON after retry), return needs_clarification=false."""
    with patch(
        "apps.api.llm.generate_json",
        new_callable=AsyncMock,
        side_effect=ValueError("Model returned invalid JSON after 2 attempts"),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/clarify", json={"text": "some text"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_clarification"] is False
    assert body["questions"] == []


@pytest.mark.asyncio
async def test_clarify_returns_false_on_network_error():
    """If the model server is unreachable, return needs_clarification=false."""
    import httpx

    with patch(
        "apps.api.llm.generate_json",
        new_callable=AsyncMock,
        side_effect=httpx.ConnectError("Connection refused"),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/clarify", json={"text": "some text"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_clarification"] is False


# ---------------------------------------------------------------------------
# POST /clarify — context hint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clarify_includes_app_context_in_prompt():
    """The app context (e.g. 'gmail') must appear in the user message sent to the model."""
    captured: list[list[dict]] = []

    async def _mock_generate_json(messages, schema, temperature):
        captured.append(messages)
        return _CLEAR_DRAFT_RESPONSE

    with patch("apps.api.llm.generate_json", side_effect=_mock_generate_json):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/clarify",
                json={"text": "hello", "context": {"app": "gmail"}},
            )

    user_msg = next(m["content"] for m in captured[0] if m["role"] == "user")
    assert "gmail" in user_msg.lower()


@pytest.mark.asyncio
async def test_clarify_no_context_omits_prefix():
    """When no app context is given, the user message must not contain a [Context:] prefix."""
    captured: list[list[dict]] = []

    async def _mock_generate_json(messages, schema, temperature):
        captured.append(messages)
        return _CLEAR_DRAFT_RESPONSE

    with patch("apps.api.llm.generate_json", side_effect=_mock_generate_json):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post("/clarify", json={"text": "hello"})

    user_msg = next(m["content"] for m in captured[0] if m["role"] == "user")
    assert "[Context:" not in user_msg
