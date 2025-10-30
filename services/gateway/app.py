"""FastAPI application for serving export ZIP archives with robust caching."""
from __future__ import annotations

import hashlib
import os
import re
from email.utils import formatdate
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional, Set, Union

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response

_SAFE_EXPORT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*\\.zip$")
MAX_NAME_LEN = 128


def create_app(base_dir: Union[str, Path]) -> FastAPI:
    """Create a FastAPI app that serves ZIP exports from *base_dir*."""

    base_path = Path(base_dir).resolve()
    app = FastAPI()

    @app.get("/exports/{export_name}")
    def fetch_export(
        export_name: str, if_none_match: Optional[str] = Header(default=None)
    ) -> Response:
        candidate = _resolve_candidate(export_name, base_path)
        st = candidate.stat()
        etag = _compute_strong_etag(candidate, st)
        headers = _cache_headers(etag)
        headers["Last-Modified"] = formatdate(st.st_mtime, usegmt=True)
        headers["Content-Disposition"] = f'attachment; filename="{export_name}"'

        if if_none_match:
            validators = _parse_if_none_match(if_none_match)
            if "*" in validators or etag.strip('"') in validators:
                return Response(status_code=304, headers=headers)

        return FileResponse(
            candidate,
            media_type="application/zip",
            headers=headers,
        )

    @app.head("/exports/{export_name}")
    def head_export(
        export_name: str, if_none_match: Optional[str] = Header(default=None)
    ) -> Response:
        candidate = _resolve_candidate(export_name, base_path)
        st = candidate.stat()
        etag = _compute_strong_etag(candidate, st)
        headers = _cache_headers(etag)
        headers["Last-Modified"] = formatdate(st.st_mtime, usegmt=True)
        headers["Content-Disposition"] = f'attachment; filename="{export_name}"'

        if if_none_match:
            validators = _parse_if_none_match(if_none_match)
            if "*" in validators or etag.strip('"') in validators:
                return Response(status_code=304, headers=headers)

        return Response(status_code=200, headers=headers)

    return app


def _resolve_candidate(export_name: str, base_dir: Path) -> Path:
    """Validate *export_name* and return the resolved candidate path."""

    if len(export_name) > MAX_NAME_LEN:
        raise HTTPException(status_code=400, detail="Invalid export name")

    if not _SAFE_EXPORT_RE.fullmatch(export_name):
        raise HTTPException(status_code=400, detail="Invalid export name")

    candidate = (base_dir / export_name).resolve()
    try:
        candidate.relative_to(base_dir)
    except ValueError:  # pragma: no cover - safeguard for old Python versions
        raise HTTPException(status_code=400, detail="Invalid export name") from None

    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Export not found")

    return candidate


def _parse_if_none_match(header_value: str) -> Set[str]:
    """Parse an If-None-Match header into a set of validators."""

    validators: Set[str] = set()
    for part in header_value.split(","):
        token = part.strip()
        if not token:
            continue
        if token == "*":
            validators.add("*")
            continue
        if token.startswith("W/"):
            token = token[2:].strip()
        if token.startswith('"') and token.endswith('"') and len(token) >= 2:
            token = token[1:-1]
        validators.add(token)
    return validators


def _cache_headers(etag: str) -> Dict[str, str]:
    return {
        "ETag": etag,
        "Cache-Control": "public, max-age=3600, must-revalidate",
    }


@lru_cache(maxsize=256)
def _etag_for_fingerprint(path: Path, size: int, mtime_sec: int) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            sha.update(chunk)
    return f'"{sha.hexdigest()}"'


def _compute_strong_etag(path: Path, st: Optional[os.stat_result] = None) -> str:
    if st is None:
        st = path.stat()
    return _etag_for_fingerprint(path.resolve(), st.st_size, int(st.st_mtime))


__all__ = [
    "create_app",
    "_cache_headers",
    "_compute_strong_etag",
    "_parse_if_none_match",
    "_resolve_candidate",
]
