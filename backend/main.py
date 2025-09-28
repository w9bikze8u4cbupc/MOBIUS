#!/usr/bin/env python3
"""
FastAPI ingestion service for MOBIUS game tutorial generation.
Provides endpoints for document processing and health checks.
"""

import os
from typing import Any, Dict

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

app = FastAPI(
    title="MOBIUS Ingestion Service",
    description="FastAPI service for processing game documents and tutorials",
    version="1.0.0",
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple token-based auth for development
security = HTTPBearer()


def get_allowed_token() -> str:
    """Get allowed token from environment variables."""
    return os.getenv("ALLOWED_TOKEN", "dev-token-please-change-in-production")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the authorization token."""
    allowed_token = get_allowed_token()
    if credentials.credentials != allowed_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint for container readiness/liveness probes."""
    return {"status": "healthy", "service": "mobius-ingestion", "version": "1.0.0"}


@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint with service information."""
    return {"message": "MOBIUS Ingestion Service", "docs": "/docs"}


@app.post("/api/process-document")
async def process_document(token: str = Depends(verify_token)) -> Dict[str, Any]:
    """
    Process uploaded game documents.
    Requires valid authentication token.
    """
    # Placeholder for document processing logic
    return {
        "status": "success",
        "message": "Document processing endpoint - implementation pending",
        "features": [
            "PDF text extraction",
            "Component identification",
            "Rule summarization",
            "Tutorial generation",
        ],
    }


@app.get("/api/status")
async def get_status(token: str = Depends(verify_token)) -> Dict[str, Any]:
    """Get service status with authentication."""
    return {
        "authenticated": True,
        "service": "mobius-ingestion",
        "endpoints": ["/health", "/api/process-document", "/api/status"],
        "auth_required": ["process-document", "status"],
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app", host="0.0.0.0", port=port, reload=os.getenv("ENV") == "development"
    )
