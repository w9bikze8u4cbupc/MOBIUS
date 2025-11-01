"""Audit logging utilities for MOBIUS gateways."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, Mapping, Optional, Protocol

logger = logging.getLogger(__name__)


class AuditStorage(Protocol):
    """Protocol for pluggable audit storage backends."""

    def append(self, record: Mapping[str, Any]) -> None:
        """Persist a record to the underlying store."""


class JSONLStorage:
    """File-based JSONL storage backend."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def append(self, record: Mapping[str, Any]) -> None:
        payload = json.dumps(record, sort_keys=True, separators=(",", ":"))
        with self._lock, self.path.open("a", encoding="utf-8") as handle:
            handle.write(payload + "\n")
            handle.flush()


@dataclass
class DigestSigner:
    """Utility for signing audit records with SHA256 HMAC."""

    secret: str

    def sign(self, payload: bytes) -> str:
        return hmac.new(self.secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    def sign_record(self, record: Mapping[str, Any]) -> str:
        canonical = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return self.sign(canonical)

    def verify(self, record: Mapping[str, Any], signature: str) -> bool:
        expected = self.sign_record(record)
        return hmac.compare_digest(expected, signature)


@dataclass
class AuditLogger:
    """High-level API for writing audit events."""

    storage: AuditStorage
    signer: Optional[DigestSigner] = None
    on_digest: Optional[Callable[[Mapping[str, Any]], None]] = None
    on_cdn: Optional[Callable[[Mapping[str, Any]], None]] = None
    on_request: Optional[Callable[[Mapping[str, Any]], None]] = None

    def _timestamp(self) -> str:
        return datetime.now(tz=timezone.utc).isoformat()

    def _augment(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        payload.setdefault("timestamp", self._timestamp())
        if self.signer is not None:
            payload["signature"] = self.signer.sign_record(payload)
        return payload

    def log_request(
        self,
        *,
        method: str,
        path: str,
        status_code: int,
        duration_ms: int,
        request_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        record: Dict[str, Any] = {
            "type": "request",
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": duration_ms,
        }
        if request_id:
            record["request_id"] = request_id
        if client_ip:
            record["client_ip"] = client_ip
        if user_agent:
            record["user_agent"] = user_agent
        if extra:
            record.update(extra)

        record = self._augment(record)
        self.storage.append(record)
        if self.on_request is not None:
            self.on_request(record)

    def log_digest_verification(
        self,
        *,
        artifact_id: str,
        expected_digest: str,
        observed_digest: str,
        status: str,
        source: str,
        artifact_kind: str,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        record: Dict[str, Any] = {
            "type": "digest_verification",
            "artifact_id": artifact_id,
            "expected_digest": expected_digest,
            "observed_digest": observed_digest,
            "status": status,
            "source": source,
            "artifact_kind": artifact_kind,
        }
        if extra:
            record.update(extra)

        record = self._augment(record)
        self.storage.append(record)
        if self.on_digest is not None:
            self.on_digest(record)

    def log_cdn_transfer(
        self,
        *,
        artifact_id: str,
        provider: str,
        cache_status: str,
        status_code: int,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        record: Dict[str, Any] = {
            "type": "cdn_transfer",
            "artifact_id": artifact_id,
            "provider": provider,
            "cache_status": cache_status,
            "status_code": status_code,
        }
        if extra:
            record.update(extra)

        record = self._augment(record)
        self.storage.append(record)
        if self.on_cdn is not None:
            self.on_cdn(record)


def build_default_storage(base_path: Optional[Path | str] = None) -> JSONLStorage:
    """Create a JSONL storage backend with a sensible default location."""

    directory = Path(base_path or "./logs")
    directory.mkdir(parents=True, exist_ok=True)
    return JSONLStorage(directory / "audit.jsonl")


__all__ = [
    "AuditLogger",
    "AuditStorage",
    "JSONLStorage",
    "DigestSigner",
    "build_default_storage",
]
