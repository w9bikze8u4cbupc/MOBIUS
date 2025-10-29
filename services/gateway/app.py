from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse

GATEWAY_ROOT = Path(__file__).resolve().parent
DATA_ROOT = GATEWAY_ROOT.parent / "ingest-py" / "app" / "data"
EXPORTS_ROOT = DATA_ROOT / "exports"

app = FastAPI(title="Mobius Gateway")


@app.get("/version")
async def version():
    return {"service": "gateway", "version": "1.0.0"}


@app.get("/exports/{export_name}")
async def download_export(export_name: str):
    if not export_name.endswith(".zip"):
        raise HTTPException(status_code=404, detail="Not found")

    export_path = EXPORTS_ROOT / export_name
    if not export_path.exists():
        raise HTTPException(status_code=404, detail="Export not ready")

    media_type, _ = mimetypes.guess_type(str(export_path))
    headers = {"Content-Disposition": f"attachment; filename={export_name}"}

    return FileResponse(
        export_path,
        media_type=media_type or "application/octet-stream",
        headers=headers,
    )


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})
