"""Utility helpers for the gateway."""
from __future__ import annotations

from datetime import datetime, timezone
from email.utils import format_datetime
import hashlib
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import quote


class GatewayError(Exception):
    """Generic error raised when responding with an HTTP error."""

    def __init__(self, status: str, *, headers: Optional[list[tuple[str, str]]] = None, body: bytes = b"") -> None:
        super().__init__(status)
        self.status = status
        self.headers = headers or []
        self.body = body


def http_date(timestamp: float) -> str:
    """Return an HTTP-date string for *timestamp*."""
    return format_datetime(datetime.fromtimestamp(timestamp, tz=timezone.utc))


def ensure_within_root(root: Path, relative: Path) -> Path:
    """Ensure *relative* resolves within *root* and return the resolved path."""
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:  # pragma: no cover - defensive
        raise GatewayError("403 Forbidden", body=b"Forbidden\n") from exc
    return candidate


def sanitize_relative_path(raw: str) -> Path:
    """Sanitise an incoming path fragment for export resolution."""
    fragment = raw.lstrip("/")
    path = Path(fragment)
    if path.is_absolute() or ".." in path.parts:
        raise GatewayError("400 Bad Request", body=b"Invalid export path\n")
    return path


def compute_sha256(path: Path, *, chunk_size: int) -> str:
    """Compute a SHA-256 digest for *path*."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_disposition(filename: str) -> str:
    """Return an RFC 5987 compatible attachment header for *filename*."""
    safe_ascii = filename.encode("ascii", "ignore").decode("ascii")
    if not safe_ascii:
        safe_ascii = "export.zip"
    quoted_ascii = safe_ascii.replace("\\", "\\\\").replace('"', r'\"')
    encoded = quote(filename)
    return f"attachment; filename=\"{quoted_ascii}\"; filename*=UTF-8''{encoded}"


def file_iterator(handle, chunk_size: int) -> Iterable[bytes]:
    """Yield chunks from *handle* until exhaustion."""
    try:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        handle.close()


__all__ = [
    "GatewayError",
    "http_date",
    "ensure_within_root",
    "sanitize_relative_path",
    "compute_sha256",
    "content_disposition",
    "file_iterator",
]
