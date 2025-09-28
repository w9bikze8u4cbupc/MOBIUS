from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from uuid import uuid4
import asyncio
import time
import hashlib

app = FastAPI(title="dhash-ingest-api")
security = HTTPBearer()

# Simple bearer token check (replace with real auth)
ALLOWED_TOKEN = "REPLACE_WITH_PROD_TOKEN"

def require_token(creds: HTTPAuthorizationCredentials = Depends(security)):
    if creds.credentials != ALLOWED_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
    return True

# In-memory job store
jobs = {}  # job_id -> {"status": "pending|running|success|failed", "progress": 0, "result": {...}}

class IngestResponse(BaseModel):
    job_id: str

@app.post("/api/ingest", response_model=IngestResponse)
async def ingest(background_tasks: BackgroundTasks, file: UploadFile | None = File(None), metadata: str | None = None, authorized: bool = Depends(require_token)):
    job_id = str(uuid4())
    jobs[job_id] = {"status": "queued", "progress": 0, "result": None, "created_at": time.time()}
    # Save a small uploaded file snapshot for demo (not production)
    if file:
        content = await file.read()
        sha = hashlib.sha256(content).hexdigest()
        jobs[job_id]["upload_sha256"] = sha
    # enqueue background work
    background_tasks.add_task(process_job, job_id, metadata)
    return {"job_id": job_id}

async def process_job(job_id: str, metadata: str | None):
    try:
        jobs[job_id]["status"] = "running"
        # simulate steps with progress updates
        for p in range(1, 101, 10):
            jobs[job_id]["progress"] = p
            # try to notify any waiting websocket consumers by storing push messages
            await asyncio.sleep(0.3)  # simulate work
        # final result
        jobs[job_id]["status"] = "success"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = {"message": "Ingested OK", "metadata": metadata}
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["result"] = {"error": str(e)}

@app.get("/api/status/{job_id}")
async def status(job_id: str, authorized: bool = Depends(require_token)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, "status": job["status"], "progress": job["progress"], "result": job.get("result")}

# Simple WebSocket pub/sub: clients connect and poll job store; for demo we push periodic updates
active_ws = {}  # job_id -> set of websockets

@app.websocket("/ws/status/{job_id}")
async def ws_status(websocket: WebSocket, job_id: str, token: str):
    # token passed as query param for websockets (or use cookie/headers via subprotocol)
    if token != ALLOWED_TOKEN:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    conns = active_ws.setdefault(job_id, set())
    conns.add(websocket)
    try:
        while True:
            # send current job state; sleep briefly to avoid tight loop
            job = jobs.get(job_id, {"status": "unknown", "progress": 0})
            await websocket.send_json({"job_id": job_id, "status": job["status"], "progress": job["progress"], "result": job.get("result")})
            if job.get("status") in ("success", "failed"):
                # send final state then close
                await websocket.close()
                break
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    finally:
        conns.discard(websocket)