from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import quote_from_bytes

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse

from .middleware.audit import AuditMiddleware

SAFE_ZIP = re.compile(r"^[\w][\w.-]*[.]zip$", re.UNICODE)
API_KEY_HEADER = "X-Mobius-Key"


def get_exports_dir() -> Path:
    configured = os.getenv("EXPORTS_DIR", "exports")
    path = Path(configured)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_logs_dir() -> Path:
    configured = os.getenv("LOG_DIR", "logs")
    path = Path(configured)
    path.mkdir(parents=True, exist_ok=True)
    return path


def require_api_key(request: Request) -> None:
    expected = os.getenv("MOBIUS_API_KEY")
    if not expected:
        return
    provided = request.headers.get(API_KEY_HEADER) or request.headers.get(API_KEY_HEADER.lower())
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def create_app(*, audit_clock: Optional[Callable[[], datetime]] = None) -> FastAPI:
    app = FastAPI()
    app.add_middleware(AuditMiddleware, log_dir=get_logs_dir(), clock=audit_clock)

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    @app.get("/healthz")
    async def healthz(request: Request) -> JSONResponse:
        require_api_key(request)
        return JSONResponse({"status": "ok"})

    @app.get("/exports/{file_path:path}")
    async def get_export(file_path: str, request: Request) -> Response:
        require_api_key(request)
        return await _serve_export(file_path, request, get_exports_dir(), method="GET")

    @app.head("/exports/{file_path:path}")
    async def head_export(file_path: str, request: Request) -> Response:
        require_api_key(request)
        return await _serve_export(file_path, request, get_exports_dir(), method="HEAD")

    return app


async def _serve_export(file_path: str, request: Request, exports_dir: Path, *, method: str) -> Response:
    safe_path = _resolve_path(exports_dir, file_path)
    if not SAFE_ZIP.fullmatch(Path(file_path).name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    if safe_path.suffix.lower() != ".zip":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    stat_result = safe_path.stat()
    last_modified = datetime.fromtimestamp(stat_result.st_mtime, tz=timezone.utc).replace(microsecond=0)
    headers = {
        "ETag": _build_etag(stat_result.st_size, stat_result.st_mtime_ns),
        "Last-Modified": format_datetime(last_modified),
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Accept-Ranges": "bytes",
    }

    headers["Content-Disposition"] = _content_disposition(safe_path.name)

    if _matches_etag(request.headers.get("if-none-match"), headers["ETag"]):
        headers["Content-Length"] = "0"
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    if _not_modified_since(request.headers.get("if-modified-since"), last_modified):
        headers["Content-Length"] = "0"
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    return FileResponse(
        path=safe_path,
        media_type="application/zip",
        headers=headers,
        method=method,
    )


def _resolve_path(exports_dir: Path, file_path: str) -> Path:
    try:
        candidate = (exports_dir / file_path).resolve(strict=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found") from exc

    exports_root = exports_dir.resolve()
    if exports_root != candidate and exports_root not in candidate.parents:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    if not candidate.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    return candidate


def _matches_etag(if_none_match: Optional[str], etag: str) -> bool:
    if not if_none_match:
        return False
    candidates = [value.strip() for value in if_none_match.split(",")]
    return "*" in candidates or etag in candidates


def _not_modified_since(if_modified_since: Optional[str], last_modified: datetime) -> bool:
    if not if_modified_since:
        return False
    try:
        parsed = parsedate_to_datetime(if_modified_since)
    except (TypeError, ValueError):
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.replace(microsecond=0)
    return last_modified <= parsed


def _build_etag(size: int, mtime_ns: int) -> str:
    # Use size and last modification time to form a weak ETag
    return f'W/"{size:x}-{mtime_ns:x}"'


def _content_disposition(name: str) -> str:
    fallback = "".join(
        c if 32 <= ord(c) < 127 and c not in {'"', "\\"} else "_" for c in name
    ) or "download.zip"
    quoted = fallback.replace("\\", "\\\\").replace('"', r'\"')
    utf8 = quote_from_bytes(name.encode("utf-8"))
    return f'attachment; filename="{quoted}"; filename*=UTF-8\'\'{utf8}'


app = create_app()
