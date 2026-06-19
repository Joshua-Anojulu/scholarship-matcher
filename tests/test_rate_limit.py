import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rate_limit import RateLimiter


class TestRateLimiterUnit:
    def test_allows_up_to_max_then_blocks(self):
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        assert limiter.allow("k") is True
        assert limiter.allow("k") is True
        assert limiter.allow("k") is False

    def test_keys_are_independent(self):
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        assert limiter.allow("a") is True
        assert limiter.allow("b") is True
        assert limiter.allow("a") is False

    def test_clear_resets(self):
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        assert limiter.allow("k") is True
        assert limiter.allow("k") is False
        limiter.clear()
        assert limiter.allow("k") is True


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


class TestRateLimitEndpoint:
    def test_login_returns_429_when_over_limit(self, client, monkeypatch):
        monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
        from app.api.auth_routes import _login_limit

        _login_limit.limiter.clear()
        monkeypatch.setattr(_login_limit.limiter, "max_requests", 2)
        payload = {"email": "nobody@example.com", "password": "password123"}
        try:
            assert client.post("/auth/login", json=payload).status_code == 401
            assert client.post("/auth/login", json=payload).status_code == 401
            assert client.post("/auth/login", json=payload).status_code == 429
        finally:
            _login_limit.limiter.clear()
