from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import uvicorn

app = FastAPI()
security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    expected_token = os.getenv("ALLOWED_TOKEN")
    if not expected_token or token != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


@app.get("/")
def read_root():
    return {"message": "MOBIUS FastAPI Service", "status": "healthy"}


@app.get("/health")
def health_check(token: str = Depends(verify_token)):
    return {
        "status": "healthy",
        "service": "MOBIUS",
        "version": "1.0.0",
        "authenticated": True,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)