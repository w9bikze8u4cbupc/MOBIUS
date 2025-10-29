from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import JSONResponse

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = APP_ROOT / "data"
EXPORTS_ROOT = DATA_ROOT / "exports"

for directory in (DATA_ROOT, EXPORTS_ROOT):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Mobius Ingest Service")

PROJECT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{4,40}$")


def _validate_project_id(project_id: str) -> None:
    if not PROJECT_ID_PATTERN.fullmatch(project_id):
        raise HTTPException(status_code=400, detail="Invalid projectId")


def _store_upload(project_id: str, upload: UploadFile) -> Path:
    project_dir = DATA_ROOT / "uploads" / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    file_path = project_dir / upload.filename
    with file_path.open("wb") as dst:
        dst.write(upload.file.read())
    upload.file.close()
    return file_path


def _generate_export_path(project_id: str) -> Path:
    return EXPORTS_ROOT / f"{project_id}.zip"


@app.post("/ingest/pdf")
async def ingest_pdf(
    background_tasks: BackgroundTasks,
    projectId: str = Form(...),
    file: UploadFile = File(...),
    heuristics_form: Optional[bool] = Form(None),
    heuristics_q: Optional[bool] = Query(None),
):
    """Ingest a PDF file and queue background processing.

    This endpoint accepts the heuristics flag from either the form payload or
    query string so the gateway/UI can continue using a query parameter.
    """

    _validate_project_id(projectId)

    apply_heuristics = bool(
        heuristics_form if heuristics_form is not None else heuristics_q
    )

    stored_path = _store_upload(projectId, file)
    export_path = _generate_export_path(projectId)

    response_payload = {
        "ok": True,
        "project": {
            "id": projectId,
            "source": str(stored_path),
            "heuristicsApplied": apply_heuristics,
            "exportPath": str(export_path),
            "exportDownloadPath": f"/exports/{export_path.name}",
        },
    }

    return JSONResponse(response_payload)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
