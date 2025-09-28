#!/usr/bin/env python3
"""
Simple integration tests for the MOBIUS FastAPI backend.
"""

import requests
import json
import time
import os
import tempfile
from typing import Dict, Any

# Test configuration
BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "test_token_123"
HEADERS = {"Authorization": f"Bearer {AUTH_TOKEN}"}

def test_health_endpoint():
    """Test the health check endpoint."""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    print("✓ Health endpoint working")

def test_root_endpoint():
    """Test the root endpoint."""
    print("Testing root endpoint...")
    response = requests.get(f"{BASE_URL}/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "MOBIUS Ingest API"
    assert data["status"] == "running"
    print("✓ Root endpoint working")

def test_ingest_json_only():
    """Test ingesting JSON metadata only."""
    print("Testing JSON-only ingest...")
    metadata = {"source": "test-json", "type": "integration-test"}
    
    response = requests.post(
        f"{BASE_URL}/api/ingest",
        headers=HEADERS,
        files={"metadata": (None, json.dumps(metadata))}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "queued"
    assert data["message"] == "Data ingestion started"
    
    job_id = data["job_id"]
    print(f"✓ JSON ingest created job: {job_id}")
    return job_id

def test_ingest_with_file():
    """Test ingesting with file upload."""
    print("Testing file upload ingest...")
    
    # Create a temporary test file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write("This is test content for file upload integration test")
        temp_file_path = f.name
    
    try:
        metadata = {"source": "test-file-upload", "type": "integration-test"}
        
        with open(temp_file_path, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/ingest",
                headers=HEADERS,
                files={
                    "file": ("test_file.txt", f, "text/plain"),
                    "metadata": (None, json.dumps(metadata))
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        
        job_id = data["job_id"]
        print(f"✓ File upload ingest created job: {job_id}")
        return job_id
        
    finally:
        # Clean up temporary file
        os.unlink(temp_file_path)

def test_job_status(job_id: str):
    """Test getting job status."""
    print(f"Testing job status for {job_id}...")
    
    # Wait a moment for processing to start/complete
    time.sleep(2)
    
    response = requests.get(
        f"{BASE_URL}/api/status/{job_id}",
        headers=HEADERS
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert "status" in data
    assert "progress" in data
    assert "created_at" in data
    assert "updated_at" in data
    
    print(f"✓ Job {job_id} status: {data['status']} ({data['progress']*100:.0f}%)")
    return data

def test_invalid_token():
    """Test that invalid tokens are rejected."""
    print("Testing invalid token rejection...")
    
    response = requests.post(
        f"{BASE_URL}/api/ingest",
        headers={"Authorization": "Bearer invalid-token"},
        files={"metadata": (None, json.dumps({"test": True}))}
    )
    
    assert response.status_code == 401
    print("✓ Invalid token correctly rejected")

def test_missing_token():
    """Test that missing tokens are rejected."""
    print("Testing missing token rejection...")
    
    response = requests.post(
        f"{BASE_URL}/api/ingest",
        files={"metadata": (None, json.dumps({"test": True}))}
    )
    
    assert response.status_code == 403
    print("✓ Missing token correctly rejected")

def test_invalid_job_id():
    """Test status request with invalid job ID."""
    print("Testing invalid job ID...")
    
    response = requests.get(
        f"{BASE_URL}/api/status/non-existent-job-id",
        headers=HEADERS
    )
    
    assert response.status_code == 404
    print("✓ Invalid job ID correctly returns 404")

def test_invalid_json_metadata():
    """Test ingest with invalid JSON metadata."""
    print("Testing invalid JSON metadata...")
    
    response = requests.post(
        f"{BASE_URL}/api/ingest",
        headers=HEADERS,
        files={"metadata": (None, "invalid-json-content")}
    )
    
    assert response.status_code == 400
    print("✓ Invalid JSON correctly rejected")

def main():
    """Run all integration tests."""
    print("Starting MOBIUS FastAPI Integration Tests")
    print("=" * 50)
    
    try:
        # Basic endpoint tests
        test_health_endpoint()
        test_root_endpoint()
        
        # Authentication tests
        test_invalid_token()
        test_missing_token()
        
        # Input validation tests
        test_invalid_json_metadata()
        test_invalid_job_id()
        
        # Core functionality tests
        job_id_json = test_ingest_json_only()
        job_id_file = test_ingest_with_file()
        
        # Status tests
        status_json = test_job_status(job_id_json)
        status_file = test_job_status(job_id_file)
        
        print("\n" + "=" * 50)
        print("All integration tests passed! ✓")
        print(f"JSON job final status: {status_json['status']}")
        print(f"File job final status: {status_file['status']}")
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except requests.exceptions.ConnectionError:
        print("\n❌ Could not connect to the API server.")
        print("Make sure the FastAPI server is running on http://localhost:8000")
        exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        exit(1)

if __name__ == "__main__":
    main()