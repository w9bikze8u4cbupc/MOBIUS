from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = APP_ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PROJECT_DIR = DATA_DIR / "projects"

app = FastAPI(title="Mobius Board Game Video Generator API", version="0.1.0")


def ensure_directories() -> None:
  """Create the runtime data directories if they are missing."""
  for folder in (DATA_DIR, UPLOAD_DIR, PROJECT_DIR):
    folder.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
async def startup_event() -> None:
  ensure_directories()


@app.get("/health")
async def health() -> Dict[str, bool]:
  return {"ok": True}


def persist_payload(path: Path, payload: Dict[str, Any]) -> None:
  path.write_text(JSONResponse(content=payload).body.decode("utf-8"))


@app.post("/ingest/pdf")
async def ingest_pdf(file: Optional[UploadFile] = File(default=None), projectId: Optional[str] = None) -> Dict[str, Any]:
  ensure_directories()
  saved_file: Optional[str] = None

  if file is not None:
    destination = UPLOAD_DIR / (file.filename or "upload.pdf")
    with destination.open("wb") as buffer:
      contents = await file.read()
      if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
      buffer.write(contents)
    saved_file = destination.name

  payload_path = PROJECT_DIR / f"pdf_ingest_{projectId or 'anonymous'}.json"
  persist_payload(payload_path, {"projectId": projectId, "file": saved_file})
  return {"ok": True, "file": saved_file, "projectId": projectId}


async def echo_json(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
  ensure_directories()
  payload_path = PROJECT_DIR / f"{endpoint}.json"
  persist_payload(payload_path, payload)
  return {"ok": True, "endpoint": endpoint, "payload": payload}


@app.post("/ingest/bgg")
async def ingest_bgg(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("ingest_bgg", payload)


@app.post("/script/generate")
async def script_generate(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("script_generate", payload)


@app.post("/tts/generate")
async def tts_generate(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("tts_generate", payload)


@app.post("/render/compose")
async def render_compose(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("render_compose", payload)


@app.post("/project/save")
async def project_save(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("project_save", payload)


@app.post("/project/load")
async def project_load(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("project_load", payload)


@app.get("/project/load")
async def project_load_get(projectId: Optional[str] = None) -> Dict[str, Any]:
  ensure_directories()
  payload_path = PROJECT_DIR / f"project_load_{projectId or 'anonymous'}.json"
  if payload_path.exists():
    return {"ok": True, "projectId": projectId, "payload": payload_path.read_text()}
  return {"ok": True, "projectId": projectId, "payload": None}


@app.post("/project/export")
async def project_export(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("project_export", payload)


@app.post("/audio/duck")
async def audio_duck(payload: Dict[str, Any]) -> Dict[str, Any]:
  return await echo_json("audio_duck", payload)
