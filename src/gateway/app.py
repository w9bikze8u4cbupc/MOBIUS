from __future__ import annotations

import json
import os
import re
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse

from .metrics import observe_request, render_metrics
from .middleware.audit import AuditMiddleware
from .middleware.rate_limit import RateLimitMiddleware

SAFE_ZIP = re.compile(r"[A-Za-z0-9_.-]+\.zip")


def get_exports_dir() -> Path:
    root = Path(os.getenv("EXPORTS_DIR", "./exports")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_logs_dir() -> Path:
    root = Path(os.getenv("LOG_DIR", "./logs")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def require_api_key(request: Request) -> None:
    expected = os.getenv("MOBIUS_API_KEY")
    if not expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key not configured")
    provided = request.headers.get("x-mobius-key") or request.headers.get("X-Mobius-Key")
    if provided != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


async def _serve_export(file_path: str, request: Request, base_dir: Path, *, method: str) -> Response:
    relative = Path(file_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    target = (base_dir / relative).resolve()
    try:
        target.relative_to(base_dir)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found") from exc
    if not target.is_file() or target.suffix.lower() != ".zip":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not SAFE_ZIP.fullmatch(target.name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    try:
        with zipfile.ZipFile(target) as archive:
            if archive.testzip() is not None:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Corrupted archive")
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid archive") from exc
    size = target.stat().st_size
    headers = {"Content-Length": str(size), "Content-Type": "application/octet-stream"}
    if method == "HEAD":
        return Response(b"", status_code=status.HTTP_200_OK, headers=headers)
    return FileResponse(target, status_code=status.HTTP_200_OK, headers=headers)


def create_app(*, audit_clock: Optional[Callable[[], datetime]] = None) -> FastAPI:
    app = FastAPI()
    app.add_middleware(AuditMiddleware, log_dir=get_logs_dir(), clock=audit_clock)
    if os.getenv("RL_ENABLE", "1").lower() in {"1", "true", "yes", "on"}:
        app.add_middleware(RateLimitMiddleware)

    @app.get("/metrics")
    async def metrics(request: Request) -> Response:
        if os.getenv("MOBIUS_METRICS_PUBLIC", "0").lower() not in {"1", "true", "yes", "on"}:
            require_api_key(request)
        payload = render_metrics().encode("utf-8")
        headers = {"Content-Type": "text/plain; version=0.0.4"}
        return Response(payload, status_code=status.HTTP_200_OK, headers=headers)

    @app.get("/exports/list")
    async def list_exports(request: Request) -> JSONResponse:
        require_api_key(request)
        index_file = get_exports_dir() / "index.json"
        if not index_file.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Index not found")
        try:
            data = json.loads(index_file.read_text(encoding="utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid index") from exc
        artifacts = []
        for name in data.get("artifacts", []):
            try:
                candidate = Path(name).name
            except Exception:
                continue
            if SAFE_ZIP.fullmatch(candidate):
                artifacts.append(candidate)
        return JSONResponse({"artifacts": artifacts})

    @app.get("/exports/{file_path:path}")
    async def get_export(file_path: str, request: Request) -> Response:
        require_api_key(request)
        return await _serve_export(file_path, request, get_exports_dir(), method="GET")

    @app.head("/exports/{file_path:path}")
    async def head_export(file_path: str, request: Request) -> Response:
        require_api_key(request)
        return await _serve_export(file_path, request, get_exports_dir(), method="HEAD")

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration = max(0.0, time.perf_counter() - start)
        bytes_sent = 0
        try:
            header_value = response.headers.get("content-length") or response.headers.get("Content-Length")
            if header_value:
                bytes_sent = int(header_value)
        except Exception:
            bytes_sent = 0
        observe_request(duration, response.status_code, bytes_sent)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    return app
