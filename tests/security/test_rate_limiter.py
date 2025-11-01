from datetime import datetime, timedelta, timezone

import pytest

from security import RateLimiter
from telemetry.metrics import InMemoryMetricsBackend, MetricEmitter


BASE_TIME = datetime(2024, 1, 1, tzinfo=timezone.utc)


def test_rate_limiter_allows_within_limits():
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)
    limiter = RateLimiter(limit=3, window_seconds=60, metrics=emitter, metric_prefix="api")

    assert limiter.allow("user-1", now=BASE_TIME)
    assert limiter.allow("user-1", now=BASE_TIME + timedelta(seconds=1))
    assert limiter.allow("user-1", now=BASE_TIME + timedelta(seconds=2))
    assert not limiter.allow("user-1", now=BASE_TIME + timedelta(seconds=3))

    counters = {(sample.name, sample.tags): sample.value for sample in backend.counters()}
    assert counters[("api_allowed", (("key", "user-1"),))] == pytest.approx(3)
    assert counters[("api_denied", (("key", "user-1"),))] == pytest.approx(1)

    gauges = {(sample.name, sample.tags): sample.value for sample in backend.gauges()}
    assert gauges[("api_queue_depth", (("key", "user-1"),))] == 3


def test_rate_limiter_sliding_window_resets_usage():
    limiter = RateLimiter(limit=2, window_seconds=10)

    assert limiter.allow("user", now=BASE_TIME)
    assert not limiter.allow("user", weight=2, now=BASE_TIME + timedelta(seconds=1))
    assert limiter.remaining("user", now=BASE_TIME + timedelta(seconds=1)) == 1

    # After window passes usage resets
    assert limiter.allow("user", now=BASE_TIME + timedelta(seconds=11))
    assert limiter.remaining("user", now=BASE_TIME + timedelta(seconds=11)) == 1


def test_rate_limiter_rejects_invalid_inputs():
    limiter = RateLimiter(limit=1, window_seconds=5)
    with pytest.raises(ValueError):
        RateLimiter(limit=0, window_seconds=1)
    with pytest.raises(ValueError):
        RateLimiter(limit=1, window_seconds=0)
    with pytest.raises(ValueError):
        limiter.allow("", now=BASE_TIME)
    with pytest.raises(ValueError):
        limiter.allow("user", weight=0, now=BASE_TIME)


def test_rate_limiter_reset_clears_state():
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)
    limiter = RateLimiter(limit=1, window_seconds=60, metrics=emitter)

    assert limiter.allow("svc", now=BASE_TIME)
    limiter.reset("svc")
    gauges = {(sample.name, sample.tags): sample.value for sample in backend.gauges()}
    assert gauges[("rate_limit_queue_depth", (("key", "svc"),))] == 0
    assert limiter.allow("svc", now=BASE_TIME + timedelta(seconds=1))

