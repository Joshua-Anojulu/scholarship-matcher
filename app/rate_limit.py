"""A small in-memory rate limiter used as a FastAPI dependency.

State lives in the process, which is enough for a single-instance demo deploy. A
shared store (for example Redis) would be the next step for multi-instance hosting.
Set RATE_LIMIT_ENABLED=false to turn it off (the test suite does this).
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


def _enabled() -> bool:
    return os.getenv("RATE_LIMIT_ENABLED", "true").lower() not in {"0", "false", "no"}


class RateLimiter:
    """Sliding-window limiter: at most ``max_requests`` per ``window_seconds`` per key."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        hits = self._hits[key]
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self.max_requests:
            return False
        hits.append(now)
        return True

    def clear(self) -> None:
        self._hits.clear()


def rate_limiter(max_requests: int, window_seconds: float, scope: str):
    """Build a dependency that enforces a per-client-IP limit for one scope."""

    limiter = RateLimiter(max_requests, window_seconds)

    def dependency(request: Request) -> None:
        if not _enabled():
            return
        client = request.client.host if request.client else "unknown"
        if not limiter.allow(f"{scope}:{client}"):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"error": "Too many requests. Please wait a moment and try again."},
            )

    dependency.limiter = limiter
    return dependency
