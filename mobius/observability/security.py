"""Security utilities for Mobius services.

This module provides a persistent API key store with rotation and grace
windows as well as a reusable token-bucket rate limiter suitable for
synchronous stacks.
"""

from __future__ import annotations

import json
import os
import hmac
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Dict, List, MutableMapping, Optional

__all__ = [
    "APIKeyRecord",
    "APIKeyStore",
    "RateLimitExceeded",
    "TokenBucketRateLimiter",
    "generate_secret",
]


ISO_FORMAT = "%Y-%m-%dT%H:%M:%S.%f%z"


@dataclass
class APIKeyRecord:
    """Represents a single API key entry stored on disk."""

    label: str
    key_id: str
    secret: str
    created_at: datetime
    grace_until: Optional[datetime] = None

    def to_json(self) -> MutableMapping[str, str]:
        """Serialise the record to a JSON compatible mapping."""

        payload = {
            "label": self.label,
            "key_id": self.key_id,
            "secret": self.secret,
            "created_at": self.created_at.astimezone(timezone.utc).strftime(ISO_FORMAT),
        }
        if self.grace_until is not None:
            payload["grace_until"] = self.grace_until.astimezone(timezone.utc).strftime(ISO_FORMAT)
        return payload

    @classmethod
    def from_json(cls, payload: MutableMapping[str, str]) -> "APIKeyRecord":
        """Reconstruct a record from its JSON representation."""

        created_at = datetime.strptime(payload["created_at"], ISO_FORMAT)
        grace_until = payload.get("grace_until")
        if grace_until is not None:
            grace_until = datetime.strptime(grace_until, ISO_FORMAT)
        return cls(
            label=payload["label"],
            key_id=payload["key_id"],
            secret=payload["secret"],
            created_at=created_at,
            grace_until=grace_until,
        )


def generate_secret(length: int = 32) -> str:
    """Generate a URL-safe secret string of the requested length."""

    # ``token_urlsafe`` returns ``ceil(length * 4 / 3)`` characters which is
    # sufficient entropy for API key usage. The value is trimmed to the
    # requested length to provide a consistent shape for operators.
    return secrets.token_urlsafe(length)[:length]


class APIKeyStore:
    """Persistent API key storage with rotation and grace windows."""

    def __init__(
        self,
        path: Path | str,
        *,
        default_grace_period: Optional[timedelta] = timedelta(hours=1),
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._records: Dict[str, List[APIKeyRecord]] = {}
        self._default_grace_period = default_grace_period
        self._load()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except json.JSONDecodeError:
            # Corrupt payloads should not crash the process; surface an empty
            # store instead and allow operators to inspect the file.
            return
        records: Dict[str, List[APIKeyRecord]] = {}
        for label, entries in payload.get("keys", {}).items():
            records[label] = [APIKeyRecord.from_json(item) for item in entries]
        self._records = records

    def _serialize(self) -> MutableMapping[str, object]:
        return {
            "keys": {
                label: [record.to_json() for record in records]
                for label, records in self._records.items()
            }
        }

    def _flush(self) -> None:
        payload = self._serialize()
        tmp_path = self.path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        tmp_path.replace(self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            # It is acceptable for chmod to fail on platforms that do not
            # support POSIX permissions (e.g., Windows containers).
            pass

    # ------------------------------------------------------------------
    # High level operations
    # ------------------------------------------------------------------
    def list_labels(self) -> List[str]:
        """Return all labels currently known to the store."""

        with self._lock:
            return sorted(self._records)

    def list_keys(self, label: str) -> List[APIKeyRecord]:
        """Return the key history for a given label sorted by recency."""

        with self._lock:
            return list(self._records.get(label, []))

    def create_key(
        self,
        label: str,
        *,
        secret: Optional[str] = None,
        grace_period: Optional[timedelta] = None,
    ) -> APIKeyRecord:
        """Create a new API key for ``label``.

        Any existing active key for the label will be placed into a grace
        window allowing clients time to rotate their credentials.
        """

        with self._lock:
            now = datetime.now(timezone.utc)
            secret_value = secret or generate_secret()
            record = APIKeyRecord(
                label=label,
                key_id=secrets.token_hex(8),
                secret=secret_value,
                created_at=now,
            )
            existing = self._records.get(label, [])
            if existing:
                grace = grace_period if grace_period is not None else self._default_grace_period
                if grace:
                    deadline = now + grace
                    existing[0].grace_until = deadline
            self._records.setdefault(label, []).insert(0, record)
            self._prune_locked(now)
            self._flush()
            return record

    def revoke_key(self, label: str, key_id: str) -> bool:
        """Remove a key from the store.

        Returns ``True`` when a key was removed.
        """

        with self._lock:
            records = self._records.get(label)
            if not records:
                return False
            initial_len = len(records)
            self._records[label] = [record for record in records if record.key_id != key_id]
            if not self._records[label]:
                self._records.pop(label, None)
            if len(records) != initial_len:
                self._flush()
                return True
            return False

    def prune(self) -> None:
        """Remove expired keys whose grace window has elapsed."""

        with self._lock:
            changed = self._prune_locked(datetime.now(timezone.utc))
            if changed:
                self._flush()

    def _prune_locked(self, now: datetime) -> bool:
        changed = False
        for label, records in list(self._records.items()):
            retained: List[APIKeyRecord] = []
            for index, record in enumerate(records):
                if index == 0:
                    retained.append(record)
                    continue
                if record.grace_until and record.grace_until < now:
                    changed = True
                    continue
                retained.append(record)
            if retained:
                self._records[label] = retained
            else:
                self._records.pop(label, None)
                changed = True
        return changed

    def verify(self, label: str, candidate: str) -> bool:
        """Verify a candidate secret for ``label`` in constant time."""

        now = datetime.now(timezone.utc)
        for record in self.list_keys(label):
            if not hmac.compare_digest(record.secret, candidate):
                continue
            if record.grace_until and record.grace_until < now:
                return False
            return True
        return False


class RateLimitExceeded(Exception):
    """Raised when a rate limit would be exceeded."""

    def __init__(self, retry_after: float):
        super().__init__(f"Rate limit exceeded. Retry after {retry_after:.3f} seconds")
        self.retry_after = max(0.0, float(retry_after))


class _TokenBucket:
    """Simple token bucket used internally by :class:`TokenBucketRateLimiter`."""

    def __init__(self, capacity: int, refill_rate: float, *, now: float) -> None:
        self.capacity = capacity
        self.tokens = float(capacity)
        self.refill_rate = refill_rate
        self.updated_at = now

    def _refill(self, now: float) -> None:
        if now <= self.updated_at:
            return
        delta = now - self.updated_at
        self.tokens = min(self.capacity, self.tokens + delta * self.refill_rate)
        self.updated_at = now

    def consume(self, tokens: int, now: float) -> None:
        self._refill(now)
        if self.tokens >= tokens:
            self.tokens -= tokens
            return
        shortfall = tokens - self.tokens
        retry_after = shortfall / self.refill_rate if self.refill_rate > 0 else float("inf")
        raise RateLimitExceeded(retry_after)


class TokenBucketRateLimiter:
    """In-memory token-bucket rate limiter."""

    def __init__(
        self,
        *,
        capacity: int,
        refill_rate: float,
        max_entries: int = 10000,
        clock: Optional[callable] = None,
    ) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        if refill_rate <= 0:
            raise ValueError("refill_rate must be positive")
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.max_entries = max_entries
        self.clock = clock or time.monotonic
        self._lock = RLock()
        self._buckets: Dict[str, _TokenBucket] = {}

    def allow(self, key: str, tokens: int = 1) -> None:
        """Consume ``tokens`` from the bucket associated with ``key``."""

        now = self.clock()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                if len(self._buckets) >= self.max_entries:
                    # Evict the least recently updated bucket to avoid
                    # unbounded growth.
                    oldest_key = min(self._buckets, key=lambda name: self._buckets[name].updated_at)
                    self._buckets.pop(oldest_key, None)
                bucket = _TokenBucket(self.capacity, self.refill_rate, now=now)
                self._buckets[key] = bucket
            bucket.consume(tokens, now)

    def __call__(self, key: str, tokens: int = 1) -> None:
        self.allow(key, tokens=tokens)

    def snapshot(self) -> Dict[str, float]:
        """Return the remaining tokens for each tracked key.

        This is primarily useful in tests and operational tooling.
        """

        with self._lock:
            now = self.clock()
            return {
                key: min(bucket.capacity, bucket.tokens + max(0.0, now - bucket.updated_at) * bucket.refill_rate)
                for key, bucket in self._buckets.items()
            }
