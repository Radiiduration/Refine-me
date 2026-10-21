import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_lan_client_requires_mobile_token(monkeypatch):
    monkeypatch.setenv("REFINE_MOBILE_TOKEN", "a-long-test-token")
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("192.168.1.12", 53000)),
        base_url="http://refine",
    ) as client:
        denied = await client.get("/tones")
        accepted = await client.get("/tones", headers={"X-Refine-Token": "a-long-test-token"})

    assert denied.status_code == 401
    assert accepted.status_code == 200


@pytest.mark.asyncio
async def test_lan_client_is_blocked_without_mobile_token(monkeypatch):
    monkeypatch.delenv("REFINE_MOBILE_TOKEN", raising=False)
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("192.168.1.12", 53000)),
        base_url="http://refine",
    ) as client:
        response = await client.get("/tones")

    assert response.status_code == 403
