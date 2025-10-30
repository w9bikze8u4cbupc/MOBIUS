from __future__ import annotations

import hashlib
from email.utils import formatdate
from pathlib import Path
from typing import Dict, Final, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response

EXPORTS_ROOT: Final = Path(__file__).resolve().parent / "data" / "exports"
EXPORTS_ROOT.mkdir(parents=True, exist_ok=True)


def _resolve_export_path(relative_path: str) -> Path:
    try:
        resolved = (EXPORTS_ROOT / relative_path).resolve(strict=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Export not found") from exc

    try:
        resolved.relative_to(EXPORTS_ROOT)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=404, detail="Export not found") from exc

    if resolved.is_dir():
        raise HTTPException(status_code=404, detail="Export not found")

    return resolved


def _cache_headers(path: Path) -> Dict[str, str]:
    stat_result = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    etag = f'"{digest.hexdigest()}"'
    return {
        "ETag": etag,
        "Last-Modified": formatdate(stat_result.st_mtime, usegmt=True),
        "Cache-Control": "public, max-age=3600, must-revalidate",
    }


def _maybe_304(if_none_match: Optional[str], etag: str, headers: Dict[str, str]) -> Optional[Response]:
    if not if_none_match:
        return None

    validators = {value.strip() for value in if_none_match.split(",")}
    if "*" in validators or etag in validators:
        return Response(status_code=304, headers=headers)

    unquoted = etag.strip('"')
    for validator in validators:
        if validator.startswith("W/") and validator.endswith('"'):
            candidate = validator.strip('W/"')
            if candidate == unquoted:
                return Response(status_code=304, headers=headers)
        elif validator.strip('"') == unquoted:
            return Response(status_code=304, headers=headers)

    return None


def create_app() -> FastAPI:
    app = FastAPI(title="Gateway")

    @app.get("/exports/{export_path:path}", tags=["exports"])
    async def get_export(export_path: str, if_none_match: Optional[str] = None) -> Response:
        path = _resolve_export_path(export_path)
        headers = _cache_headers(path)
        headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
        precondition = _maybe_304(if_none_match, headers["ETag"], headers)
        if precondition is not None:
            return precondition
        return FileResponse(path, headers=headers)

    @app.head("/exports/{export_path:path}", tags=["exports"])
    async def head_export(export_path: str, if_none_match: Optional[str] = None) -> Response:
        path = _resolve_export_path(export_path)
        headers = _cache_headers(path)
        headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
        precondition = _maybe_304(if_none_match, headers["ETag"], headers)
        if precondition is not None:
            return precondition
        return Response(status_code=200, headers=headers)

    return app


app = create_app()
