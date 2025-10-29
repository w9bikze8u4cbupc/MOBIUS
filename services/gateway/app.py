"""FastAPI gateway service for exporting ZIP archives."""
from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

EXPORTS_ROOT = Path(os.getenv("EXPORTS_ROOT", "./exports")).resolve()
SAFE_ZIP_RE = re.compile(r"^[A-Za-z0-9._-]+\\.zip$")

app = FastAPI()


@app.get("/exports/{export_name}")
async def download_export(export_name: str):
    """Stream a generated export archive if it exists under EXPORTS_ROOT."""
    if not SAFE_ZIP_RE.fullmatch(export_name):
        raise HTTPException(status_code=404, detail="Not found")

    export_path = (EXPORTS_ROOT / export_name).resolve()
    if export_path.parent != EXPORTS_ROOT or not export_path.is_file():
        raise HTTPException(status_code=404, detail="Export not ready")

    media_type = "application/zip"
    headers = {"Content-Disposition": f'attachment; filename="{export_name}"'}
    return FileResponse(export_path, media_type=media_type, headers=headers)
