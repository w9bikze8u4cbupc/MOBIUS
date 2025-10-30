"""Gateway FastAPI application serving exported files."""
from __future__ import annotations

import os
import urllib.parse
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response

EXPORTS_DIR = Path(os.environ.get("EXPORTS_DIR", "/exports")).resolve()

app = FastAPI(title="Gateway")


def _resolve_export_path(export_path: str) -> Path:
    """Resolve the given export path ensuring it stays within EXPORTS_DIR."""
    try:
        base = EXPORTS_DIR
        path = (base / export_path).resolve(strict=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Export not found") from exc

    # Ensure the resolved path is within the export directory to prevent traversal.
    if base not in path.parents and path != base:
        raise HTTPException(status_code=404, detail="Export not found")

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Export not found")

    return path


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
    """Return a 304 response when the client's cache is still valid.

    Supports wildcard (*), multiple comma-separated validators, and weak tags.
    Compares using the unquoted token (no W/ prefix, no quotes).
    """
    if not if_none_match:
        return None
    # Wildcard: any current representation
    if if_none_match.strip() == "*":
        return Response(status_code=304, headers=headers)
    # Normalize current ETag to a bare token
    current = etag[3:-1] if etag.startswith('W/"') and etag.endswith('"') else etag.strip('"')
    for part in (p.strip() for p in if_none_match.split(",") if p.strip()):
        # Remove weak prefix and surrounding quotes if present
        if part.startswith('W/"') and part.endswith('"'):
            token = part[3:-1]
        elif part.startswith('"') and part.endswith('"'):
            token = part[1:-1]
        else:
            token = part
        if token == current:
            return Response(status_code=304, headers=headers)
    return None


def _prepare_export_response(
    export_path: str, if_none_match: Optional[str]
) -> tuple[Path, Dict[str, str], Optional[Response]]:
    """Common logic for GET and HEAD to resolve path, headers, and precondition."""
    path = _resolve_export_path(export_path)
    headers = _cache_headers(path)
    # RFC 6266/5987: safe quoted filename + UTF-8 filename*
    safe_name = path.name.replace("\\", "\\\\").replace('"', '\\"')
    encoded_name = urllib.parse.quote(path.name)
    headers["Content-Disposition"] = (
        f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{encoded_name}'
    )
    precondition = _maybe_304(if_none_match, headers["ETag"], headers)
    return path, headers, precondition


@app.get("/exports/{export_path:path}", tags=["exports"])
async def get_export(
    export_path: str,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
) -> Response:
    path, headers, precondition = _prepare_export_response(export_path, if_none_match)
    if precondition is not None:
        return precondition
    return FileResponse(path, headers=headers)


@app.head("/exports/{export_path:path}", tags=["exports"])
async def head_export(
    export_path: str,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
) -> Response:
    path, headers, precondition = _prepare_export_response(export_path, if_none_match)
    if precondition is not None:
        return precondition
    return Response(status_code=200, headers=headers)
