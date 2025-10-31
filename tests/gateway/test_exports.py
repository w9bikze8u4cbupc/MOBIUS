"""Tests for the lightweight gateway rate limiter."""

from __future__ import annotations

from src.gateway.middleware.rate_limit import (
    TokenBucketLimiter,
    key_for_request,
    response_for,
)
from src.gateway.types import Request


def _request_for(ip: str, api_key: str | None = None) -> Request:
    headers = {"x-api-key": api_key} if api_key else {}
    return Request(method="GET", path="/exports", headers=headers, client=(ip, 12345))


def test_rate_limit_blocks_when_exceeded() -> None:
    limiter = TokenBucketLimiter(capacity=1, refill_rate=0.0)
    req = _request_for("127.0.0.1")
    key = key_for_request(req)

    first = limiter.consume(key)
    assert first.allowed

    blocked = limiter.consume(key)
    assert not blocked.allowed
    assert blocked.remaining == 0
    assert blocked.reset_seconds > 0.0

    response = response_for(blocked)
    assert response.status_code == 429
