"""Command line helpers for running the gateway service."""

from __future__ import annotations

import os

import uvicorn

from .app import create_app


def main() -> None:
    """Launch the ASGI server using uvicorn."""

    host = os.environ.get("GATEWAY_HOST", "0.0.0.0")
    port = int(os.environ.get("GATEWAY_PORT", "8000"))
    reload_flag = os.environ.get("GATEWAY_RELOAD", "false").lower() in {"1", "true", "yes", "on"}

    uvicorn.run(
        "services.gateway.app:create_app",
        host=host,
        port=port,
        reload=reload_flag,
        factory=True,
        log_level=os.environ.get("GATEWAY_LOG_LEVEL", "info"),
    )


if __name__ == "__main__":
    main()
