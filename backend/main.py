import os
import json
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, Depends, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()
ALLOWED_TOKEN = os.getenv("ALLOWED_TOKEN", "dev_token_here")

# In-memory job store (TODO: Replace with Redis/Celery for production)
jobs_store: Dict[str, Dict[str, Any]] = {}

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected: {len(self.active_connections)} total connections")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected: {len(self.active_connections)} total connections")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Error sending WebSocket message: {e}")

    async def broadcast(self, message: str):
        if self.active_connections:
            await asyncio.gather(
                *[connection.send_text(message) for connection in self.active_connections],
                return_exceptions=True
            )

manager = ConnectionManager()

# Pydantic models
class IngestRequest(BaseModel):
    source: str = Field(..., description="Source of the ingestion")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

class JobResponse(BaseModel):
    job_id: str
    status: str
    created_at: str
    source: str
    metadata: Optional[Dict[str, Any]] = None
    file_info: Optional[Dict[str, Any]] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Authentication dependency
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != ALLOWED_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return credentials

# Create FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FastAPI ingestion service starting up...")
    yield
    logger.info("FastAPI ingestion service shutting down...")

app = FastAPI(
    title="MOBIUS Ingestion Service", 
    version="0.1.0",
    description="Dev-grade FastAPI ingestion service for MOBIUS with job lifecycle and WebSocket updates",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5001"],  # Staging domains will be added
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "mobius-ingestion",
        "version": "0.1.0"
    }

# Ingestion endpoint
@app.post("/api/ingest", response_model=JobResponse, tags=["Ingestion"])
async def ingest_data(
    metadata: str = Form(...),
    file: Optional[UploadFile] = File(None),
    credentials: HTTPAuthorizationCredentials = Depends(verify_token)
):
    """
    Ingest data with optional file upload and metadata.
    Supports JSON metadata and file uploads.
    """
    job_id = str(uuid.uuid4())
    
    try:
        # Parse metadata
        parsed_metadata = json.loads(metadata)
        source = parsed_metadata.get("source", "unknown")
        
        # Create job
        job_data = {
            "job_id": job_id,
            "status": "processing",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "metadata": parsed_metadata,
            "file_info": None
        }
        
        # Handle file upload
        if file:
            # Read file size
            file_content = await file.read()
            file_size = len(file_content)
            # TODO: Store file in S3 or persistent storage for production
            job_data["file_info"] = {
                "filename": file.filename,
                "content_type": file.content_type,
                "size": file_size
            }
            logger.info(f"job_id={job_id} File uploaded: {file.filename} ({file_size} bytes)")
        
        jobs_store[job_id] = job_data
        logger.info(f"job_id={job_id} Job created with source: {source}")
        
        # Simulate processing (in real implementation, this would trigger actual processing)
        asyncio.create_task(simulate_job_processing(job_id))
        
        # Broadcast job creation
        await manager.broadcast(json.dumps({
            "type": "job_created",
            "job_id": job_id,
            "status": "processing"
        }))
        
        return JobResponse(**job_data)
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in metadata")
    except Exception as e:
        logger.error(f"job_id={job_id} Ingestion error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

async def simulate_job_processing(job_id: str):
    """Simulate async job processing with status updates"""
    await asyncio.sleep(2)  # Simulate processing time
    
    if job_id in jobs_store:
        # Simulate success/failure (90% success rate)
        import random
        success = random.random() > 0.1
        
        if success:
            jobs_store[job_id].update({
                "status": "completed",
                "result": {"processed_items": 1, "processing_time_seconds": 2}
            })
            logger.info(f"job_id={job_id} Job completed successfully")
        else:
            jobs_store[job_id].update({
                "status": "failed",
                "error": "Simulated processing error"
            })
            logger.error(f"job_id={job_id} Job failed")
        
        # Broadcast status update
        await manager.broadcast(json.dumps({
            "type": "job_updated",
            "job_id": job_id,
            "status": jobs_store[job_id]["status"]
        }))

# Get job status
@app.get("/api/status/{job_id}", response_model=JobResponse, tags=["Status"])
async def get_job_status(job_id: str):
    """Get the current status of a job"""
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_data = jobs_store[job_id]
    logger.info(f"job_id={job_id} Status requested: {job_data['status']}")
    return JobResponse(**job_data)

# List jobs
@app.get("/api/jobs", response_model=List[JobResponse], tags=["Status"])
async def list_jobs(limit: int = 10):
    """List recent jobs"""
    job_list = list(jobs_store.values())
    # Sort by created_at descending
    job_list.sort(key=lambda x: x["created_at"], reverse=True)
    return [JobResponse(**job) for job in job_list[:limit]]

# WebSocket endpoint for real-time updates
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)