import json
import os
import re
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

PROJECT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")

DATA_DIR = Path(os.environ.get("INGEST_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
PROJECTS_DIR = DATA_DIR / "projects"
EXPORTS_DIR = DATA_DIR / "exports"

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def validate_project_id(project_id: str) -> str:
    if not PROJECT_ID_PATTERN.match(project_id):
        raise HTTPException(status_code=400, detail="Invalid projectId. Expecting ^[a-zA-Z0-9._-]{1,64}$")
    return project_id


class BggRequest(BaseModel):
    projectId: str
    bggUrl: str = Field(..., min_length=1)


class ScriptRequest(BaseModel):
    project: Dict[str, Any]
    lang: str = "en"


class TtsSegment(BaseModel):
    id: str
    text: str
    title: Optional[str] = None
    duration: Optional[float] = None


class TtsRequest(BaseModel):
    projectId: str
    segments: List[TtsSegment]


class RenderOptions(BaseModel):
    mode: str = "preview"


class RenderRequest(BaseModel):
    project: Dict[str, Any]
    options: RenderOptions = RenderOptions()


class SaveProjectRequest(BaseModel):
    projectId: str
    manifest: Dict[str, Any]


class LoadProjectRequest(BaseModel):
    projectId: str


class ExportRequest(BaseModel):
    projectId: str


class ManifestManager:
    def __init__(self, root: Path) -> None:
        self.root = root

    def project_dir(self, project_id: str) -> Path:
        project_path = self.root / project_id
        project_path.mkdir(parents=True, exist_ok=True)
        return project_path

    def manifest_path(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "manifest.json"

    def load(self, project_id: str) -> Dict[str, Any]:
        path = self.manifest_path(project_id)
        if not path.exists():
            manifest = self._new_manifest(project_id)
            self.save(project_id, manifest)
            return manifest
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    def save(self, project_id: str, manifest: Dict[str, Any]) -> None:
        path = self.manifest_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        manifest["projectId"] = project_id
        with path.open("w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2, sort_keys=True)

    def _new_manifest(self, project_id: str) -> Dict[str, Any]:
        return {
            "projectId": project_id,
            "bgg": None,
            "rulebook": None,
            "script": None,
            "tts": None,
            "render": None,
            "exports": [],
            "updatedAt": _utc_now(),
        }


manifest_manager = ManifestManager(PROJECTS_DIR)

export_status_lock = threading.Lock()
export_status: Dict[str, Dict[str, Any]] = {}

app = FastAPI(title="Mobius Ingest Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail})


@app.middleware("http")
async def ensure_response_shape(request, call_next):
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("application/json"):
        body = b"".join([chunk async for chunk in response.body_iterator])
        if not body:
            payload = {"ok": True}
        else:
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {"ok": False, "error": "Malformed JSON response"}
        if "ok" not in payload:
            wrapped = {"ok": True, "details": payload}
        else:
            wrapped = payload
        new_response = JSONResponse(status_code=response.status_code, content=wrapped)
        for key, value in response.headers.items():
            if key.lower() == "content-length":
                continue
            new_response.headers[key] = value
        return new_response
    return response


def _update_manifest(project_id: str, updater):
    manifest = manifest_manager.load(project_id)
    updater(manifest)
    manifest["updatedAt"] = _utc_now()
    manifest_manager.save(project_id, manifest)
    return manifest


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "status": "healthy"}


@app.get("/version")
def version() -> Dict[str, Any]:
    from fastapi import __version__ as fastapi_version
    from pydantic import __version__ as pydantic_version

    return {
        "ok": True,
        "commit": os.environ.get("GIT_COMMIT"),
        "fastapi": fastapi_version,
        "pydantic": pydantic_version,
    }


@app.post("/ingest/bgg")
def ingest_bgg(payload: BggRequest):
    project_id = validate_project_id(payload.projectId)

    def updater(manifest: Dict[str, Any]) -> None:
        manifest["bgg"] = {
            "url": payload.bggUrl,
            "fetchedAt": _utc_now(),
            "title": "Stubbed Game",
            "playerCount": "2-4",
        }

    manifest = _update_manifest(project_id, updater)
    return {"ok": True, "project": manifest}


@app.post("/ingest/pdf")
def ingest_pdf(
    background_tasks: BackgroundTasks,
    projectId: str = Form(...),
    file: UploadFile = File(...),
    heuristics: Optional[bool] = False,
):
    project_id = validate_project_id(projectId)
    project_dir = manifest_manager.project_dir(project_id)
    uploads_dir = project_dir / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    target = uploads_dir / file.filename
    with target.open("wb") as fh:
        fh.write(file.file.read())

    def updater(manifest: Dict[str, Any]) -> None:
        manifest["rulebook"] = {
            "filename": file.filename,
            "path": str(target),
            "size": target.stat().st_size,
            "uploadedAt": _utc_now(),
            "heuristicsApplied": bool(heuristics),
        }

    manifest = _update_manifest(project_id, updater)
    background_tasks.add_task(_generate_pdf_summary, project_id)
    return {"ok": True, "project": manifest}


def _generate_pdf_summary(project_id: str) -> None:
    time.sleep(0.1)
    manifest_manager.load(project_id)


@app.post("/script/generate")
def generate_script(payload: ScriptRequest):
    project_id = validate_project_id(payload.project["id"])

    segments: List[Dict[str, Any]] = []
    for index in range(1, 4):
        segments.append(
            {
                "id": f"seg-{index}",
                "title": f"Section {index}",
                "text": f"Auto-generated narration segment {index} for project {project_id}.",
                "duration": 12.0 + index,
            }
        )

    def updater(manifest: Dict[str, Any]) -> None:
        manifest["script"] = {
            "generatedAt": _utc_now(),
            "language": payload.lang,
            "segments": segments,
        }

    manifest = _update_manifest(project_id, updater)
    return {"ok": True, "segments": segments}


@app.post("/tts/generate")
def generate_tts(payload: TtsRequest):
    project_id = validate_project_id(payload.projectId)

    tts_dir = manifest_manager.project_dir(project_id) / "tts"
    tts_dir.mkdir(exist_ok=True)

    segments = []
    for segment in payload.segments:
        audio_path = tts_dir / f"{segment.id}.wav"
        if not audio_path.exists():
            audio_path.write_bytes(b"stub-audio")
        segments.append(
            {
                "id": segment.id,
                "title": segment.title or segment.id,
                "duration": segment.duration or 6.0,
                "text": segment.text,
                "audioPath": str(audio_path),
            }
        )

    def updater(manifest: Dict[str, Any]) -> None:
        manifest["tts"] = {
            "generatedAt": _utc_now(),
            "segments": segments,
        }

    manifest = _update_manifest(project_id, updater)
    return {"ok": True, "segments": segments}


@app.post("/render/compose")
def compose_render(payload: RenderRequest):
    project_id = validate_project_id(payload.project["id"])
    project_dir = manifest_manager.project_dir(project_id)
    preview_path = project_dir / "preview.mp4"
    if not preview_path.exists():
        preview_path.write_bytes(b"stub-preview")

    def updater(manifest: Dict[str, Any]) -> None:
        manifest["render"] = {
            "composedAt": _utc_now(),
            "mode": payload.options.mode,
            "previewPath": str(preview_path),
        }

    manifest = _update_manifest(project_id, updater)
    return {"ok": True, "preview": str(preview_path)}


@app.post("/project/save")
def save_project(payload: SaveProjectRequest):
    project_id = validate_project_id(payload.projectId)
    manifest = payload.manifest
    manifest_manager.save(project_id, manifest)
    return {"ok": True, "project": manifest_manager.load(project_id)}


@app.get("/project/load")
def load_project(projectId: str):
    project_id = validate_project_id(projectId)
    manifest = manifest_manager.load(project_id)
    return {"ok": True, "project": manifest}


@app.post("/project/load")
def load_project_post(payload: LoadProjectRequest):
    return load_project(payload.projectId)


@app.post("/project/export")
def project_export(payload: ExportRequest, background_tasks: BackgroundTasks):
    project_id = validate_project_id(payload.projectId)
    export_id = str(uuid.uuid4())
    status = {
        "exportId": export_id,
        "projectId": project_id,
        "state": "processing",
        "createdAt": _utc_now(),
        "zipPath": None,
    }
    with export_status_lock:
        export_status[export_id] = status
    _write_export_status(status)
    background_tasks.add_task(_perform_export, export_id, project_id)
    return {"ok": True, "exportId": export_id, "state": status["state"]}


def _write_export_status(status: Dict[str, Any]) -> None:
    path = EXPORTS_DIR / f"{status['exportId']}.json"
    with path.open("w", encoding="utf-8") as fh:
        json.dump(status, fh, indent=2, sort_keys=True)


def _perform_export(export_id: str, project_id: str) -> None:
    try:
        manifest = manifest_manager.load(project_id)
        project_dir = manifest_manager.project_dir(project_id)
        export_dir = EXPORTS_DIR
        export_dir.mkdir(parents=True, exist_ok=True)
        zip_path = export_dir / f"{export_id}.zip"

        captions_dir = project_dir / "captions"
        captions_dir.mkdir(exist_ok=True)
        subtitles = captions_dir / "subtitles.srt"
        if not subtitles.exists():
            subtitles.write_text("1\n00:00:00,000 --> 00:00:05,000\nWelcome to your tutorial.\n", encoding="utf-8")

        description_path = project_dir / "description.txt"
        if not description_path.exists():
            description_path.write_text("Automated description for project {project_id}.\n", encoding="utf-8")

        thumbnail_path = project_dir / "thumbnail.jpg"
        if not thumbnail_path.exists():
            thumbnail_bytes = (
                b"\xff\xd8\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\x09\x09\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f"
                b"\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c !$.' ,#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x03\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xd2\xcf\xff\xd9"
            )
            thumbnail_path.write_bytes(thumbnail_bytes)

        manifest_path = manifest_manager.manifest_path(project_id)

        import zipfile

        with zipfile.ZipFile(zip_path, "w") as archive:
            archive.write(manifest_path, arcname="manifest.json")
            archive.write(subtitles, arcname="captions/subtitles.srt")
            archive.write(description_path, arcname="description.txt")
            archive.write(thumbnail_path, arcname="thumbnail.jpg")

        manifest_export_entry = {
            "exportId": export_id,
            "createdAt": _utc_now(),
            "zipPath": str(zip_path),
        }
        
        def updater(manifest_data: Dict[str, Any]) -> None:
            exports = manifest_data.get("exports") or []
            exports = [entry for entry in exports if entry.get("exportId") != export_id]
            exports.append(manifest_export_entry)
            manifest_data["exports"] = exports

        manifest = _update_manifest(project_id, updater)

        status = {
            "exportId": export_id,
            "projectId": project_id,
            "state": "complete",
            "createdAt": manifest_export_entry["createdAt"],
            "zipPath": str(zip_path),
            "manifest": manifest,
        }
        with export_status_lock:
            export_status[export_id] = status
        _write_export_status(status)
    except Exception as exc:  # noqa: BLE001
        status = {
            "exportId": export_id,
            "projectId": project_id,
            "state": "failed",
            "error": str(exc),
            "createdAt": _utc_now(),
        }
        with export_status_lock:
            export_status[export_id] = status
        _write_export_status(status)


@app.get("/project/export/status")
def export_status_endpoint(exportId: str):
    with export_status_lock:
        status = export_status.get(exportId)
    if not status:
        path = EXPORTS_DIR / f"{exportId}.json"
        if path.exists():
            status = json.loads(path.read_text("utf-8"))
    if not status:
        raise HTTPException(status_code=404, detail="exportId not found")
    return {"ok": True, **status}


@app.get("/audio/duck")
def audio_duck():
    return {"ok": True}
