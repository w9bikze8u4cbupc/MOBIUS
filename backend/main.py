from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import uuid
import json
import os
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MOBIUS Ingest API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Environment variables
ALLOWED_TOKEN = os.getenv("ALLOWED_TOKEN", "REPLACE_WITH_PROD_TOKEN")

# In-memory job store (in production, use Redis or a database)
job_store: Dict[str, Dict[str, Any]] = {}

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        self.active_connections[job_id] = websocket

    def disconnect(self, job_id: str):
        if job_id in self.active_connections:
            del self.active_connections[job_id]

    async def send_update(self, job_id: str, message: dict):
        if job_id in self.active_connections:
            try:
                await self.active_connections[job_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send WebSocket update for job {job_id}: {e}")
                self.disconnect(job_id)

manager = ConnectionManager()

# Pydantic models
class IngestResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    metadata: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Authentication dependency
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != ALLOWED_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return credentials.credentials

# Helper functions
def create_job(metadata: Optional[Dict[str, Any]] = None, file_info: Optional[Dict[str, Any]] = None) -> str:
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    job_store[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0.0,
        "metadata": metadata or {},
        "file_info": file_info,
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": None
    }
    
    logger.info(f"Created job {job_id}")
    return job_id

async def update_job_status(job_id: str, status: str, progress: float = None, result: Dict[str, Any] = None, error: str = None):
    if job_id not in job_store:
        return
    
    job_store[job_id]["status"] = status
    job_store[job_id]["updated_at"] = datetime.utcnow().isoformat()
    
    if progress is not None:
        job_store[job_id]["progress"] = progress
    if result is not None:
        job_store[job_id]["result"] = result
    if error is not None:
        job_store[job_id]["error"] = error
    
    # Send WebSocket update
    await manager.send_update(job_id, {
        "type": "status_update",
        "data": job_store[job_id]
    })
    
    logger.info(f"Updated job {job_id}: status={status}, progress={progress}")

async def simulate_processing(job_id: str):
    """Simulate async processing of ingested data"""
    try:
        await update_job_status(job_id, "processing", 0.0)
        
        # Simulate processing steps
        steps = [
            ("Validating input", 0.2),
            ("Processing data", 0.5),
            ("Generating output", 0.8),
            ("Finalizing", 1.0)
        ]
        
        for step_name, progress in steps:
            await asyncio.sleep(1)  # Simulate work
            await update_job_status(job_id, "processing", progress)
            await manager.send_update(job_id, {
                "type": "progress_update",
                "data": {
                    "job_id": job_id,
                    "step": step_name,
                    "progress": progress
                }
            })
        
        # Complete the job
        result = {
            "processed_at": datetime.utcnow().isoformat(),
            "output": "Processing completed successfully"
        }
        await update_job_status(job_id, "completed", 1.0, result=result)
        
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        await update_job_status(job_id, "failed", error=str(e))

# API Endpoints

@app.get("/")
async def root():
    return {"message": "MOBIUS Ingest API", "status": "running"}

@app.post("/api/ingest", response_model=IngestResponse)
async def ingest_data(
    token: str = Depends(verify_token),
    file: Optional[UploadFile] = File(None),
    metadata: str = Form(...)
):
    """
    Ingest data for processing. Accepts either file upload or JSON metadata.
    """
    try:
        # Parse metadata
        try:
            metadata_dict = json.loads(metadata)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in metadata field")
        
        file_info = None
        if file:
            file_info = {
                "filename": file.filename,
                "content_type": file.content_type,
                "size": file.size if hasattr(file, 'size') else None
            }
            # In a real implementation, save the file here
            logger.info(f"Received file: {file.filename} ({file.content_type})")
        
        # Create job
        job_id = create_job(metadata=metadata_dict, file_info=file_info)
        
        # Start async processing
        asyncio.create_task(simulate_processing(job_id))
        
        return IngestResponse(
            job_id=job_id,
            status="queued",
            message="Data ingestion started"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/status/{job_id}", response_model=JobStatus)
async def get_job_status(
    job_id: str,
    token: str = Depends(verify_token)
):
    """
    Get the status of a specific job.
    """
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[job_id]
    return JobStatus(**job)

@app.websocket("/ws/status/{job_id}")
async def websocket_status(websocket: WebSocket, job_id: str, token: str = None):
    """
    WebSocket endpoint for real-time job status updates.
    """
    # Basic token validation for WebSocket
    if token != ALLOWED_TOKEN:
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    if job_id not in job_store:
        await websocket.close(code=1008, reason="Job not found")
        return
    
    await manager.connect(websocket, job_id)
    
    try:
        # Send initial status
        await manager.send_update(job_id, {
            "type": "initial_status",
            "data": job_store[job_id]
        })
        
        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_text()
                # Echo back for keepalive
                await websocket.send_text(json.dumps({"type": "ping", "data": "pong"}))
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error for job {job_id}: {e}")
                break
    
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(job_id)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "active_jobs": len(job_store),
        "active_websockets": len(manager.active_connections)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)