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
        """
        Persist a mapping as a single line in the storage file using JSON Lines format.
        
        The record is serialized to compact JSON with keys sorted, written as one newline-terminated line, and flushed to the underlying file. The write is protected by the instance's lock to be safe for concurrent callers.
        
        Parameters:
            record (Mapping[str, Any]): A JSON-serializable mapping representing the audit event to persist.
        """


class JSONLStorage:
    """File-based JSONL storage backend."""

    def __init__(self, path: Path | str):
        """
        Initialize the JSONLStorage with a target file path, ensuring its directory exists and preparing a thread lock.
        
        Parameters:
            path (Path | str): Filesystem path to the JSONL file where records will be appended. The parent directory will be created if it does not exist.
        """
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def append(self, record: Mapping[str, Any]) -> None:
        """
        Append a mapping as a single compact JSON line to the storage file.
        
        The mapping is serialized to compact JSON with keys sorted, written atomically under an instance lock, followed by a newline and a flush to the file.
        
        Parameters:
            record (Mapping[str, Any]): The audit record to persist; must be JSON-serializable.
        """
        payload = json.dumps(record, sort_keys=True, separators=(",", ":"))
        with self._lock, self.path.open("a", encoding="utf-8") as handle:
            handle.write(payload + "\n")
            handle.flush()


@dataclass
class DigestSigner:
    """Utility for signing audit records with SHA256 HMAC."""

    secret: str

    def sign(self, payload: bytes) -> str:
        """
        Compute an HMAC-SHA256 signature of the given payload using the signer's secret.
        
        Parameters:
        	payload (bytes): The raw bytes to be signed.
        
        Returns:
        	signature (str): Hex-encoded HMAC-SHA256 digest of the payload using the configured secret.
        """
        return hmac.new(self.secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    def sign_record(self, record: Mapping[str, Any]) -> str:
        """
        Create a hex-encoded HMAC-SHA256 signature for the given audit record's canonical JSON representation.
        
        Parameters:
            record (Mapping[str, Any]): Mapping representing the audit record to sign; the record is canonicalized to compact JSON with sorted keys before signing.
        
        Returns:
            str: Hexadecimal HMAC-SHA256 digest of the canonical JSON bytes.
        """
        canonical = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return self.sign(canonical)

    def verify(self, record: Mapping[str, Any], signature: str) -> bool:
        """
        Check whether a given HMAC-SHA256 signature matches the provided audit record.
        
        Parameters:
            record (Mapping[str, Any]): Audit record whose canonical JSON form will be signed for verification.
            signature (str): Hex-encoded HMAC-SHA256 digest to compare against.
        
        Returns:
            `true` if the signature matches the record's computed signature, `false` otherwise.
        """
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
        """
        Produce the current UTC time as an ISO 8601-formatted string.
        
        Returns:
            str: ISO 8601-formatted UTC timestamp including UTC offset (+00:00).
        """
        return datetime.now(tz=timezone.utc).isoformat()

    def _augment(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Attach a timestamp and, if a signer is configured, a signature to an audit payload.
        
        Parameters:
            payload (Dict[str, Any]): Audit record to augment; if it lacks a "timestamp" key one will be added.
        
        Returns:
            Dict[str, Any]: The same mapping after augmentation — ensures a "timestamp" is present and adds a "signature" key when a signer is set.
        """
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
        """
        Create and persist an audit record for an HTTP request event.
        
        Constructs a record with type "request" including method, path, status_code, and duration_ms, optionally adds request_id, client_ip, user_agent, and merges any keys from `extra`, then augments (adds timestamp and optional signature) and writes the record to the configured storage; invokes the on_request callback if provided.
        
        Parameters:
            method (str): HTTP method (e.g., "GET", "POST").
            path (str): Request path or URL.
            status_code (int): HTTP response status code.
            duration_ms (int): Request duration in milliseconds.
            request_id (Optional[str]): Optional request identifier to include.
            client_ip (Optional[str]): Optional client IP address to include.
            user_agent (Optional[str]): Optional User-Agent string to include.
            extra (Optional[Mapping[str, Any]]): Optional mapping whose key/value pairs are merged into the record (may overwrite existing keys).
        """
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
        """
        Create and persist an audit record for a digest verification event and notify the configured digest callback.
        
        Parameters:
            artifact_id (str): Identifier of the artifact being verified.
            expected_digest (str): The expected digest value for the artifact.
            observed_digest (str): The digest value observed during verification.
            status (str): Outcome of the verification (e.g., "match", "mismatch", "error").
            source (str): Origin of the verification result (e.g., service, CDN, external verifier).
            artifact_kind (str): Type or category of the artifact (e.g., "package", "image").
            extra (Optional[Mapping[str, Any]]): Additional fields to merge into the audit record.
        """
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
        """
        Record a CDN transfer event and persist it to the configured storage.
        
        The record will be augmented (timestamp and optional signature) before being appended to storage, and the `on_cdn` callback will be invoked with the final record if one is configured.
        
        Parameters:
            artifact_id (str): Identifier of the transferred artifact.
            provider (str): CDN provider name or identifier.
            cache_status (str): Cache outcome (e.g., "HIT", "MISS", "STALE").
            status_code (int): HTTP status code returned by the CDN or origin.
            extra (Optional[Mapping[str, Any]]): Additional fields to merge into the record.
        """
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
    """
    Create a JSONL storage backend at a sensible default location.
    
    Parameters:
        base_path (Optional[Path | str]): Base directory for the audit log file. If omitted, uses "./logs".
    
    Returns:
        JSONLStorage: Storage that writes to "<base_path>/audit.jsonl" (or "./logs/audit.jsonl" when `base_path` is omitted). The directory is created if it does not exist.
    """

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