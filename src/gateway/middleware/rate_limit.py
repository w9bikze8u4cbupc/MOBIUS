from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Any


from fastapi import HTTPException, Request, status

_CAPACITY = int(os.getenv("RL_BURST", "60"))
_RATE = float(os.getenv("RL_RATE_PER_SEC", "1.0"))


@dataclass
class _Bucket:
    tokens: float
    last: float


_buckets: Dict[str, _Bucket] = {}
_lock = threading.Lock()


def _bucket_key(request: Request) -> str:
    api_key = request.headers.get("x-mobius-key") or request.headers.get("X-Mobius-Key")
    if api_key:
        return f"key:{api_key}"
    client = request.client.host if getattr(request, "client", None) else "unknown"
    return f"ip:{client}"


class RateLimitMiddleware:
    def __init__(self, *, capacity: int = _CAPACITY, rate: float = _RATE) -> None:
        self.capacity = max(1, capacity)
        self.rate = max(0.01, rate)

    async def __call__(self, request: Request, call_next: Callable[[Request], Any]):
        key = _bucket_key(request)
        now = time.monotonic()
        with _lock:
            bucket = _buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=float(self.capacity), last=now)
                _buckets[key] = bucket
            elapsed = max(0.0, now - bucket.last)
            bucket.tokens = min(self.capacity, bucket.tokens + elapsed * self.rate)
            bucket.last = now
            if bucket.tokens < 1.0:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
            bucket.tokens -= 1.0
        return await call_next(request)


def reset_buckets() -> None:
    with _lock:
        _buckets.clear()
