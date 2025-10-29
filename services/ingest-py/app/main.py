from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.params import Form
from pydantic import BaseModel

from .pdf_heuristics import extract_pdf_heuristics

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PROJECT_DIR = DATA_DIR / "projects"
EXPORT_DIR = DATA_DIR / "exports"

for directory in (DATA_DIR, UPLOAD_DIR, PROJECT_DIR, EXPORT_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Mobius Ingest Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


class IngestBGGRequest(BaseModel):
    projectId: str
    bggUrl: str


class ScriptGenerateRequest(BaseModel):
    project: Dict[str, Any]
    lang: str = "en"


class TTSGenerateRequest(BaseModel):
    projectId: str
    segments: list


class RenderComposeRequest(BaseModel):
    project: Dict[str, Any]
    options: Dict[str, Any] = {}


class ExportRequest(BaseModel):
    projectId: str


exports: Dict[str, Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _load_manifest(project_id: str) -> Dict[str, Any]:
    manifest_path = PROJECT_DIR / project_id / "manifest.json"
    if manifest_path.exists():
        return json.loads(manifest_path.read_text())
    return {"id": project_id, "updatedAt": _now_iso()}


def _persist_manifest(project_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    project_path = PROJECT_DIR / project_id
    project_path.mkdir(parents=True, exist_ok=True)
    manifest_path = project_path / "manifest.json"
    manifest_path.write_text(json.dumps(payload, indent=2))
    return payload


def _simulate_pdf_text(file_path: Path) -> str:
    try:
        return file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "ingest"}


@app.post("/ingest/bgg")
def ingest_bgg(request: IngestBGGRequest) -> Dict[str, Any]:
    manifest = _load_manifest(request.projectId)
    manifest.setdefault("sources", {})
    manifest["sources"]["bgg"] = {
        "url": request.bggUrl,
        "fetchedAt": _now_iso(),
    }
    _persist_manifest(request.projectId, manifest)
    return {"projectId": request.projectId, "status": "queued"}


@app.post("/ingest/pdf")
async def ingest_pdf(
    background_tasks: BackgroundTasks,
    projectId: str = Form(...),
    file: UploadFile = File(...),
    heuristics: bool = Query(False),
) -> Dict[str, Any]:
    project_dir = UPLOAD_DIR / projectId
    project_dir.mkdir(parents=True, exist_ok=True)

    destination = project_dir / file.filename
    with destination.open("wb") as f:
        contents = await file.read()
        f.write(contents)

    manifest = _load_manifest(projectId)
    manifest.setdefault("assets", {})
    manifest["assets"]["pdf"] = {
        "path": str(destination.relative_to(BASE_DIR)),
        "uploadedAt": _now_iso(),
        "filename": file.filename,
    }

    if heuristics:
        text = _simulate_pdf_text(destination)
        heuristic_payload = extract_pdf_heuristics(text)
        manifest["components"] = heuristic_payload.get("components", [])
        manifest["setup"] = heuristic_payload.get("setup", [])
        manifest["heuristics"] = {"ranAt": _now_iso(), **heuristic_payload}

    manifest["updatedAt"] = _now_iso()
    _persist_manifest(projectId, manifest)
    return {"projectId": projectId, "manifest": manifest}


@app.post("/script/generate")
def script_generate(request: ScriptGenerateRequest) -> Dict[str, Any]:
    project_id = request.project.get("id", "unknown")
    segments = [
        {
            "id": f"seg-{idx}",
            "text": f"Placeholder narration segment {idx + 1} for project {project_id}.",
            "duration": 5,
        }
        for idx in range(3)
    ]
    return {"projectId": project_id, "lang": request.lang, "segments": segments}


@app.post("/tts/generate")
def tts_generate(request: TTSGenerateRequest) -> Dict[str, Any]:
    audio_segments = [
        {
            "id": segment.get("id", f"seg-{idx}"),
            "path": f"audio/{request.projectId}/segment-{idx}.mp3",
            "duration": segment.get("duration", 4),
        }
        for idx, segment in enumerate(request.segments or [])
    ]
    return {"projectId": request.projectId, "segments": audio_segments}


@app.post("/render/compose")
def render_compose(request: RenderComposeRequest) -> Dict[str, Any]:
    render_id = f"render-{uuid4().hex[:8]}"
    return {
        "renderId": render_id,
        "status": "queued",
        "options": request.options,
        "projectId": request.project.get("id"),
    }


def _finalize_export(export_id: str, project_id: str) -> None:
    export_info = exports.get(export_id)
    if not export_info:
        return
    export_path = EXPORT_DIR / f"{export_id}.zip"
    export_path.parent.mkdir(parents=True, exist_ok=True)

    manifest = _load_manifest(project_id)
    content = json.dumps(manifest, indent=2).encode("utf-8")

    from zipfile import ZipFile, ZIP_DEFLATED

    with ZipFile(export_path, "w", compression=ZIP_DEFLATED) as zip_file:
        zip_file.writestr("manifest.json", content)
    export_info.update({
        "state": "complete",
        "progress": 1.0,
        "zipPath": str(export_path.relative_to(BASE_DIR)),
        "completedAt": _now_iso(),
    })


def _run_export(export_id: str, project_id: str) -> None:
    export_info = exports.get(export_id)
    if not export_info:
        return
    for progress in (0.25, 0.5, 0.75):
        export_info["progress"] = progress
        time.sleep(0.2)
    _finalize_export(export_id, project_id)


@app.post("/project/export")
def project_export(
    request: ExportRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    export_id = uuid4().hex
    exports[export_id] = {
        "state": "running",
        "progress": 0.0,
        "projectId": request.projectId,
        "createdAt": _now_iso(),
        "zipPath": None,
    }
    background_tasks.add_task(_run_export, export_id, request.projectId)
    return {"exportId": export_id, **exports[export_id]}


@app.get("/project/export/status")
def project_export_status(exportId: str) -> Dict[str, Any]:
    export_info = exports.get(exportId)
    if not export_info:
        raise HTTPException(status_code=404, detail="export not found")
    return {"exportId": exportId, **export_info}
