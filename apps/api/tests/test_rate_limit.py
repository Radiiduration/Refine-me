import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_llm_routes_share_ten_requests_per_minute_and_return_retry_after():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        responses = [await client.post("/rewrite", json={}) for _ in range(10)]
        limited = await client.post("/clarify", json={})

    assert all(response.status_code == 422 for response in responses)
    assert limited.status_code == 429
    assert limited.headers["retry-after"].isdigit()
    assert "account" not in limited.text.lower()
