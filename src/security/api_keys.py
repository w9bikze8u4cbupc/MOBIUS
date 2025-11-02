"""API key lifecycle management utilities."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from observability.metrics import MetricEmitter


@dataclass
class ApiKeyRecord:
    """Represents an API key issued to a client."""

    key: str
    issued_at: datetime
    expires_at: datetime
    grace_expires_at: datetime
    active: bool = True

    def is_valid(self, now: datetime) -> bool:
        """Return True if the key is usable at *now*."""
        if self.active:
            return now <= self.expires_at
        return now <= self.grace_expires_at


class ApiKeyManager:
    """Manage API key rotation and validation."""

    def __init__(
        self,
        ttl: timedelta,
        grace_period: timedelta,
        *,
        metrics: Optional[MetricEmitter] = None,
    ) -> None:
        if ttl <= timedelta(0):
            raise ValueError("ttl must be positive")
        if grace_period < timedelta(0):
            raise ValueError("grace_period cannot be negative")
        self.ttl = ttl
        self.grace_period = grace_period
        self._metrics = metrics
        self._keys: Dict[str, List[ApiKeyRecord]] = {}

    def issue_key(self, client_id: str, *, issued_at: Optional[datetime] = None, key: Optional[str] = None) -> ApiKeyRecord:
        """Issue a fresh key for *client_id*."""
        issued_time = issued_at or datetime.now(timezone.utc)
        secret = key or secrets.token_hex(32)
        record = ApiKeyRecord(
            key=secret,
            issued_at=issued_time,
            expires_at=issued_time + self.ttl,
            grace_expires_at=issued_time + self.ttl + self.grace_period,
            active=True,
        )
        self._keys.setdefault(client_id, []).append(record)
        return record

    def rotate_key(self, client_id: str, *, rotated_at: Optional[datetime] = None, new_key: Optional[str] = None) -> ApiKeyRecord:
        """Rotate the active key for *client_id* and return the new key."""
        records = self._keys.get(client_id)
        if not records:
            raise KeyError(f"No API keys registered for client '{client_id}'")
        rotation_time = rotated_at or datetime.now(timezone.utc)
        for record in reversed(records):
            if record.active:
                record.active = False
                record.grace_expires_at = rotation_time + self.grace_period
                break
        else:
            raise RuntimeError("No active key available to rotate")
        return self.issue_key(client_id, issued_at=rotation_time, key=new_key)

    def validate(self, client_id: str, key: str, *, now: Optional[datetime] = None) -> bool:
        """Validate that *key* is acceptable for *client_id*."""
        current_time = now or datetime.now(timezone.utc)
        records = self._keys.get(client_id, [])
        for record in records:
            if record.key == key and record.is_valid(current_time):
                self._emit("success", client_id)
                return True
        self._emit("failure", client_id)
        return False

    def purge_expired(self, *, now: Optional[datetime] = None) -> None:
        """Remove keys whose grace period has elapsed."""
        current_time = now or datetime.now(timezone.utc)
        for client_id, records in list(self._keys.items()):
            filtered = [record for record in records if record.grace_expires_at >= current_time]
            if filtered:
                self._keys[client_id] = filtered
            else:
                self._keys.pop(client_id)

    def active_keys(self, client_id: str) -> List[ApiKeyRecord]:
        """Return a copy of active records for *client_id*."""
        return list(self._keys.get(client_id, []))

    def _emit(self, outcome: str, client_id: str) -> None:
        if not self._metrics:
            return
        self._metrics.incr_counter(f"api_keys.validation.{outcome}", tags={"client_id": client_id})
