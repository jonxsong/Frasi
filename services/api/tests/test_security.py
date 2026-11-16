from pytest import MonkeyPatch

from frasi_api.rate_limit import RateLimiter


async def test_rate_limiter_falls_back_and_enforces_window(monkeypatch: MonkeyPatch) -> None:
    rate_limiter = RateLimiter()

    async def unavailable(*args: object) -> tuple[bool, int]:
        del args
        raise ConnectionError("test redis unavailable")

    monkeypatch.setattr(rate_limiter, "_hit_redis", unavailable)
    assert (await rate_limiter.hit("test-window", 2, 60))[0]
    assert (await rate_limiter.hit("test-window", 2, 60))[0]
    allowed, retry_after = await rate_limiter.hit("test-window", 2, 60)
    assert not allowed
    assert retry_after > 0


async def test_security_headers_are_applied(client) -> None:
    response = await client.get("/api/v1/health/live")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
