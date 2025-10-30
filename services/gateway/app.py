"""FastAPI gateway exposing exported ZIP artifacts.

Key features
------------
* Strict, lower-case ``.zip`` filename validation (no path separators).
* Secure path resolution confined to a configured export root.
* SHA-256 **strong** ETag generation with HTTP conditional GET/HEAD.
* Cache headers: ``Cache-Control: public, max-age=3600, must-revalidate``.
* Lightweight ETag memoization keyed by file (path, size, mtime).
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Dict, Optional, Set, Tuple, Union, cast

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.responses import FileResponse

SAFE_ZIP_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*\.zip$")
DEFAULT_EXPORT_ROOT = Path(os.environ.get("EXPORT_ROOT", "./exports")).resolve()

# ETag memoization: (path, size, mtime) -> quoted sha256 hex
_ETAG_MEMO: Dict[Tuple[Path, int, int], str] = {}


def _resolve_export_root(export_root: Optional[Union[str, os.PathLike[str], Path]]) -> Path:
    """Resolve and validate the export root directory."""

    root = Path(export_root) if export_root is not None else DEFAULT_EXPORT_ROOT
    root = root.resolve()
    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)
    if not root.is_dir():
        raise RuntimeError(f"Configured export root '{root}' is not a directory")
    return root


def _validate_name(export_name: str) -> None:
    """Ensure the candidate name is a lower-case ``.zip`` with no separators."""

    if not SAFE_ZIP_RE.fullmatch(export_name):
        raise HTTPException(status_code=400, detail="Invalid export name")


def _resolve_candidate(export_name: str, export_root: Path) -> Path:
    """Map a validated name to a file under the export root, safely."""

    _validate_name(export_name)
    candidate = (export_root / export_name).resolve()
    try:
        candidate.relative_to(export_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid export path") from exc
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Export not found")
    return candidate


def _compute_strong_etag(path: Path) -> str:
    """Compute (or fetch) a **quoted** strong ETag for a file.

    The memo key uses (path, size, mtime). If either changes, we recompute.
    """

    stat = path.stat()
    key = (path, stat.st_size, int(stat.st_mtime))
    cached = _ETAG_MEMO.get(key)
    if cached:
        return cached
    sha = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            sha.update(chunk)
    etag = f'"{sha.hexdigest()}"'
    _ETAG_MEMO.clear()  # avoid unbounded growth; keep hot latest only
    _ETAG_MEMO[key] = etag
    return etag


def _cache_headers(etag: str) -> Dict[str, str]:
    return {
        "ETag": etag,
        # Conservative but useful public caching; revalidate with ETag.
        "Cache-Control": "public, max-age=3600, must-revalidate",
    }


def _parse_if_none_match(value: str) -> Set[str]:
    """Parse If-None-Match into a set of **unquoted** validators.

    Supports multiple values and weak validators (W/"...").
    The wildcard ``*`` is represented by the literal {"*"}.
    """

    value = value.strip()
    if value == "*":
        return {"*"}
    out: Set[str] = set()
    for part in value.split(","):
        tag = part.strip()
        if not tag:
            continue
        if tag.startswith('W/"') and tag.endswith('"'):
            tag = tag[3:-1]
        elif tag.startswith('"') and tag.endswith('"'):
            tag = tag[1:-1]
        out.add(tag)
    return out


def create_app(
    export_root: Optional[Union[str, os.PathLike[str], Path]] = None,
) -> FastAPI:
    """Create a FastAPI application serving artifact exports."""

    base_dir = _resolve_export_root(export_root)
    app = FastAPI()

    @app.get("/health")
    def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/exports/{export_name}")
    def fetch_export(
        export_name: str, if_none_match: Optional[str] = Header(default=None)
    ) -> Response:
        """Return the requested export ZIP file.

        The export name must target a lower-case `.zip` file and cannot contain path
        separators.
        """

        candidate = _resolve_candidate(export_name, base_dir)
        etag = _compute_strong_etag(candidate)
        headers = _cache_headers(etag)
        if if_none_match:
            validators = _parse_if_none_match(if_none_match)
            # RFC 7232: If-None-Match * matches any current representation
            if "*" in validators:
                return Response(status_code=304, headers=headers)
            # Compare using unquoted tokens vs our quoted strong ETag
            if etag.strip('"') in validators:
                return Response(status_code=304, headers=headers)
        return cast(
            Response,
            FileResponse(
                candidate,
                media_type="application/zip",
                filename=export_name,
                headers=headers,
            ),
        )

    @app.head("/exports/{export_name}")
    def head_export(
        export_name: str, if_none_match: Optional[str] = Header(default=None)
    ) -> Response:
        candidate = _resolve_candidate(export_name, base_dir)
        etag = _compute_strong_etag(candidate)
        headers = _cache_headers(etag)
        if if_none_match:
            validators = _parse_if_none_match(if_none_match)
            if "*" in validators or etag.strip('"') in validators:
                return Response(status_code=304, headers=headers)
        return Response(status_code=200, headers=headers)

    return app


app = create_app()


__all__ = ["DEFAULT_EXPORT_ROOT", "SAFE_ZIP_RE", "app", "create_app"]

