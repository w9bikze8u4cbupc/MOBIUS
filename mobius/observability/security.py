"""Security and rate-limiting primitives for the MOBIUS gateway."""

from __future__ import annotations

import argparse
import hmac
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_urlsafe
from threading import RLock
from typing import Dict, Iterable, Mapping, MutableMapping, Optional

LOGGER = logging.getLogger(__name__)

ISO_FORMAT = "%Y-%m-%dT%H:%M:%S.%f%z"


@dataclass(slots=True)
class APIKeyRecord:
    """Representation of a single API key within the store."""

    secret: str
    created_at: datetime
    rotation_interval: timedelta
    grace_until: Optional[datetime] = None
    metadata: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return {
            "secret": self.secret,
            "created_at": self.created_at.strftime(ISO_FORMAT),
            "rotation_interval_seconds": int(self.rotation_interval.total_seconds()),
            "grace_until": self.grace_until.strftime(ISO_FORMAT) if self.grace_until else None,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> "APIKeyRecord":
        created_at_str = str(payload["created_at"])
        created_at = datetime.strptime(created_at_str, ISO_FORMAT)
        rotation_seconds = int(payload.get("rotation_interval_seconds", 0))
        grace_until_raw = payload.get("grace_until")
        grace_until = (
            datetime.strptime(str(grace_until_raw), ISO_FORMAT) if grace_until_raw else None
        )
        metadata = dict(payload.get("metadata", {}))
        return cls(
            secret=str(payload["secret"]),
            created_at=created_at,
            rotation_interval=timedelta(seconds=rotation_seconds),
            grace_until=grace_until,
            metadata=metadata,
        )


class RateLimitExceeded(RuntimeError):
    """Raised when a request exceeds the configured rate limit."""

    def __init__(self, retry_after: float) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


class _TokenBucket:
    __slots__ = ("capacity", "refill_period", "tokens", "updated_at")

    def __init__(self, capacity: int, refill_period: timedelta) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        if refill_period <= timedelta(0):
            raise ValueError("refill_period must be positive")
        self.capacity = float(capacity)
        self.refill_period = refill_period
        self.tokens = float(capacity)
        self.updated_at = datetime.now(timezone.utc)

    def _refill(self, now: datetime) -> None:
        elapsed = (now - self.updated_at).total_seconds()
        if elapsed <= 0:
            return
        tokens_to_add = elapsed * (self.capacity / self.refill_period.total_seconds())
        if tokens_to_add <= 0:
            return
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.updated_at = now

    def consume(self, cost: float, now: datetime) -> float:
        if cost <= 0:
            return 0.0
        if cost > self.capacity:
            raise ValueError("cost cannot exceed bucket capacity")
        self._refill(now)
        if self.tokens >= cost:
            self.tokens -= cost
            return 0.0
        deficit = cost - self.tokens
        seconds_per_token = self.refill_period.total_seconds() / self.capacity
        retry_after = deficit * seconds_per_token
        self.tokens = 0.0
        self.updated_at = now
        return retry_after


class TokenBucketRateLimiter:
    """In-memory token bucket rate limiter suitable for single-process gateways."""

    def __init__(self) -> None:
        self._buckets: Dict[str, _TokenBucket] = {}
        self._lock = RLock()

    def configure_bucket(
        self,
        key: str,
        *,
        capacity: int,
        refill_period: timedelta,
    ) -> None:
        with self._lock:
            self._buckets[key] = _TokenBucket(capacity, refill_period)

    def parse_and_configure(self, spec: str) -> None:
        """Parse a comma-delimited spec and configure buckets.

        Each entry follows the syntax ``METHOD:PATH=hits/seconds``. For example::

            GET:/health=60/60,POST:/api/explain-chunk=90/60
        """

        for entry in (part.strip() for part in spec.split(",") if part.strip()):
            method_path, _, window = entry.partition("=")
            method, _, path = method_path.partition(":")
            hits_str, _, seconds_str = window.partition("/")
            try:
                capacity = int(hits_str)
                seconds = int(seconds_str)
            except ValueError as exc:  # pragma: no cover - guarded by config validation
                raise ValueError(f"Invalid rate limit spec entry: {entry!r}") from exc
            self.configure_bucket(
                f"{method.upper()} {path}",
                capacity=capacity,
                refill_period=timedelta(seconds=seconds),
            )

    def check(self, key: str, *, cost: float = 1.0) -> None:
        now = datetime.now(timezone.utc)
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                return
            retry_after = bucket.consume(cost, now)
        if retry_after > 0:
            raise RateLimitExceeded(retry_after)


class APIKeyStore:
    """Persistent API key store backed by a JSON file on disk."""

    def __init__(
        self,
        path: Path | str,
        *,
        default_rotation_interval: timedelta | None = None,
        default_grace_period: timedelta | None = None,
    ) -> None:
        self._path = Path(path)
        self._lock = RLock()
        self.default_rotation_interval = default_rotation_interval or timedelta(days=30)
        self.default_grace_period = default_grace_period or timedelta(hours=2)
        self._state: Dict[str, list[APIKeyRecord]] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            payload = json.loads(self._path.read_text("utf-8"))
        except json.JSONDecodeError as exc:  # pragma: no cover - configuration guard
            raise RuntimeError(f"Corrupted API key store: {self._path}") from exc
        for label, records in payload.items():
            self._state[label] = [APIKeyRecord.from_dict(item) for item in records]

    def _ensure_parent(self) -> None:
        directory = self._path.parent
        directory.mkdir(parents=True, exist_ok=True)

    def _flush(self) -> None:
        self._ensure_parent()
        temp_path = self._path.with_suffix(".tmp")
        payload = {
            label: [record.to_dict() for record in records]
            for label, records in self._state.items()
        }
        with temp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, self._path)
        os.chmod(self._path, 0o600)

    def list_keys(self, label: str) -> Iterable[APIKeyRecord]:
        with self._lock:
            return tuple(self._state.get(label, ()))

    def create_key(
        self,
        label: str,
        *,
        secret: str | None = None,
        rotation_interval: timedelta | None = None,
        grace_period: timedelta | None = None,
        metadata: Optional[MutableMapping[str, object]] = None,
    ) -> APIKeyRecord:
        now = datetime.now(timezone.utc)
        secret_value = secret or token_urlsafe(48)
        rotation = rotation_interval or self.default_rotation_interval
        grace = grace_period if grace_period is not None else self.default_grace_period
        metadata_dict: Dict[str, object] = dict(metadata or {})
        grace_until = now + grace if grace else None
        record = APIKeyRecord(
            secret=secret_value,
            created_at=now,
            rotation_interval=rotation,
            grace_until=grace_until,
            metadata=metadata_dict,
        )
        with self._lock:
            records = self._state.setdefault(label, [])
            records.append(record)
            if grace_period is not None:
                record.metadata.setdefault(
                    "grace_period_override_seconds", grace_period.total_seconds()
                )
            self._flush()
        LOGGER.info("Created API key", extra={"label": label})
        return record

    def delete_key(self, label: str, secret: str) -> bool:
        with self._lock:
            records = self._state.get(label)
            if not records:
                return False
            remaining = [record for record in records if record.secret != secret]
            if len(remaining) == len(records):
                return False
            self._state[label] = remaining
            self._flush()
            return True

    def rotate_key(
        self,
        label: str,
        *,
        grace_period: timedelta | None = None,
    ) -> APIKeyRecord:
        now = datetime.now(timezone.utc)
        with self._lock:
            records = self._state.get(label)
            if not records:
                raise KeyError(label)
            latest = records[-1]
            grace = grace_period if grace_period is not None else self.default_grace_period
            if grace:
                latest.grace_until = now + grace
                latest.metadata.setdefault("rotated_at", now.strftime(ISO_FORMAT))
            new_record = APIKeyRecord(
                secret=token_urlsafe(48),
                created_at=now,
                rotation_interval=latest.rotation_interval,
                grace_until=now + grace if grace else None,
                metadata={},
            )
            records.append(new_record)
            if grace_period is not None:
                new_record.metadata.setdefault(
                    "grace_period_override_seconds", grace_period.total_seconds()
                )
            self._flush()
        return new_record

    def verify(self, label: str, candidate: str) -> bool:
        now = datetime.now(timezone.utc)
        for record in self.list_keys(label):
            if not hmac.compare_digest(record.secret, candidate):
                continue
            if record.grace_until and record.grace_until < now:
                return False
            return True
        return False


def _parse_timedelta(raw: str | None, default: timedelta) -> timedelta:
    if raw is None:
        return default
    if isinstance(raw, timedelta):
        return raw
    raw = raw.strip()
    suffix = raw[-1]
    value = raw[:-1]
    factor: int
    if suffix == "s":
        factor = 1
    elif suffix == "m":
        factor = 60
    elif suffix == "h":
        factor = 3600
    elif suffix == "d":
        factor = 86400
    else:
        raise ValueError(f"Unsupported timedelta suffix: {suffix!r}")
    return timedelta(seconds=int(value) * factor)


def handle_api_key_cli(store: APIKeyStore, args: argparse.Namespace) -> object:
    """Dispatch helper used by the manage-keys CLI."""

    command = getattr(args, "command", None)
    if command == "create":
        rotation_interval = _parse_timedelta(
            getattr(args, "rotation_interval", None), store.default_rotation_interval
        )
        grace_period = None
        metadata: Dict[str, object] = {}
        if getattr(args, "grace_period", None):
            grace_period = _parse_timedelta(args.grace_period, store.default_grace_period)
        return store.create_key(
            args.label,
            secret=getattr(args, "secret", None),
            rotation_interval=rotation_interval,
            grace_period=grace_period,
            metadata=metadata or None,
        )
    if command == "delete":
        return store.delete_key(args.label, args.secret)
    if command == "rotate":
        grace_period = None
        if getattr(args, "grace_period", None):
            grace_period = _parse_timedelta(args.grace_period, store.default_grace_period)
        return store.rotate_key(args.label, grace_period=grace_period)
    if command == "list":
        return list(store.list_keys(args.label))
    raise ValueError(f"Unsupported command: {command}")
