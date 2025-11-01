"""API key management primitives used for integration tests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Dict, List, Optional


class ApiKeyRotationError(RuntimeError):
    """Raised when a rotation request cannot be fulfilled."""


@dataclass
class _KeyRecord:
    value: str
    created_at: datetime
    grace_expires_at: Optional[datetime] = None
    last_used: Optional[datetime] = None

    def is_active(self, now: datetime) -> bool:
        if self.grace_expires_at is None:
            return True
        return now <= self.grace_expires_at


class ApiKeyManager:
    """Tracks active API keys and exposes rotation helpers."""

    def __init__(self, *, grace_period_seconds: int = 300, rotation_ttl_hours: int = 24) -> None:
        if grace_period_seconds < 0:
            raise ValueError("grace_period_seconds must be non-negative")
        if rotation_ttl_hours <= 0:
            raise ValueError("rotation_ttl_hours must be positive")

        self._grace_period = timedelta(seconds=grace_period_seconds)
        self._rotation_ttl = timedelta(hours=rotation_ttl_hours)
        self._active: Dict[str, _KeyRecord] = {}
        self._legacy: Dict[str, List[_KeyRecord]] = {}
        self._lock = RLock()

    def _now(self, now: Optional[datetime]) -> datetime:
        return now or datetime.now(timezone.utc)

    def register(self, service: str, key: str, *, now: Optional[datetime] = None) -> None:
        if not service or not key:
            raise ValueError("service and key must be provided")
        current_time = self._now(now)
        with self._lock:
            if service in self._active and self._active[service].value == key:
                raise ApiKeyRotationError("Key already active for service")
            self._active[service] = _KeyRecord(value=key, created_at=current_time)
            self._legacy.setdefault(service, [])

    def rotate(self, service: str, new_key: str, *, now: Optional[datetime] = None) -> None:
        if not service or not new_key:
            raise ValueError("service and new_key must be provided")
        current_time = self._now(now)
        with self._lock:
            old_record = self._active.get(service)
            if old_record and old_record.value == new_key:
                raise ApiKeyRotationError("New key matches the currently active key")
            if old_record:
                old_record.grace_expires_at = current_time + self._grace_period
                self._legacy.setdefault(service, []).append(old_record)
            self._active[service] = _KeyRecord(value=new_key, created_at=current_time)
            self._purge_locked(service, current_time)

    def revoke(self, service: str) -> None:
        with self._lock:
            self._active.pop(service, None)
            self._legacy.pop(service, None)

    def validate(self, service: str, key: str, *, now: Optional[datetime] = None) -> bool:
        current_time = self._now(now)
        with self._lock:
            active = self._active.get(service)
            if active and active.value == key:
                active.last_used = current_time
                return True
            for record in self._legacy.get(service, []):
                if record.value == key and record.is_active(current_time):
                    record.last_used = current_time
                    return True
            return False

    def needs_rotation(self, service: str, *, now: Optional[datetime] = None) -> bool:
        current_time = self._now(now)
        with self._lock:
            active = self._active.get(service)
            if not active:
                return True
            return current_time - active.created_at >= self._rotation_ttl

    def stale_legacy_keys(self, service: str, *, now: Optional[datetime] = None) -> List[str]:
        current_time = self._now(now)
        with self._lock:
            return [record.value for record in self._legacy.get(service, []) if not record.is_active(current_time)]

    def _purge_locked(self, service: str, now: datetime) -> None:
        legacy = self._legacy.get(service)
        if legacy is None:
            return
        self._legacy[service] = [record for record in legacy if record.is_active(now)]

    def purge(self, *, now: Optional[datetime] = None) -> None:
        current_time = self._now(now)
        with self._lock:
            for service in list(self._legacy.keys()):
                self._purge_locked(service, current_time)

