"""
Test FastAPI health endpoints
"""
import os
import pytest
from fastapi.testclient import TestClient
from api.health import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def test_token():
    """Set test token in environment"""
    token = "test-token-123"
    os.environ["ALLOWED_TOKEN"] = token
    yield token
    # Cleanup
    if "ALLOWED_TOKEN" in os.environ:
        del os.environ["ALLOWED_TOKEN"]


def test_read_root(client):
    """Test unauthenticated root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "MOBIUS FastAPI Service"
    assert data["status"] == "healthy"


def test_health_check_with_valid_token(client, test_token):
    """Test authenticated health endpoint with valid token"""
    response = client.get("/health", headers={"Authorization": f"Bearer {test_token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "MOBIUS"
    assert data["version"] == "1.0.0"
    assert data["authenticated"] is True


def test_health_check_with_invalid_token(client, test_token):
    """Test authenticated health endpoint with invalid token"""
    response = client.get("/health", headers={"Authorization": "Bearer invalid-token"})
    assert response.status_code == 401
    data = response.json()
    assert data["detail"] == "Invalid authentication token"


def test_health_check_no_token(client):
    """Test authenticated health endpoint without token"""
    response = client.get("/health")
    assert response.status_code == 403  # FastAPI returns 403 for missing auth