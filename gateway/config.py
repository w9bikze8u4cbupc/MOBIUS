"""Configuration helpers for the MOBIUS gateway stub."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class GatewaySettings:
    export_root: Path
    api_key: str | None
    health_public: bool
    version: str
    cache_mode: str
    chunk_size: int


def load_settings() -> GatewaySettings:
    root = Path(os.getenv("MOBIUS_EXPORT_ROOT", "exports")).resolve()
    api_key = os.getenv("MOBIUS_GATEWAY_KEY")
    health_public = _truthy(os.getenv("MOBIUS_HEALTH_PUBLIC"))
    version = os.getenv("MOBIUS_VERSION", "dev")
    cache_mode = os.getenv("MOBIUS_CACHE_MODE", "must-revalidate")
    try:
        chunk_size = int(os.getenv("MOBIUS_SHA256_CHUNK", "65536"))
    except ValueError:
        chunk_size = 65536
    return GatewaySettings(
        export_root=root,
        api_key=api_key,
        health_public=health_public,
        version=version,
        cache_mode=cache_mode,
        chunk_size=max(1024, chunk_size),
    )


SETTINGS = load_settings()
