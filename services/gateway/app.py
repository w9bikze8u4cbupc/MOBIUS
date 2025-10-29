"""FastAPI gateway exposing exported ZIP artifacts."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Dict, Optional, Union, cast

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.responses import FileResponse

SAFE_ZIP_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*\\.zip$")
DEFAULT_EXPORT_ROOT = Path(os.environ.get("EXPORT_ROOT", "./exports")).resolve()


def _resolve_export_root(export_root: Optional[Union[str, os.PathLike[str], Path]]) -> Path:
    root = Path(export_root) if export_root is not None else DEFAULT_EXPORT_ROOT
    root = root.resolve()
    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)
    if not root.is_dir():
        raise RuntimeError(f"Configured export root '{root}' is not a directory")
    return root


def _validate_name(export_name: str) -> None:
    if not SAFE_ZIP_RE.fullmatch(export_name):
        raise HTTPException(
            status_code=400,
            detail=(
                "export_name must reference a lower-case .zip file without path separators"
            ),
        )


def _resolve_candidate(export_name: str, export_root: Path) -> Path:
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
    sha = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            sha.update(chunk)
    return f'"{sha.hexdigest()}"'


def _cache_headers(etag: str) -> Dict[str, str]:
    return {
        "ETag": etag,
        "Cache-Control": "public, max-age=3600, must-revalidate",
    }


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
        if if_none_match and if_none_match == etag:
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
        if if_none_match and if_none_match == etag:
            return Response(status_code=304, headers=headers)
        return Response(status_code=200, headers=headers)

    return app


app = create_app()

__all__ = [
    "SAFE_ZIP_RE",
    "DEFAULT_EXPORT_ROOT",
    "create_app",
    "app",
]
