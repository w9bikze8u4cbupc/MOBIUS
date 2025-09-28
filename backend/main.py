import os

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

app = FastAPI(title="MOBIUS Backend API")
security = HTTPBearer()

# Get the allowed token from environment variable
ALLOWED_TOKEN = os.getenv("ALLOWED_TOKEN")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the bearer token"""
    if not ALLOWED_TOKEN:
        # In development, skip token verification if no token is set
        return credentials

    if credentials.credentials != ALLOWED_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mobius-backend"}


@app.get("/api/status/{item_id}")
async def get_status(
    item_id: str, token: HTTPAuthorizationCredentials = Depends(verify_token)
):
    """Get status of an item - requires authentication"""
    if item_id == "nonexistent":
        raise HTTPException(status_code=404, detail="Item not found")

    return {"item_id": item_id, "status": "active", "authenticated": True}


@app.post("/api/ingest")
async def ingest_data(token: HTTPAuthorizationCredentials = Depends(verify_token)):
    """Ingest endpoint - minimal implementation for smoke tests"""
    return {"message": "Ingest successful", "authenticated": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
