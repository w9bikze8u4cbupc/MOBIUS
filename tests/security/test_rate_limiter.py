"""Tests for the sliding window rate limiter."""

from observability.metrics import InMemoryMetricsBackend, MetricEmitter
from security.rate_limiter import RateLimiter


def test_rate_limiter_blocks_when_limit_reached():
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)
    limiter = RateLimiter(2, 10, metrics=emitter)

    assert limiter.allow("client", now=0.0)
    assert limiter.allow("client", now=1.0)
    assert not limiter.allow("client", now=2.0)

    blocked_key = ("rate_limiter.blocked", (("identity", "client"),))
    assert backend.counters[blocked_key] == 1

    assert limiter.allow("client", now=11.0)
    allowed_key = ("rate_limiter.allowed", (("identity", "client"),))
    assert backend.counters[allowed_key] == 3
