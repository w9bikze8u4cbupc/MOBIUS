from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

SAFE_ZIP_RE = re.compile(r"^[A-Za-z0-9._-]+\.zip$")

EXPORTS_ROOT = Path(
    os.environ.get("EXPORTS_ROOT", Path(__file__).resolve().parent / "exports")
).resolve()
EXPORTS_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI()


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/exports/{export_name}")
async def download_export(export_name: str) -> FileResponse:
    if not SAFE_ZIP_RE.match(export_name):
        raise HTTPException(status_code=404, detail="Not found")

    export_path = (EXPORTS_ROOT / export_name).resolve()
    if export_path.parent != EXPORTS_ROOT:
        raise HTTPException(status_code=404, detail="Not found")

    try:
        export_path.relative_to(EXPORTS_ROOT)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")

    if not export_path.is_file():
        raise HTTPException(status_code=404, detail="Export not ready")

    stat = export_path.stat()
    etag = f'W/"{stat.st_ino}-{stat.st_size}-{int(stat.st_mtime)}"'
    headers = {"ETag": etag}

    return FileResponse(
        export_path,
        media_type="application/zip",
        headers=headers,
        filename=export_name,
    )
