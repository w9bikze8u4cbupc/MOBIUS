"""Audit logging helpers for the gateway observability layer."""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
import hashlib
import hmac
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Optional, Protocol

logger = logging.getLogger(__name__)


class AuditStorage(Protocol):
    """Protocol that describes the storage interface used for audit records."""

    def append(self, record: Mapping[str, Any]) -> None:
        """Persist an audit record."""


class JSONLStorage:
    """Thread-safe JSON lines storage implementation."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def append(self, record: Mapping[str, Any]) -> None:
        """Persist a record to disk without interrupting the caller on error."""

        try:
            payload = json.dumps(record, sort_keys=True, separators=(",", ":"))
            with self._lock, self.path.open("a", encoding="utf-8") as handle:
                handle.write(payload + "\n")
                handle.flush()
        except (IOError, OSError) as exc:  # pragma: no cover - defensive logging
            logger.error("Failed to append audit record to %s: %s", self.path, exc)


@dataclass
class AuditSigner:
    """HMAC signer used to attach integrity metadata to audit records."""

    secret: bytes
    algorithm: str = "sha256"

    def sign(self, payload: str) -> str:
        """Return the signature for the given canonical JSON payload."""

        algorithm = getattr(hashlib, self.algorithm, hashlib.sha256)
        digest = hmac.new(self.secret, payload.encode("utf-8"), algorithm)
        return digest.hexdigest()

    def verify(self, payload: str, signature: str) -> bool:
        """Return ``True`` if the signature matches the payload."""

        expected = self.sign(payload)
        return hmac.compare_digest(expected, signature)


class AuditLogger:
    """High level helper that emits audit records with optional signing."""

    reserved_fields = {"type", "timestamp", "signature"}

    def __init__(self, storage: AuditStorage, signer: Optional[AuditSigner] = None) -> None:
        self._storage = storage
        self._signer = signer

    def _append(self, record: MutableMapping[str, Any], extra: Optional[Mapping[str, Any]]) -> None:
        if extra:
            safe_extra = {key: value for key, value in extra.items() if key not in self.reserved_fields}
            record.update(safe_extra)
            if len(safe_extra) < len(extra):
                logger.warning("Ignored reserved keys in extra: %s", set(extra) & self.reserved_fields)
        payload = json.dumps(record, sort_keys=True, separators=(",", ":"))
        if self._signer:
            record["signature"] = self._signer.sign(payload)
        self._storage.append(record)

    def _timestamp(self) -> float:
        return time.time()

    def log_request(
        self,
        *,
        route: str,
        method: str,
        status_code: int,
        content_length: int,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """Store an audit entry for an HTTP request."""

        record: MutableMapping[str, Any] = {
            "type": "http_request",
            "timestamp": self._timestamp(),
            "route": route,
            "method": method,
            "status_code": status_code,
            "content_length": content_length,
        }
        self._append(record, extra)

    def log_digest_verification(
        self,
        *,
        artifact_id: str,
        digest: str,
        result: str,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """Store an audit entry for a digest verification event."""

        record: MutableMapping[str, Any] = {
            "type": "digest_verification",
            "timestamp": self._timestamp(),
            "artifact_id": artifact_id,
            "digest": digest,
            "result": result,
        }
        self._append(record, extra)

    def log_cdn_event(
        self,
        *,
        provider: str,
        cache_status: str,
        status_code: int,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """Store an audit entry for CDN transfer events."""

        record: MutableMapping[str, Any] = {
            "type": "cdn_event",
            "timestamp": self._timestamp(),
            "provider": provider,
            "cache_status": cache_status,
            "status_code": status_code,
        }
        self._append(record, extra)


__all__ = ["AuditLogger", "AuditSigner", "AuditStorage", "JSONLStorage"]
