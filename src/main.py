import os
from typing import Any, Dict

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Security
security = HTTPBearer()

app = FastAPI(
    title="MOBIUS FastAPI Backend",
    description="Game tutorial video generation API",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the authorization token"""
    allowed_token = os.getenv("ALLOWED_TOKEN")
    if not allowed_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error",
        )

    if credentials.credentials != allowed_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    return credentials


@app.get("/health")
async def health_check(
    token: HTTPAuthorizationCredentials = Depends(verify_token),
) -> Dict[str, Any]:
    """Health check endpoint with authentication"""
    return {
        "status": "healthy",
        "service": "MOBIUS FastAPI Backend",
        "version": "1.0.0",
    }


@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint"""
    return {"message": "MOBIUS FastAPI Backend - Game Tutorial Generator"}


@app.get("/api/status")
async def api_status(
    token: HTTPAuthorizationCredentials = Depends(verify_token),
) -> Dict[str, Any]:
    """API status with authentication"""
    return {
        "api_status": "operational",
        "features": {
            "component_extraction": "ready",
            "video_generation": "ready",
            "bgg_metadata": "ready",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
