"""FastAPI application exposing exported zip archives."""

from __future__ import annotations

import hashlib
import os
import re
from email.utils import formatdate
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse

EXPORT_NAME_MAX_LENGTH = 128
EXPORT_NAME_PATTERN = r"^[a-z0-9](?:[a-z0-9_-]{0,127})?\.zip$"
DEFAULT_CACHE_CONTROL = "public, max-age=3600, must-revalidate"
DEFAULT_MEDIA_TYPE = "application/zip"
ENV_EXPORT_ROOT = "EXPORT_ROOT"
ENV_WEAK_ETAG = "GATEWAY_WEAK_ETAG"


def create_app(
    export_root: Optional[Path] = None,
    *,
    use_weak_etag: Optional[bool] = None,
) -> FastAPI:
    """Application factory.

    Parameters
    ----------
    export_root:
        Optional path to override the root directory that contains export archives.
        Defaults to the value of :data:`ENV_EXPORT_ROOT` or a local ``exports``
        directory when not provided.
    use_weak_etag:
        Force enabling or disabling weak ETag generation. When ``None`` the value
        is resolved from :data:`ENV_WEAK_ETAG`.
    """

    resolved_root = (export_root or _default_root()).resolve()
    if not resolved_root.exists():
        resolved_root.mkdir(parents=True, exist_ok=True)

    if use_weak_etag is None:
        use_weak_etag = _resolve_weak_etag_flag()

    app = FastAPI()

    app.state.export_root = resolved_root
    app.state.use_weak_etag = use_weak_etag

    @app.get("/health")
    async def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/exports/{export_name}")
    async def get_export(export_name: str, request: Request) -> Response:
        return await _serve_export(request, export_name, method="GET")

    @app.head("/exports/{export_name}")
    async def head_export(export_name: str, request: Request) -> Response:
        return await _serve_export(request, export_name, method="HEAD")

    @app.exception_handler(HTTPException)
    async def http_exc_handler(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            {"error": "http_error", "detail": exc.detail},
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def uncaught_exc_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            {"error": "internal_error", "detail": str(exc)},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return app


async def _serve_export(request: Request, export_name: str, *, method: str) -> Response:
    app = request.app
    export_root: Path = app.state.export_root
    use_weak_etag: bool = bool(app.state.use_weak_etag)

    candidate = _resolve_candidate(export_root, export_name)

    if not candidate.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="export not found")
    if not candidate.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="export not found")

    stat = candidate.stat()
    etag = _compute_weak_etag(candidate) if use_weak_etag else _compute_strong_etag(candidate)
    quoted_etag = _quote_etag(etag)
    last_modified = formatdate(stat.st_mtime, usegmt=True)

    headers = {
        "ETag": quoted_etag,
        "Cache-Control": DEFAULT_CACHE_CONTROL,
        "Last-Modified": last_modified,
        "Content-Disposition": f'attachment; filename="{export_name}"',
    }

    if _etag_matches(request.headers.get("if-none-match"), quoted_etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    if method == "HEAD":
        head_headers = dict(headers)
        head_headers["Content-Length"] = str(stat.st_size)
        return Response(status_code=status.HTTP_200_OK, headers=head_headers)

    response = FileResponse(
        candidate,
        media_type=DEFAULT_MEDIA_TYPE,
        filename=export_name,
        headers=headers,
    )

    return response


def _resolve_candidate(export_root: Path, export_name: str) -> Path:
    if not _is_valid_export_name(export_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="export name must be lower-case and end with .zip",
        )

    candidate = (export_root / export_name).resolve()
    try:
        candidate.relative_to(export_root.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid export path") from exc

    return candidate


def _default_root() -> Path:
    configured = os.environ.get(ENV_EXPORT_ROOT)
    if configured:
        return Path(configured)
    return Path.cwd() / "exports"


def _resolve_weak_etag_flag() -> bool:
    raw = os.environ.get(ENV_WEAK_ETAG)
    if raw is None:
        return False
    return raw.lower() in {"1", "true", "t", "yes", "y", "on"}


def _is_valid_export_name(name: str) -> bool:
    if len(name) > EXPORT_NAME_MAX_LENGTH:
        return False
    return re.fullmatch(EXPORT_NAME_PATTERN, name) is not None


def _etag_matches(header_value: Optional[str], current: str) -> bool:
    if not header_value:
        return False
    tag = current
    candidates = [value.strip() for value in header_value.split(",") if value.strip()]
    return tag in candidates or "*" in candidates


def _compute_strong_etag(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _compute_weak_etag(path: Path) -> str:
    stat = path.stat()
    return f'W/"{stat.st_ino}-{stat.st_size}-{int(stat.st_mtime)}"'


def _quote_etag(etag: str) -> str:
    if etag.startswith("W/"):
        return etag
    return f'"{etag}"'
