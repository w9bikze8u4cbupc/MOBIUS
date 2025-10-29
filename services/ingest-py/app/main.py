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
  """
  Ensure the runtime data directories exist by creating DATA_DIR, UPLOAD_DIR, and PROJECT_DIR if they are missing.
  """
  for folder in (DATA_DIR, UPLOAD_DIR, PROJECT_DIR):
    folder.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
async def startup_event() -> None:
  """
  Ensure required runtime directories exist when the application starts.
  
  Creates the data, uploads, and projects directories under the project root if they are missing so the application has the necessary filesystem layout at startup.
  """
  ensure_directories()


@app.get("/health")
async def health() -> Dict[str, bool]:
  """
  Report service health status.
  
  Returns:
      dict: Mapping with key "ok" set to True when the service is healthy.
  """
  return {"ok": True}


def persist_payload(path: Path, payload: Dict[str, Any]) -> None:
  """
  Persist a JSON-serializable payload to the given file path.
  
  Writes the provided mapping as JSON text to the specified filesystem path, replacing any existing file content.
  
  Parameters:
      path (Path): Destination file path where the JSON will be written.
      payload (Dict[str, Any]): Mapping to serialize and persist as JSON.
  """
  path.write_text(JSONResponse(content=payload).body.decode("utf-8"))


@app.post("/ingest/pdf")
async def ingest_pdf(file: Optional[UploadFile] = File(default=None), projectId: Optional[str] = None) -> Dict[str, Any]:
  """
  Handle PDF ingestion by optionally saving an uploaded file and persisting ingestion metadata for a project.
  
  Parameters:
      file (Optional[UploadFile]): Uploaded PDF file to save. If provided, the file is written to the uploads directory using its original filename or "upload.pdf" when no filename is present.
      projectId (Optional[str]): Identifier used to associate the ingestion and to name the persisted payload file (saved under PROJECT_DIR as `pdf_ingest_{projectId or 'anonymous'}.json`).
  
  Returns:
      Dict[str, Any]: A dictionary with keys:
          - "ok": always True.
          - "file": the saved filename if a file was provided, otherwise None.
          - "projectId": the provided projectId (may be None).
  
  Raises:
      HTTPException: Raised with status 400 when an uploaded file is present but empty.
  """
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
  """
  Persist the given payload to a file named "<endpoint>.json" in the project directory and return a standardized acknowledgment.
  
  Parameters:
  	endpoint (str): File-stem used to name the saved JSON file (saved as PROJECT_DIR/{endpoint}.json).
  	payload (Dict[str, Any]): JSON-serializable object to persist.
  
  Returns:
  	result (Dict[str, Any]): A dictionary with keys `ok` (`True`), `endpoint` (the provided endpoint), and `payload` (the original payload).
  """
  ensure_directories()
  payload_path = PROJECT_DIR / f"{endpoint}.json"
  persist_payload(payload_path, payload)
  return {"ok": True, "endpoint": endpoint, "payload": payload}


@app.post("/ingest/bgg")
async def ingest_bgg(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist a BoardGameGeek ingestion payload and return a standardized acknowledgement.
  
  Parameters:
      payload (Dict[str, Any]): The payload to persist for BGG ingestion.
  
  Returns:
      Dict[str, Any]: A response object with `ok` set to `True`, `endpoint` equal to `"ingest_bgg"`, and `payload` containing the original payload.
  """
  return await echo_json("ingest_bgg", payload)


@app.post("/script/generate")
async def script_generate(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist the provided payload under the "script_generate" endpoint and return a standardized result.
  
  Parameters:
  	payload (Dict[str, Any]): The JSON-serializable payload to persist.
  
  Returns:
  	result (Dict[str, Any]): A dictionary with keys:
  		- "ok" (bool): `true` if the payload was persisted.
  		- "endpoint" (str): The endpoint name ("script_generate").
  		- "payload" (Dict[str, Any]): The original payload that was persisted.
  """
  return await echo_json("script_generate", payload)


@app.post("/tts/generate")
async def tts_generate(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Store the provided payload for text-to-speech generation and return a standardized echo response.
  
  Parameters:
      payload (Dict[str, Any]): Payload data to persist for the TTS generation request.
  
  Returns:
      Dict[str, Any]: Response containing `ok`, `endpoint` set to `"tts_generate"`, and the original `payload`.
  """
  return await echo_json("tts_generate", payload)


@app.post("/render/compose")
async def render_compose(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist the given payload under the "render_compose" endpoint and return a standardized result.
  
  Parameters:
      payload (Dict[str, Any]): The request payload for the render/compose operation to be stored.
  
  Returns:
      dict: Response with keys `ok`, `endpoint`, and `payload` — `ok` is `True` on success, `endpoint` is `"render_compose"`, and `payload` is the original payload.
  """
  return await echo_json("render_compose", payload)


@app.post("/project/save")
async def project_save(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist a project payload to storage and return a standardized response.
  
  Parameters:
      payload (Dict[str, Any]): The project data to persist.
  
  Returns:
      result (Dict[str, Any]): A response object with keys `ok` (True if the payload was persisted), `endpoint` (the endpoint name `"project_save"`), and `payload` (the original payload).
  """
  return await echo_json("project_save", payload)


@app.post("/project/load")
async def project_load(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist the provided project payload under the "project_load" endpoint and return a confirmation.
  
  Parameters:
      payload (Dict[str, Any]): Project data to persist.
  
  Returns:
      result (Dict[str, Any]): Dictionary with keys `ok` (True on success), `endpoint` ("project_load"), and `payload` (the stored payload).
  """
  return await echo_json("project_load", payload)


@app.get("/project/load")
async def project_load_get(projectId: Optional[str] = None) -> Dict[str, Any]:
  """
  Retrieve a previously saved project payload by projectId.
  
  Parameters:
      projectId (Optional[str]): Project identifier used to locate the stored JSON file; 'anonymous' is used when None.
  
  Returns:
      Dict[str, Any]: Dictionary with keys `ok` (True), `projectId`, and `payload` — `payload` contains the file's JSON text if found, `None` otherwise.
  """
  ensure_directories()
  payload_path = PROJECT_DIR / f"project_load_{projectId or 'anonymous'}.json"
  if payload_path.exists():
    return {"ok": True, "projectId": projectId, "payload": payload_path.read_text()}
  return {"ok": True, "projectId": projectId, "payload": None}


@app.post("/project/export")
async def project_export(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist a project export payload and return an acknowledgment of the stored data.
  
  Parameters:
      payload (Dict[str, Any]): The project export data to persist.
  
  Returns:
      Dict[str, Any]: A response dictionary containing `ok` (bool), `endpoint` (str), and `payload` (the persisted payload).
  """
  return await echo_json("project_export", payload)


@app.post("/audio/duck")
async def audio_duck(payload: Dict[str, Any]) -> Dict[str, Any]:
  """
  Persist the audio duck payload to project storage under the "audio_duck" endpoint.
  
  Parameters:
      payload (Dict[str, Any]): The payload to persist for the audio duck operation.
  
  Returns:
      Dict[str, Any]: A response dictionary with keys:
          - "ok": `True` if the payload was stored successfully, `False` otherwise.
          - "endpoint": The endpoint name used for storage ("audio_duck").
          - "payload": The original payload that was persisted.
  """
  return await echo_json("audio_duck", payload)