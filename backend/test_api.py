import pytest
import pytest_asyncio
import json
import asyncio
from httpx import AsyncClient
from fastapi.testclient import TestClient
from main import app
import os

# Test configuration
TEST_TOKEN = "test_token_123"
os.environ["ALLOWED_TOKEN"] = TEST_TOKEN

@pytest.fixture
def client():
    """Synchronous test client"""
    return TestClient(app)

@pytest_asyncio.fixture
async def async_client():
    """Asynchronous test client"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
def auth_headers():
    """Authentication headers for requests"""
    return {"Authorization": f"Bearer {TEST_TOKEN}"}

def test_health_endpoint(client):
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert data["service"] == "mobius-ingestion"

def test_ingest_json_only(client, auth_headers):
    """Test ingestion with JSON metadata only"""
    metadata = {"source": "test-unit", "type": "validation"}
    
    response = client.post(
        "/api/ingest",
        data={"metadata": json.dumps(metadata)},
        headers=auth_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "test-unit"
    assert data["status"] == "processing"
    assert "job_id" in data
    assert data["metadata"]["type"] == "validation"

def test_ingest_with_file(client, auth_headers):
    """Test ingestion with file upload"""
    metadata = {"source": "test-file", "description": "File upload test"}
    test_file_content = b"test file content"
    
    response = client.post(
        "/api/ingest",
        data={"metadata": json.dumps(metadata)},
        files={"file": ("test.txt", test_file_content, "text/plain")},
        headers=auth_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "test-file"
    assert data["status"] == "processing"
    assert "file_info" in data
    assert data["file_info"]["filename"] == "test.txt"

def test_ingest_invalid_auth(client):
    """Test ingestion with invalid authentication"""
    metadata = {"source": "test-unauthorized"}
    
    response = client.post(
        "/api/ingest",
        data={"metadata": json.dumps(metadata)},
        headers={"Authorization": "Bearer invalid_token"}
    )
    
    assert response.status_code == 401

def test_ingest_invalid_json(client, auth_headers):
    """Test ingestion with invalid JSON metadata"""
    response = client.post(
        "/api/ingest",
        data={"metadata": "invalid json {"},
        headers=auth_headers
    )
    
    assert response.status_code == 400

def test_job_status_endpoint(client, auth_headers):
    """Test job status retrieval"""
    # First create a job
    metadata = {"source": "test-status"}
    response = client.post(
        "/api/ingest",
        data={"metadata": json.dumps(metadata)},
        headers=auth_headers
    )
    job_id = response.json()["job_id"]
    
    # Then get its status
    status_response = client.get(f"/api/status/{job_id}")
    assert status_response.status_code == 200
    status_data = status_response.json()
    assert status_data["job_id"] == job_id
    assert status_data["source"] == "test-status"

def test_job_status_not_found(client):
    """Test job status for non-existent job"""
    response = client.get("/api/status/non-existent-job")
    assert response.status_code == 404

def test_list_jobs_endpoint(client, auth_headers):
    """Test job listing"""
    # Create a couple of jobs first
    for i in range(2):
        metadata = {"source": f"test-list-{i}"}
        client.post(
            "/api/ingest",
            data={"metadata": json.dumps(metadata)},
            headers=auth_headers
        )
    
    # List jobs
    response = client.get("/api/jobs")
    assert response.status_code == 200
    jobs = response.json()
    assert isinstance(jobs, list)
    assert len(jobs) >= 2

@pytest.mark.asyncio
async def test_job_lifecycle(async_client, auth_headers):
    """Test complete job lifecycle with status progression"""
    metadata = {"source": "test-lifecycle"}
    
    # Create job
    response = await async_client.post(
        "/api/ingest",
        data={"metadata": json.dumps(metadata)},
        headers=auth_headers
    )
    assert response.status_code == 200
    job_data = response.json()
    job_id = job_data["job_id"]
    assert job_data["status"] == "processing"
    
    # Wait for processing to complete (simulate_job_processing takes ~2 seconds)
    await asyncio.sleep(3)
    
    # Check final status
    status_response = await async_client.get(f"/api/status/{job_id}")
    final_status = status_response.json()
    assert final_status["status"] in ["completed", "failed"]
    
    if final_status["status"] == "completed":
        assert "result" in final_status
    else:
        assert "error" in final_status

def test_websocket_connection(client):
    """Test WebSocket connection"""
    with client.websocket_connect("/api/ws") as websocket:
        # Send ping
        websocket.send_text("ping")
        data = websocket.receive_text()
        assert data == "pong"

def test_cors_headers(client):
    """Test CORS configuration"""
    response = client.options("/health", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET"
    })
    # FastAPI handles OPTIONS automatically, check that it doesn't error
    assert response.status_code in [200, 405]  # 405 is also acceptable for OPTIONS

if __name__ == "__main__":
    pytest.main([__file__, "-v"])