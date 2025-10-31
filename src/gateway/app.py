"""FastAPI application serving generated exports with cache-aware responses."""
from __future__ import annotations

import os
import re
import hashlib
from email.utils import formatdate
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import quote_from_bytes

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response

SAFE_ZIP = re.compile(r"^[a-z0-9][a-z0-9._-]*\\.zip$")
DEFAULT_EXPORTS_DIR = Path(__file__).resolve().parent / "exports"
EXPORTS_DIR = Path(os.environ.get("EXPORTS_DIR", DEFAULT_EXPORTS_DIR)).resolve()
USE_STRONG_ETAG = os.environ.get("GATEWAY_STRONG_ETAG", "").lower() in {"1", "true", "on"}
CHUNK_SIZE = 1 << 20

app = FastAPI(title="Mobius Export Gateway")


def _parse_etag(value: str) -> Optional[Tuple[bool, str]]:
    value = value.strip()
    if not value:
        return None
    weak = False
    if value.startswith("W/"):
        weak = True
        value = value[2:]
    if len(value) < 2 or value[0] != '"' or value[-1] != '"':
        return None
    return weak, value[1:-1]


def _if_none_match_allows_not_modified(header_value: Optional[str], current_etag: str) -> bool:
    if not header_value:
        return False
    header_value = header_value.strip()
    if header_value == "*":
        return True

    parsed_current = _parse_etag(current_etag)
    if not parsed_current:
        return False
    _, current_value = parsed_current

    for candidate in header_value.split(','):
        parsed = _parse_etag(candidate)
        if not parsed:
            continue
        _, candidate_value = parsed
        if candidate_value == current_value:
            return True
    return False


def _quote_filename(filename: str) -> str:
    return filename.replace("\\", "\\\\").replace('"', r'\"')


def _fallback_filename(filename: str) -> str:
    fallback_chars = []
    for char in filename:
        if 32 <= ord(char) < 127 and char not in {'"', '\\'}:
            fallback_chars.append(char)
        else:
            fallback_chars.append('_')
    fallback = ''.join(fallback_chars)
    return fallback or "download.zip"


def _content_disposition(filename: str) -> str:
    fallback = _fallback_filename(filename)
    quoted_fallback = _quote_filename(fallback)
    utf8_filename = quote_from_bytes(filename.encode("utf-8"))
    return f'attachment; filename="{quoted_fallback}"; filename*=UTF-8''{utf8_filename}'


def _strong_etag(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return f'"{digest.hexdigest()}"'


def _weak_etag(path: Path) -> str:
    stat = path.stat()
    return f'W/"{stat.st_mtime_ns}-{stat.st_size}"'


def _cache_headers(path: Path) -> Dict[str, str]:
    stat = path.stat()
    etag = _strong_etag(path) if USE_STRONG_ETAG else _weak_etag(path)
    return {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Length": str(stat.st_size),
        "Last-Modified": formatdate(stat.st_mtime, usegmt=True),
        "ETag": etag,
    }


def _resolve_export_path(export_path: str) -> Path:
    try:
        requested = Path(export_path)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Export not found") from exc

    if requested.is_absolute() or any(part in {"..", ""} for part in requested.parts):
        raise HTTPException(status_code=404, detail="Export not found")

    filename = requested.name
    if not SAFE_ZIP.fullmatch(filename):
        raise HTTPException(status_code=404, detail="Export not found")

    candidate = (EXPORTS_DIR / requested).resolve()
    try:
        candidate.relative_to(EXPORTS_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Export not found") from exc

    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Export not found")

    return candidate


def _not_modified_response(headers: Dict[str, str]) -> Response:
    headers = dict(headers)
    headers.pop("Content-Length", None)
    return Response(status_code=304, headers=headers)


def _head_response(headers: Dict[str, str]) -> Response:
    return Response(status_code=200, headers=headers)


def _serve_export(request: Request, export_path: str, head: bool = False) -> Response:
    path = _resolve_export_path(export_path)
    headers = _cache_headers(path)

    if _if_none_match_allows_not_modified(request.headers.get("if-none-match"), headers["ETag"]):
        return _not_modified_response(headers)

    headers = dict(headers)
    headers["Content-Disposition"] = _content_disposition(path.name)

    if head:
        return _head_response(headers)

    return FileResponse(path, headers=headers, media_type="application/zip")


@app.get("/exports/{export_path:path}")
def download_export(request: Request, export_path: str) -> Response:
    return _serve_export(request, export_path, head=False)


@app.head("/exports/{export_path:path}")
def head_export(request: Request, export_path: str) -> Response:
    return _serve_export(request, export_path, head=True)


__all__ = ["app"]
