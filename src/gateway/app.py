"""FastAPI application for serving exported assets with caching controls."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse

from .middleware.audit import AuditMiddleware

app = FastAPI(title="MOBIUS Gateway")
app.add_middleware(AuditMiddleware)


def get_exports_dir() -> Path:
    return Path(os.environ.get("EXPORTS_DIR", "exports")).resolve()


def is_strong_etag_enabled() -> bool:
    value = os.environ.get("GATEWAY_STRONG_ETAG", "false").lower()
    return value in {"1", "true", "yes", "on"}


def get_api_key() -> Optional[str]:
    return os.environ.get("GATEWAY_API_KEY")


async def require_api_key(request: Request) -> None:
    expected = get_api_key()
    if not expected:
        return
    provided = request.headers.get("x-mobius-key")
    if provided != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


@app.get("/healthz", dependencies=[Depends(require_api_key)])
async def healthz() -> dict[str, str]:
    """Simple health endpoint exposing cache mode."""
    mode = "strong" if is_strong_etag_enabled() else "weak"
    return {"status": "ok", "mode": mode}


@app.get("/exports/{file_path:path}", dependencies=[Depends(require_api_key)])
async def get_export(file_path: str, request: Request, exports_dir: Path = Depends(get_exports_dir)):
    return await _serve_export(file_path, request, exports_dir, method="GET")


@app.head("/exports/{file_path:path}", dependencies=[Depends(require_api_key)])
async def head_export(file_path: str, request: Request, exports_dir: Path = Depends(get_exports_dir)):
    return await _serve_export(file_path, request, exports_dir, method="HEAD")


async def _serve_export(file_path: str, request: Request, exports_dir: Path, *, method: str) -> Response:
    safe_path = _resolve_path(exports_dir, file_path)
    if not safe_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    stat = safe_path.stat()
    last_modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc)
    headers = {
        "ETag": _build_etag(safe_path, stat.st_size, stat.st_mtime),
        "Last-Modified": format_datetime(last_modified),
        "Cache-Control": "public, max-age=0, must-revalidate",
    }

    if _is_not_modified(request.headers, headers["ETag"], last_modified):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    if method == "HEAD":
        return Response(status_code=status.HTTP_200_OK, headers=headers)

    return FileResponse(
        path=safe_path,
        media_type="application/octet-stream",
        filename=safe_path.name,
        headers=headers,
    )


def _resolve_path(exports_dir: Path, file_path: str) -> Path:
    if file_path.startswith("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid export path")

    normalized = Path(file_path)
    if any(part == ".." for part in normalized.parts):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid export path")

    candidate = (exports_dir / normalized).resolve()
    exports_root = exports_dir.resolve()

    try:
        candidate.relative_to(exports_root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid export path") from exc

    return candidate


def _build_etag(path: Path, size: int, mtime: float) -> str:
    if is_strong_etag_enabled():
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 64), b""):
                digest.update(chunk)
        return f'"{digest.hexdigest()}"'

    value = f"{int(mtime)}:{size}"
    return f'W/"{value}"'


def _is_not_modified(headers, etag: str, last_modified: datetime) -> bool:
    if_none_match = headers.get("if-none-match")
    if if_none_match:
        etags = {tag.strip() for tag in if_none_match.split(",")}
        if etag in etags:
            return True
        if not etag.startswith("W/"):
            weak_variant = f'W/{etag}'
            if weak_variant in etags:
                return True

    if_modified_since = headers.get("if-modified-since")
    if if_modified_since:
        try:
            since = parsedate_to_datetime(if_modified_since)
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError, IndexError):
            since = None
        if since and last_modified <= since:
            return True
    return False


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = getattr(exc, "headers", None)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=headers)
