import logging
import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MOBIUS API", version="1.0.0")

security = HTTPBearer()

# Environment variables
ALLOWED_TOKEN = os.getenv("ALLOWED_TOKEN")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the bearer token"""
    if not ALLOWED_TOKEN:
        raise HTTPException(status_code=500, detail="Server configuration error")

    if credentials.credentials != ALLOWED_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")

    return credentials.credentials


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mobius-api"}


@app.get("/api/status/{item_id}")
async def get_status(item_id: str, token: str = Depends(verify_token)):
    """Get status of an item (authenticated endpoint)"""
    logger.info(f"Checking status for item: {item_id}")

    if item_id == "nonexistent":
        return {"id": item_id, "status": "not_found", "message": "Item does not exist"}

    return {"id": item_id, "status": "active", "message": "Item is active"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
