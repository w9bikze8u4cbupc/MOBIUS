from datetime import datetime, timedelta, timezone

import pytest

from security import ApiKeyManager, ApiKeyRotationError


BASE_TIME = datetime(2024, 2, 1, tzinfo=timezone.utc)


def test_register_and_validate_keys():
    manager = ApiKeyManager(grace_period_seconds=60, rotation_ttl_hours=1)
    manager.register("ingest", "alpha", now=BASE_TIME)

    assert manager.validate("ingest", "alpha", now=BASE_TIME)
    assert not manager.validate("ingest", "beta", now=BASE_TIME)
    assert manager.needs_rotation("ingest", now=BASE_TIME + timedelta(hours=1))


def test_rotation_allows_grace_period():
    manager = ApiKeyManager(grace_period_seconds=120, rotation_ttl_hours=24)
    manager.register("analytics", "old", now=BASE_TIME)
    manager.rotate("analytics", "new", now=BASE_TIME + timedelta(minutes=10))

    assert manager.validate("analytics", "new", now=BASE_TIME + timedelta(minutes=10))
    assert manager.validate("analytics", "old", now=BASE_TIME + timedelta(minutes=11))
    assert not manager.validate("analytics", "old", now=BASE_TIME + timedelta(minutes=13))

    stale = manager.stale_legacy_keys("analytics", now=BASE_TIME + timedelta(minutes=13))
    assert stale == ["old"]
    manager.purge(now=BASE_TIME + timedelta(minutes=13))
    assert manager.stale_legacy_keys("analytics", now=BASE_TIME + timedelta(minutes=13)) == []


def test_rotation_rejects_duplicate_keys():
    manager = ApiKeyManager()
    manager.register("service", "key-1", now=BASE_TIME)
    with pytest.raises(ApiKeyRotationError):
        manager.rotate("service", "key-1", now=BASE_TIME + timedelta(minutes=5))
    with pytest.raises(ApiKeyRotationError):
        manager.register("service", "key-1", now=BASE_TIME + timedelta(minutes=5))


def test_validate_requires_active_key():
    manager = ApiKeyManager()
    assert not manager.validate("svc", "missing", now=BASE_TIME)
    manager.register("svc", "active", now=BASE_TIME)
    manager.rotate("svc", "next", now=BASE_TIME + timedelta(seconds=1))
    assert manager.validate("svc", "next", now=BASE_TIME + timedelta(seconds=2))
    assert manager.validate("svc", "active", now=BASE_TIME + timedelta(seconds=2))


def test_needs_rotation_when_no_key_present():
    manager = ApiKeyManager()
    assert manager.needs_rotation("unknown", now=BASE_TIME)

