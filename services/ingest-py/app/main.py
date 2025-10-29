"""Core FastAPI application for the offline ingest workflow."""
from __future__ import annotations

import base64
import json
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_TITLE = "Mobius Ingest Service"
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = REPO_ROOT / "data"
PROJECTS_DIR = DATA_ROOT / "projects"
EXPORTS_DIR = DATA_ROOT / "exports"

for _path in (DATA_ROOT, PROJECTS_DIR, EXPORTS_DIR):
    _path.mkdir(parents=True, exist_ok=True)

THUMBNAIL_BYTES = base64.b64decode(
    """
    /9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUXFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGzAlICUvLS8vLy8tLS0tLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKgBLAMBIgACEQEDEQH/xAAbAAEAAgMBAQAAAAAAAAAAAAAABQYBBAcCA//EADsQAAIBAgQDBgQDBwMFAQAAAAECAAMRBBIhMQVBUQYiYXGBEzKRobHBFBUjUlJy0eHwM4Ky0uEVFiRDcoOSorL/xAAZAQEAAwEBAAAAAAAAAAAAAAAAAQIDBAX/xAAkEQEBAAICAgICAwEAAAAAAAAAAQIRAxIhMUFRBEEiYXETcf/aAAwDAQACEQMRAD8A+4oooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z
    """
)

DESCRIPTION_PLACEHOLDER = "This is an auto-generated tutorial package.\n"


class SaveProjectRequest(BaseModel):
    """Body model for persisting a manifest."""

    projectId: str = Field(..., description="Identifier of the project being saved")
    manifest: Dict[str, Any] = Field(default_factory=dict)


class LoadProjectRequest(BaseModel):
    """Body model for loading a manifest via POST."""

    projectId: str = Field(..., description="Identifier of the project to load")


class BggIngestRequest(BaseModel):
    """Input payload for the BoardGameGeek ingest simulation."""

    projectId: str
    bggUrl: str


class ScriptGenerateRequest(BaseModel):
    """Request payload for the script generation stub."""

    project: Dict[str, Any]
    lang: str = "en"


class TtsSegment(BaseModel):
    """Individual TTS segment description."""

    id: str
    duration: Optional[float] = None
    text: Optional[str] = None


class TtsGenerateRequest(BaseModel):
    """Request payload for the TTS generation stub."""

    projectId: str
    segments: List[TtsSegment] = Field(default_factory=list)


class RenderComposeRequest(BaseModel):
    """Request payload for render composition stub."""

    project: Dict[str, Any]
    options: Dict[str, Any] = Field(default_factory=dict)


class ExportRequest(BaseModel):
    """Request payload for export generation."""

    projectId: str


app = FastAPI(title=APP_TITLE)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, Any]:
    """Simple health endpoint."""

    return {"ok": True, "service": APP_TITLE}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def _manifest_path(project_id: str) -> Path:
    return _project_dir(project_id) / "manifest.json"


def _export_status_path(export_id: str) -> Path:
    return EXPORTS_DIR / f"{export_id}.json"


def _export_zip_path(export_id: str) -> Path:
    return EXPORTS_DIR / f"{export_id}.zip"


def _ensure_project_structure(project_id: str) -> None:
    project_dir = _project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "uploads").mkdir(parents=True, exist_ok=True)


def _read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def _default_manifest(project_id: str) -> Dict[str, Any]:
    now = _utc_now()
    return {
        "id": project_id,
        "createdAt": now,
        "updatedAt": now,
        "components": [],
        "setup": [],
        "metadata": {},
    }


def _load_manifest(project_id: str) -> Dict[str, Any]:
    path = _manifest_path(project_id)
    if path.exists():
        return _read_json(path)
    manifest = _default_manifest(project_id)
    _write_json(path, manifest)
    return manifest


def _load_manifest_if_exists(project_id: str) -> Optional[Dict[str, Any]]:
    path = _manifest_path(project_id)
    if not path.exists():
        return None
    return _read_json(path)


def _merge_dicts(base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {**base}
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def _persist_manifest(project_id: str, manifest: Dict[str, Any]) -> Dict[str, Any]:
    manifest = {**manifest}
    manifest.setdefault("id", project_id)
    now = _utc_now()
    manifest.setdefault("createdAt", now)
    manifest["updatedAt"] = now
    _write_json(_manifest_path(project_id), manifest)
    return manifest


def _bool_from_value(value: Optional[Any]) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _deterministic_components(file_name: str) -> List[Dict[str, Any]]:
    base_name = Path(file_name).stem.replace("_", " ").title() or "Rulebook"
    return [
        {
            "id": f"component-{index}",
            "title": title,
            "summary": summary,
        }
        for index, (title, summary) in enumerate(
            [
                (f"{base_name} Overview", "High-level summary of the rules."),
                ("Setup Essentials", "Key components required before starting."),
                ("Turn Structure", "Outline of what players do on their turn."),
            ],
            start=1,
        )
    ]


def _deterministic_setup() -> List[str]:
    return [
        "Lay out the board and core components.",
        "Shuffle all decks and distribute starting resources.",
        "Select a first player using any preferred method.",
    ]


def _write_upload(project_id: str, upload: UploadFile, content: bytes) -> Path:
    uploads_dir = _project_dir(project_id) / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    sanitized = Path(upload.filename or "document").name
    destination = uploads_dir / sanitized
    with destination.open("wb") as handle:
        handle.write(content)
    return destination


def _manifest_description(manifest: Dict[str, Any]) -> Iterable[str]:
    metadata = manifest.get("metadata", {})
    title = metadata.get("title") or manifest.get("title") or "Board Game Tutorial"
    yield f"Tutorial for {title}."
    components = manifest.get("components", [])
    if components:
        yield "Highlights: " + ", ".join(component.get("title", "Segment") for component in components[:3]) + "."


def _placeholder_srt(manifest: Dict[str, Any]) -> str:
    segments = manifest.get("components", [])
    lines: List[str] = []
    if not segments:
        segments = [
            {"title": "Welcome", "summary": "Introduction to the tutorial."},
            {"title": "Gameplay", "summary": "Core gameplay walkthrough."},
        ]
    for index, component in enumerate(segments, start=1):
        start_seconds = (index - 1) * 5
        end_seconds = start_seconds + 5
        lines.extend(
            [
                str(index),
                f"00:00:{start_seconds:02d},000 --> 00:00:{end_seconds:02d},000",
                component.get("summary") or component.get("title") or "Narration segment.",
                "",
            ]
        )
    return "\n".join(lines)


def _finalize_export(export_id: str, manifest: Dict[str, Any]) -> Path:
    zip_path = _export_zip_path(export_id)
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    description_lines = "\n".join(_manifest_description(manifest)) + "\n"
    srt_content = _placeholder_srt(manifest)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        archive.writestr("captions/subtitles.srt", srt_content)
        archive.writestr("description.txt", DESCRIPTION_PLACEHOLDER + description_lines)
        archive.writestr("thumbnail.jpg", THUMBNAIL_BYTES)
    return zip_path


def _create_export_status(project_id: str) -> Dict[str, Any]:
    export_id = f"{project_id}-{uuid.uuid4().hex[:8]}"
    status = {
        "exportId": export_id,
        "projectId": project_id,
        "state": "processing",
        "progress": 10,
        "createdAt": _utc_now(),
        "updatedAt": _utc_now(),
    }
    _write_json(_export_status_path(export_id), status)
    return status


def _complete_export(status: Dict[str, Any], zip_path: Path) -> Dict[str, Any]:
    completed = {**status}
    completed.update(
        {
            "state": "complete",
            "progress": 100,
            "zipPath": str(zip_path),
            "updatedAt": _utc_now(),
        }
    )
    _write_json(_export_status_path(completed["exportId"]), completed)
    return completed


@app.post("/ingest/pdf")
async def ingest_pdf(
    request: Request,
    projectId: str = Form(..., alias="projectId"),
    file: UploadFile = File(...),
    heuristics: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Handle PDF uploads with deterministic heuristics."""

    project_id = projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")

    enable_heuristics = _bool_from_value(heuristics) or _bool_from_value(
        request.query_params.get("heuristics")
    )
    _ensure_project_structure(project_id)
    contents = await file.read()
    destination = _write_upload(project_id, file, contents)
    manifest = _load_manifest(project_id)
    documents = manifest.get("documents", [])
    documents = [doc for doc in documents if doc.get("path") != str(destination)]
    documents.append({"name": file.filename, "path": str(destination)})
    manifest["documents"] = documents
    if enable_heuristics:
        manifest["components"] = _deterministic_components(file.filename or "Rulebook")
        manifest["setup"] = _deterministic_setup()
    manifest = _persist_manifest(project_id, manifest)
    return {
        "ok": True,
        "manifest": manifest,
        "upload": {"path": str(destination), "size": len(contents)},
        "heuristicsApplied": enable_heuristics,
    }


@app.post("/ingest/bgg")
def ingest_bgg(payload: BggIngestRequest) -> Dict[str, Any]:
    project_id = payload.projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")
    manifest = _load_manifest(project_id)
    manifest_metadata = manifest.get("metadata", {})
    title = payload.bggUrl.rstrip("/").split("/")[-1].replace("-", " ") or "Board Game"
    manifest_metadata.update(
        {
            "bggUrl": payload.bggUrl,
            "title": title.title(),
            "source": "BoardGameGeek",
        }
    )
    manifest["metadata"] = manifest_metadata
    manifest = _persist_manifest(project_id, manifest)
    return {"ok": True, "manifest": manifest}


@app.post("/script/generate")
def generate_script(payload: ScriptGenerateRequest) -> Dict[str, Any]:
    project = payload.project or {}
    project_id = str(project.get("id") or project.get("projectId") or "").strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="project.id is required")
    manifest = _load_manifest(project_id)
    components = manifest.get("components", [])
    script_segments: List[Dict[str, Any]] = []
    for index, component in enumerate(components, start=1):
        script_segments.append(
            {
                "id": f"seg-{index}",
                "title": component.get("title", f"Segment {index}"),
                "text": component.get("summary")
                or f"Narration for {component.get('title', f'Segment {index}')}",
                "duration": 8 + index,
            }
        )
    if not script_segments:
        script_segments.append(
            {
                "id": "seg-1",
                "title": "Introduction",
                "text": "Welcome to the automated tutorial.",
                "duration": 10,
            }
        )
    script_payload = {"language": payload.lang, "segments": script_segments}
    manifest["script"] = script_payload
    manifest = _persist_manifest(project_id, manifest)
    return {"ok": True, "script": script_payload}


@app.post("/tts/generate")
def generate_tts(payload: TtsGenerateRequest) -> Dict[str, Any]:
    project_id = payload.projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")
    clips: List[Dict[str, Any]] = []
    for segment in payload.segments:
        duration = segment.duration or max(len(segment.text or "") / 12.0, 3.0)
        clip_id = f"tts-{segment.id}"
        clips.append(
            {
                "id": clip_id,
                "segmentId": segment.id,
                "duration": round(duration, 2),
                "url": f"/audio/{clip_id}.mp3",
            }
        )
    manifest = _load_manifest(project_id)
    manifest["tts"] = {"clips": clips}
    manifest = _persist_manifest(project_id, manifest)
    return {"ok": True, "clips": clips}


@app.post("/render/compose")
def compose_render(payload: RenderComposeRequest) -> Dict[str, Any]:
    project = payload.project or {}
    project_id = str(project.get("id") or project.get("projectId") or "").strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="project.id is required")
    render_id = f"render-{uuid.uuid4().hex[:8]}"
    result = {
        "ok": True,
        "renderId": render_id,
        "status": "complete",
        "previewUrl": f"/renders/{render_id}.mp4",
        "projectId": project_id,
        "options": payload.options,
    }
    return result


@app.post("/project/save")
def save_project(payload: SaveProjectRequest) -> Dict[str, Any]:
    project_id = payload.projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")
    manifest = _load_manifest(project_id)
    merged_manifest = _merge_dicts(manifest, payload.manifest)
    persisted = _persist_manifest(project_id, merged_manifest)
    return {"ok": True, "manifest": persisted}


@app.get("/project/load")
def load_project_get(projectId: str) -> Dict[str, Any]:
    project_id = projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")
    manifest = _load_manifest_if_exists(project_id)
    if manifest is None:
        return {"id": project_id}
    return manifest


@app.post("/project/load")
def load_project_post(payload: LoadProjectRequest) -> Dict[str, Any]:
    project_id = payload.projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")
    manifest = _load_manifest_if_exists(project_id)
    if manifest is None:
        return {"id": project_id}
    return manifest


@app.get("/project/manifest")
def get_manifest(projectId: str) -> Dict[str, Any]:
    return load_project_get(projectId)


@app.post("/project/export")
def create_export(payload: ExportRequest) -> Dict[str, Any]:
    project_id = payload.projectId.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="projectId is required")
    manifest = _load_manifest(project_id)
    status = _create_export_status(project_id)
    zip_path = _finalize_export(status["exportId"], manifest)
    completed = _complete_export(status, zip_path)
    return completed


@app.get("/project/export/status")
def export_status(exportId: str) -> Dict[str, Any]:
    path = _export_status_path(exportId)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    return _read_json(path)


__all__ = ["app"]
