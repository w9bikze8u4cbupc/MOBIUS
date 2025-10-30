"""FastAPI application serving exported files with cache-friendly headers."""

from __future__ import annotations

import hashlib
import os
from email.utils import formatdate
from pathlib import Path
from typing import Dict, Iterable, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response


EXPORTS_DIR = Path(os.environ.get("EXPORTS_DIR", "exports")).resolve()

USE_STRONG_ETAG = os.environ.get("GATEWAY_STRONG_ETAG", "0").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_ETAG_CACHE: Dict[tuple[Path, int, int], str] = {}


app = FastAPI()


def _normalized_token(value: str) -> str:
    token = value.strip()
    if token.startswith("W/"):
        token = token[2:]
    if len(token) >= 2 and token[0] == '"' and token[-1] == '"':
        token = token[1:-1]
    return token


def _iter_if_none_match(header_value: str) -> Iterable[str]:
    for part in header_value.split(","):
        token = part.strip()
        if token:
            yield token


def _maybe_304(
    if_none_match: Optional[str], etag: str, headers: Dict[str, str]
) -> Optional[Response]:
    """Return a 304 when client's validators match current representation."""

    if not if_none_match:
        return None

    trimmed = if_none_match.strip()
    if trimmed == "*":
        return Response(status_code=304, headers=headers)

    current = _normalized_token(etag)
    for part in _iter_if_none_match(if_none_match):
        if part == "*":
            return Response(status_code=304, headers=headers)
        if _normalized_token(part) == current:
            return Response(status_code=304, headers=headers)
    return None


def _strong_etag(path: Path, stat: os.stat_result) -> str:
    key = (path, stat.st_size, int(stat.st_mtime))
    cached = _ETAG_CACHE.get(key)
    if cached is not None:
        return cached

    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8192), b""):
            digest.update(chunk)

    tag = f'"{digest.hexdigest()}"'
    _ETAG_CACHE.clear()
    _ETAG_CACHE[key] = tag
    return tag


def _cache_headers(path: Path) -> Dict[str, str]:
    """Generate cache headers for the given file path."""

    stat = path.stat()
    etag = (
        _strong_etag(path, stat)
        if USE_STRONG_ETAG
        else f'W/"{stat.st_mtime_ns}-{stat.st_size}"'
    )

    return {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Disposition": f'attachment; filename="{path.name}"',
        "Content-Length": str(stat.st_size),
        "ETag": etag,
        "Last-Modified": formatdate(stat.st_mtime, usegmt=True),
    }


def _resolve_export_path(export_path: str) -> Path:
    if not export_path or export_path.startswith("/"):
        raise HTTPException(status_code=404)

    candidate = (EXPORTS_DIR / export_path).resolve()
    try:
        candidate.relative_to(EXPORTS_DIR)
    except ValueError as exc:  # pragma: no cover - defensive hardening
        raise HTTPException(status_code=404) from exc

    if not candidate.is_file():
        raise HTTPException(status_code=404)

    return candidate


def _serve_export(export_path: str, if_none_match: Optional[str]) -> Response:
    target = _resolve_export_path(export_path)
    headers = _cache_headers(target)
    cached = _maybe_304(if_none_match, headers["ETag"], headers)
    if cached is not None:
        return cached

    return FileResponse(target, filename=target.name, headers=headers)


@app.get("/exports/{export_path:path}")
async def get_export(
    export_path: str, if_none_match: Optional[str] = Header(default=None)
):
    return _serve_export(export_path, if_none_match)


@app.head("/exports/{export_path:path}")
async def head_export(
    export_path: str, if_none_match: Optional[str] = Header(default=None)
):
    return _serve_export(export_path, if_none_match)

