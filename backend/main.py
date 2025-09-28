"""
Simple FastAPI backend for MOBIUS CI workflow
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MOBIUS Backend", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ALLOWED_TOKEN checked at request time, not at startup


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mobius-backend"}


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "MOBIUS Backend API", "version": "1.0.0"}


@app.get("/api/status")
async def api_status():
    """API status endpoint with token validation"""
    allowed_token = os.environ.get("ALLOWED_TOKEN")  # Check at request time
    if not allowed_token:
        raise HTTPException(status_code=500, detail="ALLOWED_TOKEN not configured")

    return {
        "status": "ok",
        "token_configured": bool(allowed_token),
        "service": "mobius-backend",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
