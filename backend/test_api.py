"""
Test suite for MOBIUS FastAPI backend service.

Tests all API endpoints including:
- Health checks
- Authentication
- File uploads
- Job management
- Error handling
"""

import os
import uuid
from datetime import datetime
from io import BytesIO

import pytest
from fastapi.testclient import TestClient

# Import the FastAPI app
from main import app, job_store, UPLOAD_DIR

# Test client
client = TestClient(app)

# Test configuration
TEST_TOKEN = "test-token-123"
INVALID_TOKEN = "invalid-token"

# Set environment variable for testing
os.environ["ALLOWED_TOKEN"] = TEST_TOKEN


class TestHealthEndpoint:
    """Test health check endpoint"""

    def test_health_check(self):
        """Test basic health endpoint"""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert data["version"] == "1.0.0"


class TestAuthentication:
    """Test authentication and authorization"""

    def test_protected_endpoint_without_token(self):
        """Test that protected endpoints require authentication"""
        response = client.get("/jobs")

        assert response.status_code == 403  # No authorization header

    def test_protected_endpoint_with_invalid_token(self):
        """Test that invalid tokens are rejected"""
        headers = {"Authorization": f"Bearer {INVALID_TOKEN}"}
        response = client.get("/jobs", headers=headers)

        assert response.status_code == 401
        data = response.json()
        assert "Invalid authentication credentials" in data["error"]

    def test_protected_endpoint_with_valid_token(self):
        """Test that valid tokens are accepted"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        response = client.get("/jobs", headers=headers)

        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestJobManagement:
    """Test job-related endpoints"""

    def setup_method(self):
        """Clear job store before each test"""
        job_store.clear()

    def test_list_empty_jobs(self):
        """Test listing jobs when none exist"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        response = client.get("/jobs", headers=headers)

        assert response.status_code == 200
        assert response.json() == []

    def test_get_nonexistent_job_status(self):
        """Test getting status of non-existent job"""
        fake_job_id = str(uuid.uuid4())
        response = client.get(f"/status/{fake_job_id}")

        assert response.status_code == 404
        data = response.json()
        assert f"Job {fake_job_id} not found" in data["error"]

    def test_delete_nonexistent_job(self):
        """Test deleting non-existent job"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        fake_job_id = str(uuid.uuid4())

        response = client.delete(f"/jobs/{fake_job_id}", headers=headers)

        assert response.status_code == 404
        data = response.json()
        assert f"Job {fake_job_id} not found" in data["error"]


class TestFileIngestion:
    """Test file upload and ingestion"""

    def setup_method(self):
        """Clear job store before each test"""
        job_store.clear()

        # Clean up upload directory
        if UPLOAD_DIR.exists():
            for file in UPLOAD_DIR.glob("*"):
                file.unlink()

    def test_upload_valid_pdf_file(self):
        """Test uploading a valid PDF file"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Create a dummy PDF file
        pdf_content = (
            b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
        )
        files = {"file": ("test.pdf", BytesIO(pdf_content), "application/pdf")}

        response = client.post("/ingest", files=files, headers=headers)

        assert response.status_code == 200
        data = response.json()

        assert "job_id" in data
        assert data["file_name"] == "test.pdf"
        assert data["file_size"] == len(pdf_content)
        assert "File uploaded successfully" in data["message"]

        # Verify job was created
        job_id = data["job_id"]
        assert job_id in job_store

        job = job_store[job_id]
        assert job["status"] == "pending"
        assert job["file_name"] == "test.pdf"
        assert job["progress"] == 0

    def test_upload_invalid_file_type(self):
        """Test uploading an unsupported file type"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Create a dummy image file
        files = {"file": ("test.jpg", BytesIO(b"fake image data"), "image/jpeg")}

        response = client.post("/ingest", files=files, headers=headers)

        assert response.status_code == 400
        data = response.json()
        assert "Unsupported file type" in data["error"]
        assert ".jpg" in data["error"]

    def test_upload_without_authentication(self):
        """Test that file upload requires authentication"""
        files = {"file": ("test.pdf", BytesIO(b"fake pdf"), "application/pdf")}

        response = client.post("/ingest", files=files)

        assert response.status_code == 403

    def test_upload_txt_file(self):
        """Test uploading a text file"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        txt_content = b"This is a sample game rulebook in text format."
        files = {"file": ("rulebook.txt", BytesIO(txt_content), "text/plain")}

        response = client.post("/ingest", files=files, headers=headers)

        assert response.status_code == 200
        data = response.json()

        assert data["file_name"] == "rulebook.txt"
        assert data["file_size"] == len(txt_content)

    def test_get_job_status_after_upload(self):
        """Test getting job status after successful upload"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Upload a file first
        files = {"file": ("test.pdf", BytesIO(b"fake pdf"), "application/pdf")}
        upload_response = client.post("/ingest", files=files, headers=headers)
        job_id = upload_response.json()["job_id"]

        # Get job status
        status_response = client.get(f"/status/{job_id}")

        assert status_response.status_code == 200
        data = status_response.json()

        assert data["job_id"] == job_id
        assert data["status"] == "pending"
        assert data["file_name"] == "test.pdf"
        assert data["progress"] == 0
        assert data["result"] is None
        assert data["error_message"] is None


class TestJobProcessing:
    """Test job processing functionality"""

    def setup_method(self):
        """Clear job store before each test"""
        job_store.clear()

    def test_trigger_processing_existing_job(self):
        """Test triggering processing for an existing job"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Create a job manually
        job_id = str(uuid.uuid4())
        job_store[job_id] = {
            "job_id": job_id,
            "status": "pending",
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "file_name": "test.pdf",
            "progress": 0,
            "result": None,
            "error_message": None,
        }

        # Trigger processing
        response = client.post(f"/process/{job_id}", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert f"Processing started for job {job_id}" in data["message"]

        # Verify job status updated
        job = job_store[job_id]
        assert job["status"] == "processing"
        assert job["progress"] == 50

    def test_trigger_processing_nonexistent_job(self):
        """Test triggering processing for non-existent job"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        fake_job_id = str(uuid.uuid4())

        response = client.post(f"/process/{fake_job_id}", headers=headers)

        assert response.status_code == 404
        data = response.json()
        assert f"Job {fake_job_id} not found" in data["error"]


class TestJobDeletion:
    """Test job deletion functionality"""

    def setup_method(self):
        """Clear job store and upload directory before each test"""
        job_store.clear()

        # Clean up upload directory
        if UPLOAD_DIR.exists():
            for file in UPLOAD_DIR.glob("*"):
                file.unlink()

    def test_delete_existing_job_with_file(self):
        """Test deleting a job that has an associated file"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Upload a file first to create a real job
        files = {"file": ("test.pdf", BytesIO(b"fake pdf content"), "application/pdf")}
        upload_response = client.post("/ingest", files=files, headers=headers)
        job_id = upload_response.json()["job_id"]

        # Verify file exists
        uploaded_file = UPLOAD_DIR / f"{job_id}_test.pdf"
        assert uploaded_file.exists()

        # Delete the job
        delete_response = client.delete(f"/jobs/{job_id}", headers=headers)

        assert delete_response.status_code == 200
        data = delete_response.json()
        assert f"Job {job_id} deleted successfully" in data["message"]

        # Verify job removed from store
        assert job_id not in job_store

        # Verify file was cleaned up
        assert not uploaded_file.exists()


class TestErrorHandling:
    """Test error handling and edge cases"""

    def test_malformed_file_upload(self):
        """Test handling of malformed file uploads"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Try to upload without proper file field
        response = client.post("/ingest", headers=headers, data={"not_file": "data"})

        assert response.status_code == 422  # Validation error

    def test_empty_file_upload(self):
        """Test handling of empty file uploads"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        files = {"file": ("empty.pdf", BytesIO(b""), "application/pdf")}
        response = client.post("/ingest", files=files, headers=headers)

        # Should still succeed but with 0 file size
        assert response.status_code == 200
        data = response.json()
        assert data["file_size"] == 0


class TestIntegration:
    """Integration tests for complete workflows"""

    def setup_method(self):
        """Clear job store before each test"""
        job_store.clear()

    def test_complete_upload_and_status_workflow(self):
        """Test the complete workflow from upload to status check"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

        # Step 1: Upload file
        pdf_content = b"Fake PDF content for integration test"
        files = {
            "file": ("integration_test.pdf", BytesIO(pdf_content), "application/pdf")
        }

        upload_response = client.post("/ingest", files=files, headers=headers)
        assert upload_response.status_code == 200

        job_id = upload_response.json()["job_id"]

        # Step 2: Check initial status
        status_response = client.get(f"/status/{job_id}")
        assert status_response.status_code == 200

        status_data = status_response.json()
        assert status_data["status"] == "pending"
        assert status_data["progress"] == 0

        # Step 3: List all jobs
        jobs_response = client.get("/jobs", headers=headers)
        assert jobs_response.status_code == 200

        jobs = jobs_response.json()
        assert len(jobs) == 1
        assert jobs[0]["job_id"] == job_id

        # Step 4: Trigger processing
        process_response = client.post(f"/process/{job_id}", headers=headers)
        assert process_response.status_code == 200

        # Step 5: Check updated status
        status_response2 = client.get(f"/status/{job_id}")
        assert status_response2.status_code == 200

        status_data2 = status_response2.json()
        assert status_data2["status"] == "processing"
        assert status_data2["progress"] == 50

        # Step 6: Clean up - delete job
        delete_response = client.delete(f"/jobs/{job_id}", headers=headers)
        assert delete_response.status_code == 200

        # Step 7: Verify job is gone
        final_status_response = client.get(f"/status/{job_id}")
        assert final_status_response.status_code == 404


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])
