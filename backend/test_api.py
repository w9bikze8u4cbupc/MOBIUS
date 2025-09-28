#!/usr/bin/env python3
"""
Unit and integration tests for the MOBIUS FastAPI ingestion service.
"""

import os
from unittest.mock import patch

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestHealthEndpoints:
    """Test health check and basic endpoints."""

    def test_health_endpoint(self):
        """Test the health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "mobius-ingestion"
        assert data["version"] == "1.0.0"

    def test_root_endpoint(self):
        """Test the root endpoint."""
        response = client.get("/")
        assert response.status_code == 200

        data = response.json()
        assert "MOBIUS Ingestion Service" in data["message"]
        assert data["docs"] == "/docs"


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication."""

    def test_process_document_without_auth(self):
        """Test document processing endpoint without authentication."""
        response = client.post("/api/process-document")
        assert response.status_code == 403  # No auth header provided

    def test_process_document_with_invalid_token(self):
        """Test document processing with invalid token."""
        headers = {"Authorization": "Bearer invalid-token"}
        response = client.post("/api/process-document", headers=headers)
        assert response.status_code == 401

    def test_process_document_with_valid_token(self):
        """Test document processing with valid token."""
        with patch.dict(os.environ, {"ALLOWED_TOKEN": "test-token"}):
            headers = {"Authorization": "Bearer test-token"}
            response = client.post("/api/process-document", headers=headers)
            assert response.status_code == 200

            data = response.json()
            assert data["status"] == "success"
            assert "features" in data

    def test_status_endpoint_with_auth(self):
        """Test status endpoint with authentication."""
        with patch.dict(os.environ, {"ALLOWED_TOKEN": "test-token"}):
            headers = {"Authorization": "Bearer test-token"}
            response = client.get("/api/status", headers=headers)
            assert response.status_code == 200

            data = response.json()
            assert data["authenticated"] is True
            assert data["service"] == "mobius-ingestion"
            assert isinstance(data["endpoints"], list)
            assert isinstance(data["auth_required"], list)


class TestTokenValidation:
    """Test token validation logic."""

    def test_default_token_when_env_not_set(self):
        """Test that default token is used when ALLOWED_TOKEN not set."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove ALLOWED_TOKEN if it exists
            if "ALLOWED_TOKEN" in os.environ:
                del os.environ["ALLOWED_TOKEN"]

            headers = {"Authorization": "Bearer dev-token-please-change-in-production"}
            response = client.get("/api/status", headers=headers)
            assert response.status_code == 200

    def test_custom_token_from_env(self):
        """Test that custom token from environment is used."""
        custom_token = "my-custom-ci-token"
        with patch.dict(os.environ, {"ALLOWED_TOKEN": custom_token}):
            headers = {"Authorization": f"Bearer {custom_token}"}
            response = client.get("/api/status", headers=headers)
            assert response.status_code == 200


class TestErrorHandling:
    """Test error handling scenarios."""

    def test_malformed_auth_header(self):
        """Test handling of malformed authorization header."""
        headers = {"Authorization": "InvalidFormat"}
        response = client.post("/api/process-document", headers=headers)
        assert (
            response.status_code == 403
        )  # FastAPI returns 403 for malformed Bearer token
