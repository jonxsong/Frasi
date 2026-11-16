import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from hashlib import sha256

import redis.asyncio as redis
from fastapi import HTTPException, Request, status

from .config import get_settings


@dataclass
class Window:
    count: int
    expires_at: float


class RateLimiter:
    def __init__(self) -> None:
        self._windows: dict[str, Window] = {}
        self._lock = asyncio.Lock()
        self._redis: redis.Redis | None = None

    def _client(self) -> redis.Redis:
        if self._redis is None:
            self._redis = redis.from_url(
                get_settings().redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=0.15,
                socket_timeout=0.15,
            )
        return self._redis

    async def _hit_redis(self, key: str, maximum: int, window_seconds: int) -> tuple[bool, int]:
        client = self._client()
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, window_seconds)
        ttl = await client.ttl(key)
        return count <= maximum, max(1, ttl)

    async def _hit_memory(self, key: str, maximum: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        async with self._lock:
            current = self._windows.get(key)
            if current is None or current.expires_at <= now:
                current = Window(count=0, expires_at=now + window_seconds)
                self._windows[key] = current
            current.count += 1
            if len(self._windows) > 10_000:
                self._windows = {
                    item_key: value
                    for item_key, value in self._windows.items()
                    if value.expires_at > now
                }
            return current.count <= maximum, max(1, round(current.expires_at - now))

    async def hit(self, key: str, maximum: int, window_seconds: int) -> tuple[bool, int]:
        try:
            return await self._hit_redis(key, maximum, window_seconds)
        except (ConnectionError, TimeoutError, OSError, redis.RedisError):
            return await self._hit_memory(key, maximum, window_seconds)

    def clear_memory(self) -> None:
        self._windows.clear()


limiter = RateLimiter()


def rate_limit(
    scope: str, maximum: int, window_seconds: int
) -> Callable[[Request], Awaitable[None]]:
    async def dependency(request: Request) -> None:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        host = forwarded or (request.client.host if request.client else "unknown")
        identity = sha256(host.encode()).hexdigest()[:20]
        bucket = int(time.time()) // window_seconds
        allowed, retry_after = await limiter.hit(
            f"frasi:limit:{scope}:{identity}:{bucket}", maximum, window_seconds
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests; please try again shortly",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
