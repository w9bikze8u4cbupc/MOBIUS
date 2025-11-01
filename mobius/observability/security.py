"""Security utilities used across Mobius services.

This module provides two primary building blocks:

* An API key management helper that is able to persist keys to disk,
  rotate them with configurable grace windows, and expose small CLI
  helpers so operators can manage credentials without touching
  application code.
* A lightweight token bucket rate-limiting middleware that can be used
  by any synchronous Python web stack.  The implementation is purposely
  framework agnostic so it can be composed with custom request/response
  abstractions or wrapped by ASGI/WSGI adapters.

None of the helpers perform any I/O outside of the configured storage
path which keeps the functionality easily testable.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, MutableMapping, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# API key rotation helpers
# ---------------------------------------------------------------------------


class APIKeyRotationError(RuntimeError):
    """Raised when an API key operation cannot be completed."""


@dataclass
class APIKeyRecord:
    """Represents the lifecycle information for a single API key."""

    key_id: str
    secret: str
    created_at: datetime
    active_from: datetime
    rotation_due: datetime
    grace_until: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> Dict[str, Any]:
        def ts(value: Optional[datetime]) -> Optional[str]:
            return value.isoformat() if value else None

        return {
            "key_id": self.key_id,
            "secret": self.secret,
            "created_at": ts(self.created_at),
            "active_from": ts(self.active_from),
            "rotation_due": ts(self.rotation_due),
            "grace_until": ts(self.grace_until),
            "metadata": self.metadata,
        }

    @classmethod
    def from_json(cls, payload: MutableMapping[str, Any]) -> "APIKeyRecord":
        def parse(value: Optional[str]) -> Optional[datetime]:
            return datetime.fromisoformat(value) if value else None

        return cls(
            key_id=str(payload["key_id"]),
            secret=str(payload["secret"]),
            created_at=parse(payload.get("created_at")) or datetime.now(timezone.utc),
            active_from=parse(payload.get("active_from")) or datetime.now(timezone.utc),
            rotation_due=parse(payload.get("rotation_due"))
            or datetime.now(timezone.utc),
            grace_until=parse(payload.get("grace_until")),
            metadata=dict(payload.get("metadata") or {}),
        )


class APIKeyStore:
    """Manages API key lifecycles with optional audit logging."""

    def __init__(
        self,
        storage_path: os.PathLike[str] | str,
        *,
        default_rotation_interval: timedelta = timedelta(days=30),
        default_grace_period: timedelta = timedelta(hours=1),
        audit_logger: Optional[logging.Logger] = None,
    ) -> None:
        self.path = Path(storage_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.default_rotation_interval = default_rotation_interval
        self.default_grace_period = default_grace_period
        self._audit_logger = audit_logger or logger
        self._state: Dict[str, List[APIKeyRecord]] = {}
        self._load()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _load(self) -> None:
        if not self.path.exists():
            self._state = {}
            return
        with self.path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
        state: Dict[str, List[APIKeyRecord]] = {}
        for label, records in raw.get("keys", {}).items():
            state[label] = [APIKeyRecord.from_json(record) for record in records]
        self._state = state

    def _flush(self) -> None:
        payload = {
            "keys": {label: [record.to_json() for record in records] for label, records in self._state.items()}
        }
        tmp_path = self.path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        tmp_path.replace(self.path)

    # ------------------------------------------------------------------
    # Key lifecycle operations
    # ------------------------------------------------------------------

    def list_keys(self, label: str) -> List[APIKeyRecord]:
        with self._lock:
            return sorted(self._state.get(label, ()), key=lambda item: item.active_from)

    def _active_key(self, label: str) -> Optional[APIKeyRecord]:
        keys = self.list_keys(label)
        return keys[-1] if keys else None

    def create_key(
        self,
        label: str,
        *,
        secret: Optional[str] = None,
        rotation_interval: Optional[timedelta] = None,
        grace_period: Optional[timedelta] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> APIKeyRecord:
        """Create a brand-new key for a label."""

        now = datetime.now(timezone.utc)
        secret = secret or secrets.token_urlsafe(32)
        rotation_interval = rotation_interval or self.default_rotation_interval
        record = APIKeyRecord(
            key_id=secrets.token_hex(8),
            secret=secret,
            created_at=now,
            active_from=now,
            rotation_due=now + rotation_interval,
            metadata=metadata or {},
        )
        with self._lock:
            records = self._state.setdefault(label, [])
            records.append(record)
            self._flush()
        self._audit_logger.info("Created API key", extra={"label": label, "key_id": record.key_id})
        return record

    def rotate_key(
        self,
        label: str,
        *,
        secret: Optional[str] = None,
        grace_period: Optional[timedelta] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Tuple[APIKeyRecord, Optional[APIKeyRecord]]:
        """Rotate the active key for a label.

        Returns a tuple of ``(new_key, old_key)`` where ``old_key`` is ``None``
        if the rotation created the first key.
        """

        now = datetime.now(timezone.utc)
        grace_period = grace_period or self.default_grace_period
        with self._lock:
            previous = self._active_key(label)
            if previous:
                previous.grace_until = now + grace_period
                self._audit_logger.info(
                    "Marked key for grace period",
                    extra={"label": label, "key_id": previous.key_id, "grace_until": previous.grace_until.isoformat()},
                )
            new_key = self.create_key(
                label,
                secret=secret,
                rotation_interval=self.default_rotation_interval,
                metadata=metadata,
            )
            # ``create_key`` already persisted state; we only need to update
            # the previous record if present.
            if previous:
                for idx, record in enumerate(self._state[label]):
                    if record.key_id == previous.key_id:
                        self._state[label][idx] = previous
                        break
                self._flush()
        return new_key, previous

    def purge_expired(self) -> int:
        """Remove keys whose grace periods have elapsed."""

        cutoff = datetime.now(timezone.utc)
        removed = 0
        with self._lock:
            for label, records in list(self._state.items()):
                retained: List[APIKeyRecord] = []
                for record in records:
                    if record.grace_until and record.grace_until < cutoff:
                        removed += 1
                        self._audit_logger.info(
                            "Purged expired key",
                            extra={"label": label, "key_id": record.key_id},
                        )
                        continue
                    retained.append(record)
                if retained:
                    self._state[label] = retained
                else:
                    self._state.pop(label, None)
            if removed:
                self._flush()
        return removed

    def verify(self, label: str, candidate: str) -> bool:
        """Validate a candidate secret.

        Keys are considered valid if they are the active key or if the key is
        still inside the configured grace window.
        """

        now = datetime.now(timezone.utc)
        for record in self.list_keys(label):
            if record.secret != candidate:
                continue
            if record.grace_until and record.grace_until < now:
                return False
            return True
        return False

    # ------------------------------------------------------------------
    # Rotation helpers
    # ------------------------------------------------------------------

    def due_for_rotation(self, label: str) -> List[APIKeyRecord]:
        now = datetime.now(timezone.utc)
        return [
            record
            for record in self.list_keys(label)
            if record.rotation_due <= now and (record.grace_until is None or record.grace_until >= now)
        ]


def ensure_rotation_schedule(store: APIKeyStore, label: str) -> Optional[APIKeyRecord]:
    """Rotate the key if the schedule requires it.

    Returns the new key when a rotation took place or ``None`` when no
    changes were required.  This helper is intentionally separate from the
    :class:`APIKeyStore` so it can easily be used from cron jobs or CLI
    scripts.
    """

    due = store.due_for_rotation(label)
    if not due:
        return None
    new_key, _ = store.rotate_key(label)
    return new_key


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------


def _parse_timedelta(value: Optional[str], default: timedelta) -> timedelta:
    if not value:
        return default
    value = value.strip().lower()
    if not value:
        return default
    if value.isdigit():
        return timedelta(seconds=int(value))
    suffix_map = {"s": "seconds", "m": "minutes", "h": "hours", "d": "days"}
    unit = value[-1]
    magnitude = value[:-1]
    if magnitude.isdigit() and unit in suffix_map:
        return timedelta(**{suffix_map[unit]: int(magnitude)})
    if ":" in value:
        parts = [int(part) for part in value.split(":")]
        if len(parts) == 2:
            minutes, seconds = parts
            return timedelta(minutes=minutes, seconds=seconds)
        if len(parts) == 3:
            hours, minutes, seconds = parts
            return timedelta(hours=hours, minutes=minutes, seconds=seconds)
    raise APIKeyRotationError(f"Unsupported timedelta value: {value}")


def add_api_key_cli(subparsers: argparse._SubParsersAction) -> None:
    """Register API key management commands to an ``argparse`` parser."""

    create_parser = subparsers.add_parser("create", help="Create a new API key")
    create_parser.add_argument("label", help="Logical key label (e.g. 'gateway')")
    create_parser.add_argument("--secret", help="Optional secret to store")
    create_parser.add_argument(
        "--rotation-interval",
        dest="rotation_interval",
        help="Override the default rotation interval (supports suffixes like 30d, 12h)",
    )
    create_parser.add_argument(
        "--grace-period",
        dest="grace_period",
        help="Override the default grace period after rotation",
    )

    rotate_parser = subparsers.add_parser("rotate", help="Rotate the active API key")
    rotate_parser.add_argument("label", help="Logical key label to rotate")
    rotate_parser.add_argument("--secret", help="Optional secret to store for the new key")
    rotate_parser.add_argument(
        "--grace-period",
        dest="grace_period",
        help="Override the default grace period for the retiring key",
    )

    subparsers.add_parser("list", help="List stored API keys")
    subparsers.add_parser("purge", help="Remove keys whose grace window elapsed")


def handle_api_key_cli(store: APIKeyStore, args: argparse.Namespace) -> Optional[APIKeyRecord]:
    """Execute the command associated with :func:`add_api_key_cli`."""

    if args.command == "create":
        rotation_interval = _parse_timedelta(args.rotation_interval, store.default_rotation_interval)
        metadata = {}
        if getattr(args, "grace_period", None):
            grace_period = _parse_timedelta(args.grace_period, store.default_grace_period)
            metadata["grace_period_override_seconds"] = grace_period.total_seconds()
        record = store.create_key(
            args.label,
            secret=args.secret,
            rotation_interval=rotation_interval,
            metadata=metadata or None,
        )
        return record
    if args.command == "rotate":
        grace_period = _parse_timedelta(args.grace_period, store.default_grace_period)
        new_key, _ = store.rotate_key(args.label, secret=args.secret, grace_period=grace_period)
        return new_key
    if args.command == "list":
        for label in sorted(store._state.keys()):
            for record in store.list_keys(label):
                logger.info(
                    "Stored key",
                    extra={
                        "label": label,
                        "key_id": record.key_id,
                        "active_from": record.active_from.isoformat(),
                        "rotation_due": record.rotation_due.isoformat(),
                        "grace_until": record.grace_until.isoformat() if record.grace_until else None,
                    },
                )
        return None
    if args.command == "purge":
        store.purge_expired()
        return None
    raise APIKeyRotationError(f"Unsupported CLI command: {args.command}")


# ---------------------------------------------------------------------------
# Rate limiting middleware
# ---------------------------------------------------------------------------


@dataclass
class RateLimitRule:
    """Holds configuration for a token bucket."""

    capacity: int
    refill_seconds: float
    window_seconds: float

    @classmethod
    def from_ratio(cls, max_requests: int, window_seconds: float) -> "RateLimitRule":
        if max_requests <= 0:
            raise ValueError("max_requests must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        return cls(capacity=max_requests, refill_seconds=window_seconds / max_requests, window_seconds=window_seconds)


class TokenBucket:
    """Thread-safe token bucket implementation."""

    def __init__(self, rule: RateLimitRule) -> None:
        self.rule = rule
        self.tokens = float(rule.capacity)
        self.updated_at = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self.updated_at
        if elapsed <= 0:
            return
        refill_amount = elapsed / self.rule.refill_seconds
        if refill_amount > 0:
            self.tokens = min(self.rule.capacity, self.tokens + refill_amount)
            self.updated_at = now

    def consume(self, cost: float = 1.0) -> bool:
        with self._lock:
            self._refill()
            if self.tokens >= cost:
                self.tokens -= cost
                return True
            return False

    def retry_after(self) -> float:
        with self._lock:
            self._refill()
            missing = max(0.0, 1.0 - self.tokens)
            return missing * self.rule.refill_seconds


class RateLimitExceeded(PermissionError):
    """Raised when a request is over the configured budget."""

    def __init__(self, retry_after: float) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


class RateLimitMiddleware:
    """Framework agnostic rate limit middleware."""

    def __init__(
        self,
        rules: Dict[str, RateLimitRule],
        *,
        identifier_getter: Optional[Callable[[Any], str]] = None,
        time_provider: Callable[[], float] = time.time,
    ) -> None:
        self.rules = rules
        self.identifier_getter = identifier_getter or (lambda request: getattr(request, "client_id", "global"))
        self.time_provider = time_provider
        self._buckets: Dict[Tuple[str, str], TokenBucket] = {}
        self._lock = threading.Lock()

    def _bucket_for(self, key: str, identifier: str, rule: RateLimitRule) -> TokenBucket:
        bucket_key = (key, identifier)
        with self._lock:
            bucket = self._buckets.get(bucket_key)
            if bucket is None:
                bucket = TokenBucket(rule)
                self._buckets[bucket_key] = bucket
            return bucket

    def check(self, endpoint_key: str, request: Any) -> None:
        rule = self.rules.get(endpoint_key)
        if not rule:
            return
        identifier = self.identifier_getter(request)
        bucket = self._bucket_for(endpoint_key, identifier, rule)
        if not bucket.consume():
            raise RateLimitExceeded(bucket.retry_after())

    def wrap(self, handler: Callable[[Any], Any]) -> Callable[[Any], Any]:
        def wrapped(request: Any) -> Any:
            endpoint_key = getattr(request, "endpoint_key", None) or getattr(request, "path", "default")
            self.check(endpoint_key, request)
            return handler(request)

        return wrapped


def build_rate_limit_config(raw: Optional[str]) -> Dict[str, RateLimitRule]:
    """Parse rate limit configuration from an environment friendly string.

    The expected format is a comma separated list of ``<endpoint>=<count>/<window>``
    entries, for example ``"GET:/api/explain-chunk=60/60,POST:/save-project=30/120"``.
    """

    if not raw:
        return {}
    config: Dict[str, RateLimitRule] = {}
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            endpoint, ratio = chunk.split("=", 1)
            count_str, window_str = ratio.split("/", 1)
            count = int(count_str)
            window = float(window_str)
        except ValueError as exc:
            raise ValueError(f"Invalid rate limit configuration: {chunk!r}") from exc
        config[endpoint.strip()] = RateLimitRule.from_ratio(count, window)
    return config


__all__ = [
    "APIKeyRecord",
    "APIKeyRotationError",
    "APIKeyStore",
    "RateLimitExceeded",
    "RateLimitMiddleware",
    "RateLimitRule",
    "TokenBucket",
    "add_api_key_cli",
    "build_rate_limit_config",
    "ensure_rotation_schedule",
    "handle_api_key_cli",
]
