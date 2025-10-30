"""FastAPI gateway exposing exported ZIP artifacts."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Dict, Optional, Set, Union

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.responses import FileResponse

SAFE_ZIP_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*\\.zip$")

DEFAULT_EXPORT_ROOT = Path(os.getenv("EXPORT_ROOT", "./exports")).resolve()


def _compute_strong_etag(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            sha.update(chunk)
    # Return a **quoted** strong validator per RFC 7232
    return f'"{sha.hexdigest()}"'


def _cache_headers(etag: str) -> Dict[str, str]:
    return {
        "ETag": etag,
        # Conservative but useful public caching; revalidate with ETag.
        "Cache-Control": "public, max-age=3600, must-revalidate",
    }


def _parse_if_none_match(value: str) -> Set[str]:
    """Parse If-None-Match into a set of (unquoted) validators.

    Handles:
      - multiple validators: `"tag1", W/"tag2"`
      - weak validators (W/) — treated as their underlying tag for simplicity
      - quoted strings
    """
    out: Set[str] = set()
    for part in value.split(","):
        tag = part.strip()
        if not tag:
            continue
        # Weak: W/"etag"
        if tag.startswith('W/"') and tag.endswith('"'):
            tag = tag[3:-1]
        # Strong: "etag"
        elif tag.startswith('"') and tag.endswith('"'):
            tag = tag[1:-1]
        out.add(tag)
    return out


def _resolve_candidate(export_name: str, base_dir: Path) -> Path:
    if not SAFE_ZIP_RE.match(export_name):
        raise HTTPException(status_code=400, detail="invalid export name")

    candidate = base_dir / export_name
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="export not found")

    return candidate


def create_app(base_dir: Optional[Union[str, Path]] = None) -> FastAPI:
    root = Path(base_dir) if base_dir is not None else DEFAULT_EXPORT_ROOT
    root = root.resolve()

    app = FastAPI()

    @app.get("/health")
    def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/exports/{export_name}")
    def fetch_export(
        export_name: str, if_none_match: Optional[str] = Header(default=None)
    ) -> Response:
        candidate = _resolve_candidate(export_name, root)
        etag = _compute_strong_etag(candidate)
        headers = _cache_headers(etag)
        if if_none_match:
            validators = _parse_if_none_match(if_none_match)
            # Our strong ETag is quoted; compare against unquoted tokens.
            if etag.strip('"') in validators:
                return Response(status_code=304, headers=headers)
        return FileResponse(candidate, media_type="application/zip", headers=headers)

    @app.head("/exports/{export_name}")
    def head_export(
        export_name: str, if_none_match: Optional[str] = Header(default=None)
    ) -> Response:
        candidate = _resolve_candidate(export_name, root)
        etag = _compute_strong_etag(candidate)
        headers = _cache_headers(etag)
        if if_none_match:
            validators = _parse_if_none_match(if_none_match)
            if etag.strip('"') in validators:
                return Response(status_code=304, headers=headers)
        return Response(status_code=200, headers=headers)

    return app


app = create_app()

__all__ = ["SAFE_ZIP_RE", "DEFAULT_EXPORT_ROOT", "app", "create_app"]
