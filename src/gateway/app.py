"""FastAPI gateway providing access to exported artifacts."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Dict
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse, Response

from .signing import sha256_file


EXPORTS_DEFAULT = Path("exports")


def get_exports_dir() -> Path:
    """Return the directory containing exported artifacts."""
    configured = os.getenv("EXPORTS_DIR")
    if configured:
        return Path(configured)
    return EXPORTS_DEFAULT


def require_api_key(request: Request) -> None:
    """Ensure the request contains the configured API key."""
    expected = os.getenv("MOBIUS_API_KEY")
    if not expected:
        return
    provided = request.headers.get("x-mobius-key")
    if provided != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


def _http_datetime(timestamp: float) -> str:
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


def _parse_if_modified_since(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _fallback_filename(name: str) -> str:
    cleaned = [c if 32 <= ord(c) < 127 and c not in {'"', '\\'} else '_' for c in name]
    candidate = "".join(cleaned)
    return candidate or "download.zip"


def _content_disposition(name: str) -> str:
    fallback = _fallback_filename(name)
    return f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(name)}'


def _common_headers(target: Path, etag: str, mtime: float) -> Dict[str, str]:
    headers: Dict[str, str] = {
        "ETag": etag,
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Last-Modified": _http_datetime(mtime),
        "Content-Disposition": _content_disposition(target.name),
    }
    return headers


def _etag_for_path(path: Path) -> str:
    digest = sha256_file(path)
    return f'"{digest}"'


async def _serve_export(file_path: str, request: Request) -> Response:
    require_api_key(request)
    base_dir = get_exports_dir().resolve()
    target = (base_dir / file_path).resolve()
    try:
        target.relative_to(base_dir)
    except ValueError as exc:  # pragma: no cover - safety net
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found") from exc
    if not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    stat = target.stat()
    etag = _etag_for_path(target)
    headers = _common_headers(target, etag, stat.st_mtime)

    inm = request.headers.get("if-none-match")
    if inm and inm.strip() == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    ims_dt = _parse_if_modified_since(request.headers.get("if-modified-since"))
    if ims_dt is not None:
        target_dt = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).replace(microsecond=0)
        if ims_dt >= target_dt:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    return FileResponse(
        target,
        media_type="application/zip",
        headers=headers,
    )


def _version() -> str:
    return os.getenv("MOBIUS_BUILD_VERSION", "dev+local")


def _cache_mode() -> str:
    return "weak"


def create_app() -> FastAPI:
    app = FastAPI(title="MOBIUS Gateway")

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):  # type: ignore[override]
        response = await call_next(request)
        vary = response.headers.get("Vary")
        if vary:
            if "Accept-Encoding" not in {v.strip() for v in vary.split(',')}:
                response.headers["Vary"] = f"{vary}, Accept-Encoding"
        else:
            response.headers["Vary"] = "Accept-Encoding"
        return response

    @app.get("/healthz")
    async def healthz(request: Request) -> JSONResponse:
        if os.getenv("MOBIUS_HEALTH_PUBLIC", "0").lower() not in {"1", "true", "yes", "on"}:
            require_api_key(request)
        return JSONResponse(
            {
                "status": "ok",
                "version": _version(),
                "cache_mode": _cache_mode(),
                "time": int(time.time()),
            }
        )

    @app.get("/exports/{file_path:path}.sha256")
    async def get_signature(file_path: str, request: Request) -> Response:
        require_api_key(request)
        base_dir = get_exports_dir().resolve()
        target = (base_dir / file_path).with_suffix(".zip").resolve()
        try:
            target.relative_to(base_dir)
        except ValueError as exc:  # pragma: no cover - safety net
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found") from exc
        if not target.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        digest = sha256_file(target)
        return Response(digest.encode("utf-8"), media_type="text/plain")

    @app.get("/exports/{file_path:path}")
    async def get_export(file_path: str, request: Request) -> Response:
        return await _serve_export(file_path, request)

    return app


app = create_app()
