import os

import pytest
from fastapi.testclient import TestClient

from src.main import app

# Test client
client = TestClient(app)


@pytest.fixture
def auth_headers():
    """Provide authorization headers for tests"""
    token = os.getenv("ALLOWED_TOKEN", "test-token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def invalid_auth_headers():
    """Provide invalid authorization headers for tests"""
    return {"Authorization": "Bearer invalid-token"}


def test_root_endpoint():
    """Test the root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {
        "message": "MOBIUS FastAPI Backend - Game Tutorial Generator"
    }


def test_health_check_with_valid_token(auth_headers, monkeypatch):
    """Test health check with valid token"""
    monkeypatch.setenv("ALLOWED_TOKEN", "test-token")
    response = client.get("/health", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "MOBIUS FastAPI Backend"


def test_health_check_without_token():
    """Test health check without token"""
    response = client.get("/health")
    assert response.status_code == 403


def test_health_check_with_invalid_token(invalid_auth_headers, monkeypatch):
    """Test health check with invalid token"""
    monkeypatch.setenv("ALLOWED_TOKEN", "test-token")
    response = client.get("/health", headers=invalid_auth_headers)
    assert response.status_code == 401


def test_api_status_with_valid_token(auth_headers, monkeypatch):
    """Test API status with valid token"""
    monkeypatch.setenv("ALLOWED_TOKEN", "test-token")
    response = client.get("/api/status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["api_status"] == "operational"
    assert "features" in data


def test_api_status_without_token():
    """Test API status without token"""
    response = client.get("/api/status")
    assert response.status_code == 403
