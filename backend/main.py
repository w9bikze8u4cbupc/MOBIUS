"""
FastAPI backend service for MOBIUS game tutorial ingestion.

This service provides endpoints for:
- File upload and processing
- Job status tracking
- Health checks
- Game metadata extraction
"""

import os
import uuid
import logging
from datetime import datetime
from typing import Optional, Dict, List, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="MOBIUS Game Tutorial Ingestion API",
    description=(
        "FastAPI service for processing game rulebook uploads "
        "and generating tutorial content"
    ),
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()
ALLOWED_TOKEN = os.getenv("ALLOWED_TOKEN", "dev-token-123")

# In-memory job store (TODO: Replace with Redis/DB in production)
job_store: Dict[str, Dict[str, Any]] = {}

# Upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


# Pydantic models
class JobStatus(BaseModel):
    job_id: str
    status: str = Field(..., pattern="^(pending|processing|completed|failed)$")
    created_at: datetime
    updated_at: datetime
    file_name: Optional[str] = None
    progress: int = Field(0, ge=0, le=100)
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class UploadResponse(BaseModel):
    job_id: str
    message: str
    file_name: str
    file_size: int


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    version: str


# Dependencies
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Verify API token (simple implementation for dev)"""
    if credentials.credentials != ALLOWED_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


# API endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(status="healthy", timestamp=datetime.now(), version="1.0.0")


@app.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get status of a processing job"""
    if job_id not in job_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found"
        )

    job = job_store[job_id]
    return JobStatus(**job)


@app.get("/jobs", response_model=List[JobStatus])
async def list_jobs(token: str = Depends(verify_token)):
    """List all jobs (requires authentication)"""
    return [JobStatus(**job) for job in job_store.values()]


@app.post("/ingest", response_model=UploadResponse)
async def ingest_file(file: UploadFile = File(...), token: str = Depends(verify_token)):
    """
    Upload and process a game rulebook file.

    Supports PDF, TXT, and DOC formats.
    Returns a job ID for tracking processing status.
    """

    # Validate file type
    allowed_types = {".pdf", ".txt", ".doc", ".docx"}
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type: {file_ext}. "
                f"Allowed: {', '.join(allowed_types)}"
            ),
        )

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Save uploaded file
    file_path = UPLOAD_DIR / f"{job_id}_{file.filename}"

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Create job record
        job_record = {
            "job_id": job_id,
            "status": "pending",
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "file_name": file.filename,
            "progress": 0,
            "result": None,
            "error_message": None,
        }

        job_store[job_id] = job_record

        # TODO: Trigger async processing
        logger.info(f"File uploaded: {file.filename} -> Job ID: {job_id}")

        return UploadResponse(
            job_id=job_id,
            message="File uploaded successfully. Processing started.",
            file_name=file.filename,
            file_size=len(content),
        )

    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}",
        )


@app.post("/process/{job_id}")
async def trigger_processing(job_id: str, token: str = Depends(verify_token)):
    """Manually trigger processing for a job (for testing)"""

    if job_id not in job_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found"
        )

    job = job_store[job_id]

    # Simulate processing
    job["status"] = "processing"
    job["progress"] = 50
    job["updated_at"] = datetime.now()

    # TODO: Add actual processing logic
    logger.info(f"Started processing job: {job_id}")

    return {"message": f"Processing started for job {job_id}"}


@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str, token: str = Depends(verify_token)):
    """Delete a job and its associated files"""

    if job_id not in job_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found"
        )

    # Remove from store
    job = job_store.pop(job_id)

    # Clean up file
    if job.get("file_name"):
        file_path = UPLOAD_DIR / f"{job_id}_{job['file_name']}"
        if file_path.exists():
            file_path.unlink()

    logger.info(f"Deleted job: {job_id}")

    return {"message": f"Job {job_id} deleted successfully"}


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code},
    )


if __name__ == "__main__":
    # For development
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
