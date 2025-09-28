"""
Tests for the MOBIUS FastAPI backend
"""

import os
from main import app


def test_main_app_exists():
    """Test that the main app is properly created"""
    assert app is not None
    assert hasattr(app, "routes")


def test_health_endpoint_direct():
    """Test the health check endpoint directly"""
    import asyncio
    from main import health_check

    async def run_test():
        result = await health_check()
        assert result["status"] == "healthy"
        assert result["service"] == "mobius-backend"

    asyncio.run(run_test())


def test_root_endpoint_direct():
    """Test the root endpoint directly"""
    import asyncio
    from main import root

    async def run_test():
        result = await root()
        assert "message" in result
        assert "version" in result

    asyncio.run(run_test())


def test_api_status_with_token_direct():
    """Test API status endpoint with ALLOWED_TOKEN directly"""
    import asyncio
    from main import api_status

    # Set a test token
    os.environ["ALLOWED_TOKEN"] = "test_token_123"

    async def run_test():
        try:
            result = await api_status()
            assert result["status"] == "ok"
            assert result["token_configured"] is True
            assert result["service"] == "mobius-backend"
        finally:
            # Clean up test token
            if "ALLOWED_TOKEN" in os.environ:
                del os.environ["ALLOWED_TOKEN"]

    asyncio.run(run_test())


def test_app_startup():
    """Test that the app can be created and started"""
    assert app.title == "MOBIUS Backend"
    assert app.version == "1.0.0"
