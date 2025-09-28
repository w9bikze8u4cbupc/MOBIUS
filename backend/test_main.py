import pytest
from fastapi.testclient import TestClient

from main import app

# Test client
client = TestClient(app)

# Mock token for testing
TEST_TOKEN = "test-token-123"


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Set up environment variables for testing"""
    monkeypatch.setenv("ALLOWED_TOKEN", TEST_TOKEN)


def test_health_check():
    """Test the health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "mobius-api"


def test_status_endpoint_with_valid_token():
    """Test status endpoint with valid token"""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    response = client.get("/api/status/nonexistent", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "nonexistent"
    assert data["status"] == "not_found"


def test_status_endpoint_with_invalid_token():
    """Test status endpoint with invalid token"""
    headers = {"Authorization": "Bearer invalid-token"}
    response = client.get("/api/status/nonexistent", headers=headers)
    assert response.status_code == 401


def test_status_endpoint_without_token():
    """Test status endpoint without token"""
    response = client.get("/api/status/nonexistent")
    assert response.status_code == 401


def test_status_endpoint_active_item():
    """Test status endpoint with an active item"""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    response = client.get("/api/status/active-item", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "active-item"
    assert data["status"] == "active"
