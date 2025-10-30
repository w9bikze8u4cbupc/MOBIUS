"""Gateway FastAPI application serving exported files."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse, Response

EXPORTS_DIR = Path(
    os.environ.get("EXPORTS_DIR", Path.cwd() / "data" / "exports")
).resolve()

app = FastAPI(title="Gateway")


def _resolve_export_path(export_path: str) -> Path:
    """Return the filesystem path for a requested export.

    The lookup is restricted to ``EXPORTS_DIR`` to avoid directory traversal
    attacks. A 404 ``HTTPException`` is raised if the file does not exist or
    the path points outside of the exports directory.
    """

    requested_path = (EXPORTS_DIR / export_path).resolve()
    try:
        requested_path.relative_to(EXPORTS_DIR)
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise HTTPException(status_code=404, detail="Export not found") from exc

    if not requested_path.exists() or not requested_path.is_file():
        raise HTTPException(status_code=404, detail="Export not found")

    return requested_path


def _cache_headers(path: Path) -> Dict[str, str]:
    """Generate cache headers for the given file path."""

    stat = path.stat()
    etag = f'W/"{stat.st_mtime_ns}-{stat.st_size}"'
    return {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Length": str(stat.st_size),
        "ETag": etag,
    }


def _maybe_304(
    if_none_match: Optional[str], etag: str, headers: Dict[str, str]
) -> Optional[Response]:
    """Return a 304 response when the client's cache is still valid."""

    if if_none_match is None:
        return None

    if if_none_match == etag:
        return Response(status_code=304, headers=headers)

    return None


@app.get("/exports/{export_path:path}", tags=["exports"])
async def get_export(
    export_path: str,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
) -> Response:
    path = _resolve_export_path(export_path)
    headers = _cache_headers(path)
    headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
    precondition = _maybe_304(if_none_match, headers["ETag"], headers)
    if precondition is not None:
        return precondition
    return FileResponse(path, headers=headers)


@app.head("/exports/{export_path:path}", tags=["exports"])
async def head_export(
    export_path: str,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
) -> Response:
    path = _resolve_export_path(export_path)
    headers = _cache_headers(path)
    headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
    precondition = _maybe_304(if_none_match, headers["ETag"], headers)
    if precondition is not None:
        return precondition
    return Response(status_code=200, headers=headers)
