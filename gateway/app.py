"""Application routes for the MOBIUS gateway stub."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict
from urllib.parse import quote

from .config import SETTINGS
from .files import (
    ExportNotFound,
    ascii_fallback,
    compute_etag,
    iter_file_chunks,
    resolve_export,
    should_return_not_modified,
    signature_body,
)
from .framework import App, JSONResponse, Request, Response, StreamingResponse
from .security import Unauthorized, health_access_allowed, validate_api_key

app = App()


def _base_headers(metadata_etag: str, metadata_last_modified: str) -> Dict[str, str]:
    return {
        "ETag": f'"{metadata_etag}"',
        "Last-Modified": metadata_last_modified,
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Vary": "Accept-Encoding",
        "Accept-Ranges": "bytes",
    }


@app.get("/healthz")
def healthz(request: Request) -> Response:
    if not health_access_allowed(request):
        return Unauthorized()
    payload = {
        "status": "ok",
        "version": SETTINGS.version,
        "cache_mode": SETTINGS.cache_mode,
        "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    return JSONResponse(payload)


@app.get("/exports/{file}.zip")
def download_export(file: str, request: Request) -> Response:
    auth_error = validate_api_key(request)
    if auth_error:
        return auth_error
    try:
        path = resolve_export(file)
    except ExportNotFound:
        return Response("Not Found", status_code=404, headers={"Content-Type": "text/plain"})

    metadata = compute_etag(path)
    if should_return_not_modified(request.headers, metadata):
        headers = _base_headers(metadata.etag, metadata.last_modified)
        headers["Content-Type"] = "application/zip"
        return Response(b"", status_code=304, headers=headers)

    filename = f"{file}.zip"
    fallback = ascii_fallback(filename)
    headers = _base_headers(metadata.etag, metadata.last_modified)
    headers.update(
        {
            "Content-Type": "application/zip",
            "Content-Length": str(metadata.size),
            "Content-Disposition": (
                f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{_percent_encode(filename)}"
            ),
        }
    )

    return StreamingResponse(
        iter_file_chunks(path),
        status_code=200,
        headers=headers,
        media_type="application/zip",
    )


@app.get("/exports/{file}.zip.sha256")
def download_signature(file: str, request: Request) -> Response:
    auth_error = validate_api_key(request)
    if auth_error:
        return auth_error
    try:
        path = resolve_export(file)
    except ExportNotFound:
        return Response("Not Found", status_code=404, headers={"Content-Type": "text/plain"})

    metadata = compute_etag(path)
    if should_return_not_modified(request.headers, metadata):
        headers = _base_headers(metadata.etag, metadata.last_modified)
        headers["Content-Type"] = "text/plain; charset=utf-8"
        return Response(b"", status_code=304, headers=headers)

    body = signature_body(metadata)
    headers = _base_headers(metadata.etag, metadata.last_modified)
    headers.update(
        {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Length": str(len(body.encode("utf-8"))),
        }
    )
    return Response(body, headers=headers)


def _percent_encode(value: str) -> str:
    return quote(value, safe="")
