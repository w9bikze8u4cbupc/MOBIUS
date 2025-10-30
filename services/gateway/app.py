"""Gateway service FastAPI application."""
from __future__ import annotations

from pathlib import Path
from typing import Final

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

EXPORTS_ROOT: Final[Path] = Path("data/exports")


def _resolve_export_path(relative_path: str) -> Path:
    """Resolve an export path within the exports root.

    The helper guards against directory traversal attacks by ensuring the
    resolved path remains within ``EXPORTS_ROOT``. A ``FileNotFoundError``
    is translated into a 404 HTTP response while other invalid paths raise
    a 400 error.
    """

    try:
        candidate = (EXPORTS_ROOT / relative_path).resolve(strict=True)
    except FileNotFoundError as exc:  # pragma: no cover - explicit chaining behaviour
        raise HTTPException(status_code=404, detail="Export not found") from exc

    exports_root_resolved = EXPORTS_ROOT.resolve()
    if exports_root_resolved not in candidate.parents and candidate != exports_root_resolved:
        raise HTTPException(status_code=400, detail="Invalid export path")

    if candidate.is_dir():
        raise HTTPException(status_code=400, detail="Export path is a directory")

    return candidate


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""

    EXPORTS_ROOT.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="Gateway Service", version="1.0.0")

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Simple health-check endpoint."""

        return {"status": "ok"}

    @app.get("/exports/{export_path:path}", response_class=FileResponse, tags=["exports"])
    async def get_export(export_path: str) -> FileResponse:
        """Return an export file located within :data:`EXPORTS_ROOT`."""

        path = _resolve_export_path(export_path)
        return FileResponse(path)

    return app


app = create_app()

__all__ = ["app", "create_app", "EXPORTS_ROOT"]
