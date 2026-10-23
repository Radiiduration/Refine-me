import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import MAX_BODY_BYTES, app


@pytest.mark.asyncio
async def test_model_failure_does_not_log_or_return_submitted_draft(monkeypatch, caplog):
    private_marker = "PRIVATE_DRAFT_SENTINEL_4f73"

    async def fail_with_draft_in_exception(*_args, **_kwargs):
        raise RuntimeError(f"upstream error echoed {private_marker}")

    monkeypatch.setattr("apps.api.llm.generate_json", fail_with_draft_in_exception)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/clarify", json={"text": private_marker})

    assert response.status_code == 502
    assert private_marker not in response.text
    assert private_marker not in caplog.text


@pytest.mark.asyncio
async def test_model_routes_reject_oversized_request_bodies():
    body = b"x" * (MAX_BODY_BYTES + 1)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/rewrite",
            content=body,
            headers={"Content-Type": "application/json"},
        )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()
