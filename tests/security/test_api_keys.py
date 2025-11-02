"""Tests for API key lifecycle management."""

from datetime import datetime, timedelta, timezone

from observability.metrics import InMemoryMetricsBackend, MetricEmitter
from security.api_keys import ApiKeyManager


def test_key_rotation_and_grace_period():
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)
    manager = ApiKeyManager(ttl=timedelta(seconds=60), grace_period=timedelta(seconds=30), metrics=emitter)

    manager.issue_key("client", issued_at=start, key="alpha")
    assert manager.validate("client", "alpha", now=start)

    rotated_at = start + timedelta(seconds=60)
    second = manager.rotate_key("client", rotated_at=rotated_at, new_key="beta")

    assert manager.validate("client", "beta", now=rotated_at)
    assert manager.validate("client", "alpha", now=rotated_at + timedelta(seconds=20))
    assert not manager.validate("client", "alpha", now=rotated_at + timedelta(seconds=40))

    manager.purge_expired(now=rotated_at + timedelta(seconds=40))
    assert manager.active_keys("client") == [second]

    success_key = ("api_keys.validation.success", (("client_id", "client"),))
    failure_key = ("api_keys.validation.failure", (("client_id", "client"),))
    assert backend.counters[success_key] == 3
    assert backend.counters[failure_key] == 1
