import os

import httpx
import pytest


@pytest.mark.asyncio
async def test_e2e_health_check():
    """End-to-end test for health check endpoint"""
    base_url = "http://localhost:8000"
    token = os.getenv("ALLOWED_TOKEN", "test-token")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{base_url}/health", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_e2e_api_status():
    """End-to-end test for API status endpoint"""
    base_url = "http://localhost:8000"
    token = os.getenv("ALLOWED_TOKEN", "test-token")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{base_url}/api/status", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["api_status"] == "operational"
        assert "features" in data


@pytest.mark.asyncio
async def test_e2e_root_endpoint():
    """End-to-end test for root endpoint"""
    base_url = "http://localhost:8000"

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{base_url}/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
