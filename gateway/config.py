"""Runtime configuration for the gateway application."""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Optional

_TRUE_VALUES = {"1", "true", "yes", "on", "enabled"}


def _coerce_bool(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in _TRUE_VALUES


def _coerce_int(value: Optional[str], *, default: int) -> int:
    if value is None:
        return default
    try:
        candidate = int(value)
    except (TypeError, ValueError):
        return default
    return max(candidate, 1)


@dataclass(frozen=True)
class GatewayConfig:
    """Container for gateway configuration values."""

    export_root: Path
    gateway_key: Optional[str]
    health_public: bool
    version: Optional[str]
    cache_mode: str
    sha256_chunk_size: int

    @classmethod
    def from_env(cls) -> "GatewayConfig":
        """Create configuration from environment variables."""
        export_root_env = os.getenv("MOBIUS_EXPORT_ROOT")
        if export_root_env:
            export_root = Path(export_root_env).expanduser().resolve()
        else:
            export_root = Path.cwd().joinpath("exports").resolve()

        return cls(
            export_root=export_root,
            gateway_key=os.getenv("MOBIUS_GATEWAY_KEY"),
            health_public=_coerce_bool(os.getenv("MOBIUS_HEALTH_PUBLIC")),
            version=os.getenv("MOBIUS_VERSION"),
            cache_mode=os.getenv("MOBIUS_CACHE_MODE", "revalidate"),
            sha256_chunk_size=_coerce_int(
                os.getenv("MOBIUS_SHA256_CHUNK"), default=65536
            ),
        )


__all__ = ["GatewayConfig"]
