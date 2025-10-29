"""FastAPI application for serving export ZIP archives.

This module exposes a :func:`create_app` factory so the service can be used in
multiple contexts (CLI, ASGI server, tests).  A module-level ``app`` instance
is also exported for convenience.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Optional
import os
import re

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response

SAFE_ZIP_RE = re.compile(r"^[A-Za-z0-9._-]+\.zip$")


@dataclass(frozen=True)
class Settings:
    """Configuration container for the gateway service."""

    exports_root: Path

    @classmethod
    def from_env(cls, root_override: Optional[os.PathLike[str] | str] = None) -> "Settings":
        """Build settings from environment defaults.

        Parameters
        ----------
        root_override:
            Optional explicit directory path to serve exports from.  When not
            provided the ``EXPORTS_ROOT`` environment variable is used and
            finally the package ``exports`` folder is used as a last resort.
        """

        if root_override is not None:
            exports_root = Path(root_override)
        else:
            exports_root = Path(os.getenv("EXPORTS_ROOT", Path(__file__).resolve().parent / "exports"))
        return cls(exports_root=exports_root.resolve())


def _ensure_within_root(path: Path, root: Path) -> Path:
    """Ensure ``path`` resides within ``root`` after resolution."""

    resolved_root = root.resolve()
    resolved_path = path.resolve()
    try:
        resolved_path.relative_to(resolved_root)
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise HTTPException(status_code=404, detail="Export not found") from exc
    return resolved_path


def _compute_etag(path: Path) -> str:
    """Compute a strong ETag for a file."""

    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_app(root: Optional[os.PathLike[str] | str] = None) -> FastAPI:
    """Create a configured FastAPI application."""

    settings = Settings.from_env(root)
    app = FastAPI(title="Gateway Service")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/exports/{export_name}")
    def fetch_export(export_name: str, if_none_match: Optional[str] = Header(default=None)):
        if not SAFE_ZIP_RE.fullmatch(export_name):
            raise HTTPException(status_code=400, detail="Invalid export name")

        candidate = _ensure_within_root(settings.exports_root / export_name, settings.exports_root)
        if not candidate.is_file():
            raise HTTPException(status_code=404, detail="Export not found")

        etag = _compute_etag(candidate)
        headers = {"ETag": etag}

        if if_none_match and if_none_match == etag:
            return Response(status_code=304, headers=headers)

        return FileResponse(candidate, media_type="application/zip", filename=export_name, headers=headers)

    return app


app = create_app()

__all__ = ["SAFE_ZIP_RE", "create_app", "app"]
