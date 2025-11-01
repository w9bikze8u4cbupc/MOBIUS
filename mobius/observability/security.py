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
        """
        Serialize the APIKeyRecord to a JSON-serializable dictionary.
        
        Returns:
            dict: Mapping with keys "key_id", "secret", "created_at", "active_from", "rotation_due", "grace_until", and "metadata". Datetime fields are ISO 8601 strings or `None`.
        """
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
        """
        Create an APIKeyRecord from a mapping produced by to_json, parsing ISO-formatted datetimes.
        
        Parameters:
            payload (MutableMapping[str, Any]): Mapping containing the fields produced by `to_json`. Expected keys include `key_id`, `secret`, and optional ISO-8601 strings for `created_at`, `active_from`, `rotation_due`, and `grace_until`; `metadata` may be any mapping.
        
        Returns:
            APIKeyRecord: A record populated from `payload`. Missing `created_at`, `active_from`, or `rotation_due` default to the current UTC time; `grace_until` will be None if absent; `metadata` defaults to an empty dict.
        """
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
        """
        Initialize an APIKeyStore that persists key state under the given storage path.
        
        Creates the storage directory if missing, initializes internal locks and in-memory state, sets default rotation and grace intervals, configures the audit logger, and loads any existing persisted keys.
        
        Parameters:
            storage_path (os.PathLike[str] | str): Filesystem path to the JSON file used for persistent storage.
            default_rotation_interval (timedelta): Default duration until a key is due for rotation when not overridden.
            default_grace_period (timedelta): Default grace window after rotation during which a previous key remains valid.
            audit_logger (Optional[logging.Logger]): Logger used for audit entries; if omitted the module-level logger is used.
        """
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
        """
        Load stored API key data from disk into the store's internal state.
        
        If the storage file does not exist, initializes an empty state. Otherwise reads JSON from the configured path, expects a top-level "keys" mapping of label -> list[record], and converts each record to an APIKeyRecord to populate the internal _state.
        """
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
        """
        Persist the in-memory API key state to disk atomically.
        
        Writes a JSON file at self.path containing a top-level "keys" mapping of label -> list of record dictionaries (as produced by each record's to_json). The file is written to a temporary path (self.path with a .tmp suffix) and then atomically replaced into place.
        """
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
        """
        Return the API key records for a given label sorted by their activation time.
        
        Parameters:
            label (str): Identifier for the key set (e.g., service or client label).
        
        Returns:
            List[APIKeyRecord]: APIKeyRecord instances ordered by `active_from` ascending (oldest first).
        """
        with self._lock:
            return sorted(self._state.get(label, ()), key=lambda item: item.active_from)

    def _active_key(self, label: str) -> Optional[APIKeyRecord]:
        """
        Return the most recently active API key record for the given label.
        
        @returns APIKeyRecord for the most recently active key for the given label, `None` if no keys exist.
        """
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
        """
        Create and persist a new API key record for the given label.
        
        Parameters:
            label (str): Logical label/grouping for the key.
            secret (Optional[str]): Secret value to use for the key; if omitted a secure random secret is generated.
            rotation_interval (Optional[timedelta]): Interval from now after which the key is due for rotation; defaults to the store's default_rotation_interval.
            grace_period (Optional[timedelta]): Accepted but not applied to the created record (reserved for rotation operations).
            metadata (Optional[Dict[str, Any]]): Arbitrary metadata to attach to the key record.
        
        Returns:
            APIKeyRecord: The newly created API key record. Persists the store state to disk and emits an audit log entry.
        """

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
        """
        Rotate the active API key for the given label, marking the previous key with a grace period and creating a new key.
        
        Parameters:
            label (str): The label/namespace whose key should be rotated.
            secret (Optional[str]): Optional secret to assign to the new key; if omitted a secret is generated.
            grace_period (Optional[timedelta]): Optional override for the grace window applied to the previous key; if omitted the store's default is used.
            metadata (Optional[Dict[str, Any]]): Optional metadata to attach to the new key record.
        
        Returns:
            tuple: `(new_key, previous_key)` where `new_key` is the newly created APIKeyRecord and `previous_key` is the prior APIKeyRecord or `None` if no previous key existed.
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
        """
        Remove API keys whose grace period has passed and persist the updated store.
        
        For each key whose `grace_until` is earlier than the current UTC time this method removes the key, emits an audit log entry for the purged key, and—if any keys were removed—flushes the updated state to disk.
        
        Returns:
            int: Number of keys removed.
        """

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
        """
        Determine whether a provided secret is valid for the given label.
        
        Checks stored keys for the label and returns True if a key's secret matches the candidate and the key is either active or still within its grace window.
        
        Parameters:
            label (str): Label/group the key belongs to.
            candidate (str): Secret string to validate.
        
        Returns:
            bool: `True` if the candidate matches an active key or a key whose grace window has not expired, `False` otherwise.
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
        """
        Identify API key records for a label that are due for rotation.
        
        Returns:
            List[APIKeyRecord]: Records whose `rotation_due` is at or before the current UTC time
            and whose `grace_until` is either `None` or not earlier than now.
        """
        now = datetime.now(timezone.utc)
        return [
            record
            for record in self.list_keys(label)
            if record.rotation_due <= now and (record.grace_until is None or record.grace_until >= now)
        ]


def ensure_rotation_schedule(store: APIKeyStore, label: str) -> Optional[APIKeyRecord]:
    """
    Ensure the API key for `label` is rotated if any existing key is due for rotation.
    
    Returns:
        The new APIKeyRecord when a rotation occurred, `None` otherwise.
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
    """
    Parse a human-friendly duration string into a timedelta.
    
    Accepts:
    - None or empty string -> returns `default`.
    - Integer string (e.g., "30") -> interpreted as seconds.
    - Suffix form with `s`, `m`, `h`, `d` (e.g., "5m", "2h") -> seconds/minutes/hours/days.
    - Colon-separated form "MM:SS" or "HH:MM:SS" (e.g., "02:30", "1:00:00").
    
    Parameters:
        value (Optional[str]): The duration string to parse.
        default (timedelta): The fallback timedelta returned when `value` is None or empty.
    
    Returns:
        timedelta: The parsed duration.
    
    Raises:
        APIKeyRotationError: If `value` is provided but does not match any supported format.
    """
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
    """
    Register API key management subcommands on an argparse subparsers object.
    
    Creates the following subcommands:
    - create: args: label, optional --secret, optional --rotation-interval, optional --grace-period
    - rotate: args: label, optional --secret, optional --grace-period
    - list: no arguments
    - purge: no arguments
    
    Parameters:
        subparsers (argparse._SubParsersAction): The result of ArgumentParser.add_subparsers() to which the commands will be attached.
    """

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
    """
    Execute API key management CLI subcommands.
    
    Parameters:
        store (APIKeyStore): The key store used to perform create, rotate, list, and purge operations.
        args (argparse.Namespace): Parsed CLI arguments specifying the command and options.
            Expected commands and relevant fields:
            - "create": requires `label`; optional `secret`, `rotation_interval`, `grace_period`.
            - "rotate": requires `label`; optional `secret`, `grace_period`.
            - "list": no additional fields required.
            - "purge": no additional fields required.
    
    Returns:
        APIKeyRecord or None: The newly created or rotated APIKeyRecord for "create" and "rotate" commands;
        `None` for "list" and "purge".
    
    Raises:
        APIKeyRotationError: If `args.command` is not one of the supported subcommands.
    """

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
        """
        Create a RateLimitRule that allows up to `max_requests` per `window_seconds`.
        
        Parameters:
            max_requests (int): Maximum number of requests allowed in the window; must be greater than 0.
            window_seconds (float): Length of the sliding window in seconds; must be greater than 0.
        
        Returns:
            RateLimitRule: A rule with `capacity` set to `max_requests`, `refill_seconds` chosen so the capacity is refilled evenly across the window, and `window_seconds` set to `window_seconds`.
        
        Raises:
            ValueError: If `max_requests` or `window_seconds` is not greater than 0.
        """
        if max_requests <= 0:
            raise ValueError("max_requests must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        return cls(capacity=max_requests, refill_seconds=window_seconds / max_requests, window_seconds=window_seconds)


class TokenBucket:
    """Thread-safe token bucket implementation."""

    def __init__(self, rule: RateLimitRule) -> None:
        """
        Initialize the token bucket with the provided rate limit rule.
        
        Parameters:
            rule (RateLimitRule): Configuration that defines bucket capacity and refill timing. The bucket starts full (tokens equal to `rule.capacity`) and uses a monotonic clock for refill calculations.
        """
        self.rule = rule
        self.tokens = float(rule.capacity)
        self.updated_at = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        """
        Update the bucket's token count based on elapsed monotonic time.
        
        Increases tokens according to elapsed / rule.refill_seconds, caps tokens at the rule's capacity, and advances the internal update timestamp when tokens change.
        """
        now = time.monotonic()
        elapsed = now - self.updated_at
        if elapsed <= 0:
            return
        refill_amount = elapsed / self.rule.refill_seconds
        if refill_amount > 0:
            self.tokens = min(self.rule.capacity, self.tokens + refill_amount)
            self.updated_at = now

    def consume(self, cost: float = 1.0) -> bool:
        """
        Attempt to consume the specified number of tokens from the bucket.
        
        Parameters:
            cost (float): Number of tokens to consume from the bucket (defaults to 1.0).
        
        Returns:
            bool: `True` if the requested tokens were available and were consumed, `False` otherwise.
        """
        with self._lock:
            self._refill()
            if self.tokens >= cost:
                self.tokens -= cost
                return True
            return False

    def retry_after(self) -> float:
        """
        Compute how many seconds remain until one token will be available in the bucket.
        
        Returns:
            float: Seconds to wait until a single token is available according to the bucket's current token count and refill rate; `0.0` if at least one token is already available.
        """
        with self._lock:
            self._refill()
            missing = max(0.0, 1.0 - self.tokens)
            return missing * self.rule.refill_seconds


class RateLimitExceeded(PermissionError):
    """Raised when a request is over the configured budget."""

    def __init__(self, retry_after: float) -> None:
        """
        Initialize the RateLimitExceeded exception with a recommended retry delay.
        
        Parameters:
            retry_after (float): Seconds the client should wait before retrying; stored on the exception as `retry_after`.
        """
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
        """
        Initialize the rate limit middleware with per-endpoint rules and dependency hooks.
        
        Parameters:
            rules (Dict[str, RateLimitRule]): Mapping of endpoint keys to their rate limit rules.
            identifier_getter (Optional[Callable[[Any], str]]): Function that extracts an identifier from a request (e.g., client id); defaults to using request.client_id or "global".
            time_provider (Callable[[], float]): Function returning current time in seconds used for bucket refill calculations; defaults to time.time.
        """
        self.rules = rules
        self.identifier_getter = identifier_getter or (lambda request: getattr(request, "client_id", "global"))
        self.time_provider = time_provider
        self._buckets: Dict[Tuple[str, str], TokenBucket] = {}
        self._lock = threading.Lock()

    def _bucket_for(self, key: str, identifier: str, rule: RateLimitRule) -> TokenBucket:
        """
        Get or create the TokenBucket associated with an endpoint key and identifier.
        
        Parameters:
            key (str): Endpoint-specific key used to partition buckets.
            identifier (str): Client or entity identifier used to scope the bucket.
            rule (RateLimitRule): Rate limit rule to apply when creating a new bucket.
        
        Returns:
            TokenBucket: The existing or newly created token bucket for the (key, identifier) pair.
        """
        bucket_key = (key, identifier)
        with self._lock:
            bucket = self._buckets.get(bucket_key)
            if bucket is None:
                bucket = TokenBucket(rule)
                self._buckets[bucket_key] = bucket
            return bucket

    def check(self, endpoint_key: str, request: Any) -> None:
        """
        Enforces the configured rate limit for the given endpoint and request.
        
        Looks up the rule for endpoint_key, obtains the token bucket for the identifier derived from request, and raises RateLimitExceeded when the bucket cannot provide a token.
        
        Parameters:
            endpoint_key (str): Key used to select the rate limit rule for this request.
            request (Any): Request-like object passed to the configured identifier_getter to derive the client identifier.
        
        Raises:
            RateLimitExceeded: When the request exceeds the rate limit; the exception's `retry_after` indicates seconds to wait before retry.
        """
        rule = self.rules.get(endpoint_key)
        if not rule:
            return
        identifier = self.identifier_getter(request)
        bucket = self._bucket_for(endpoint_key, identifier, rule)
        if not bucket.consume():
            raise RateLimitExceeded(bucket.retry_after())

    def wrap(self, handler: Callable[[Any], Any]) -> Callable[[Any], Any]:
        """
        Wraps a request handler so that the middleware enforces rate limits before invoking it.
        
        Parameters:
            handler (Callable[[Any], Any]): A callable that accepts a request object and returns a response.
        
        Returns:
            Callable[[Any], Any]: A new callable that extracts an endpoint key from the request, applies rate limiting, then calls `handler` and returns its result.
        
        Raises:
            RateLimitExceeded: If the request exceeds the configured rate limit for the resolved endpoint/identifier.
        """
        def wrapped(request: Any) -> Any:
            endpoint_key = getattr(request, "endpoint_key", None) or getattr(request, "path", "default")
            self.check(endpoint_key, request)
            return handler(request)

        return wrapped


def build_rate_limit_config(raw: Optional[str]) -> Dict[str, RateLimitRule]:
    """
    Parse an environment-style rate limit string into a mapping of endpoints to RateLimitRule.
    
    The expected format is a comma-separated list of "<endpoint>=<count>/<window>" entries
    (e.g. "GET:/api/explain-chunk=60/60,POST:/save-project=30/120"). `count` is the
    maximum requests per window and `window` is specified in seconds (may be integer or float).
    
    Parameters:
        raw (Optional[str]): The raw configuration string or None/empty to indicate no limits.
    
    Returns:
        Dict[str, RateLimitRule]: Mapping from endpoint string to a RateLimitRule instance.
    
    Raises:
        ValueError: If any chunk does not match the required "<endpoint>=<count>/<window>" format
                    or if `count`/`window` cannot be parsed as int/float respectively.
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