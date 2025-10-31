"""File and hashing utilities for gateway routes."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Dict, Iterator, Optional
import unicodedata

from .config import SETTINGS


@dataclass
class FileMetadata:
    path: Path
    size: int
    mtime: float
    etag: str
    last_modified: str


_ETAG_CACHE: Dict[Path, FileMetadata] = {}


class ExportNotFound(FileNotFoundError):
    """Raised when an export cannot be located or is invalid."""


def _sanitize_export_name(name: str) -> str:
    if not name:
        raise ExportNotFound("Empty export name")
    if "/" in name or "\\" in name:
        raise ExportNotFound("Nested paths are not allowed")
    if name.startswith('.'):
        raise ExportNotFound("Hidden files not permitted")
    return name


def resolve_export(name: str) -> Path:
    safe_name = _sanitize_export_name(name)
    candidate = SETTINGS.export_root / f"{safe_name}.zip"
    candidate = candidate.resolve()
    if SETTINGS.export_root not in candidate.parents and candidate != SETTINGS.export_root:
        raise ExportNotFound("Resolved path outside export root")
    if not candidate.is_file():
        raise ExportNotFound(f"Export '{safe_name}' not found")
    return candidate


def compute_etag(path: Path) -> FileMetadata:
    cached = _ETAG_CACHE.get(path)
    stat = path.stat()
    if cached and cached.mtime == stat.st_mtime and cached.size == stat.st_size:
        return cached

    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(SETTINGS.chunk_size), b""):
            digest.update(chunk)
    etag_value = digest.hexdigest()
    last_modified = format_datetime(
        datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
    )
    metadata = FileMetadata(
        path=path,
        size=stat.st_size,
        mtime=stat.st_mtime,
        etag=etag_value,
        last_modified=last_modified,
    )
    _ETAG_CACHE[path] = metadata
    return metadata


def iter_file_chunks(path: Path) -> Iterator[bytes]:
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(SETTINGS.chunk_size)
            if not chunk:
                break
            yield chunk


def should_return_not_modified(request_headers: Dict[str, str], metadata: FileMetadata) -> bool:
    if_none_match = _get_header(request_headers, "If-None-Match")
    if if_none_match:
        for candidate in if_none_match.split(","):
            if _normalise_etag(candidate) == metadata.etag:
                return True
    if_modified_since = _get_header(request_headers, "If-Modified-Since")
    if if_modified_since:
        try:
            since = parsedate_to_datetime(if_modified_since)
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
            resource_time = datetime.fromtimestamp(metadata.mtime, tz=timezone.utc)
            resource_time = resource_time.replace(microsecond=0)
            if resource_time <= since:
                return True
        except (TypeError, ValueError):
            pass
    return False


def _normalise_etag(value: str) -> str:
    value = value.strip()
    if value.startswith("W/"):
        value = value[2:]
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
    return value


def _get_header(headers: Dict[str, str], target: str) -> Optional[str]:
    for key, value in headers.items():
        if key.lower() == target.lower():
            return value
    return None


def ascii_fallback(name: str) -> str:
    normalised = unicodedata.normalize("NFKD", name)
    encoded = normalised.encode("ascii", "ignore").decode("ascii")
    cleaned = encoded or "export"
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in cleaned)


def signature_body(metadata: FileMetadata) -> str:
    return metadata.etag

