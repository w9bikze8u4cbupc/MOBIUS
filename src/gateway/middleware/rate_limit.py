"""Token-bucket rate limiter keyed by API key or client IP."""

from __future__ import annotations
"""Token-bucket rate limiter keyed by API key or client IP."""

import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Tuple

from ..types import Request, Response


@dataclass
class RateLimitResult:
    """Result returned by :func:`consume` describing the allowance state."""

    allowed: bool
    remaining: int
    reset_seconds: float


class TokenBucketLimiter:
    """Very small in-memory token bucket implementation."""

    def __init__(self, capacity: int, refill_rate: float) -> None:
        self.capacity = capacity
        self.refill_rate = refill_rate
        self._state: Dict[str, Tuple[float, float]] = {}

    def consume(self, key: str, tokens: int = 1) -> RateLimitResult:
        """Attempt to consume tokens for the provided key."""

        now = time.monotonic()
        available, timestamp = self._state.get(key, (self.capacity, now))
        elapsed = max(0.0, now - timestamp)
        available = min(self.capacity, available + elapsed * self.refill_rate)
        if available >= tokens:
            available -= tokens
            allowed = True
            reset = 0.0
        else:
            allowed = False
            if self.refill_rate > 0:
                reset = (tokens - available) / self.refill_rate
            else:
                reset = float("inf")
        self._state[key] = (available, now)
        return RateLimitResult(allowed=allowed, remaining=int(available), reset_seconds=max(reset, 0.0))


class SlidingWindowLimiter:
    """Fallback limiter that records request timestamps for a fixed window."""

    def __init__(self, capacity: int, window_seconds: float) -> None:
        self.capacity = capacity
        self.window = window_seconds
        self._events: Dict[str, Deque[float]] = defaultdict(deque)

    def consume(self, key: str) -> RateLimitResult:
        """Consume a single request slot for the key."""

        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] > self.window:
            events.popleft()
        if len(events) < self.capacity:
            events.append(now)
            return RateLimitResult(True, self.capacity - len(events), 0.0)
        reset = self.window - (now - events[0]) if events else 0.0
        return RateLimitResult(False, 0, max(reset, 0.0))


def key_for_request(request: Request) -> str:
    """Return the rate limiting key for the provided request."""

    api_key = request.headers.get("x-api-key")
    if api_key:
        return api_key
    return request.client[0]


def response_for(result: RateLimitResult) -> Response:
    """Render a response conveying the rate limit decision."""

    if result.allowed:
        return Response(status_code=200, body=b"", headers={})
    if math.isinf(result.reset_seconds):
        retry_after = "0"
    else:
        retry_after = str(max(int(result.reset_seconds), 0))
    headers = {
        "Retry-After": retry_after,
        "X-RateLimit-Remaining": str(result.remaining),
    }
    return Response(status_code=429, body=b"", headers=headers)
