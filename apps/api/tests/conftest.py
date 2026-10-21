import pytest

from apps.api.main import _request_windows


@pytest.fixture(autouse=True)
def reset_rate_limit_state():
    """Keep each API test independent from prior requests in the same process."""
    _request_windows.clear()
    yield
    _request_windows.clear()
