"""Configuration helpers for the export gateway."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


ERR_MISSING_EXPORT_ROOT = "MOBIUS_EXPORT_ROOT is required"
ERR_MISSING_API_KEY = "MOBIUS_API_KEY is required"
ERR_BAD_CACHE_MODE = "Unsupported cache mode"


_ALLOWED_CACHE_MODES = {"revalidate", "immutable", "no-store", "bypass"}


def _parse_bool(value: str) -> bool:
    value = value.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"Invalid boolean: {value}")


@dataclass(frozen=True)
class GatewayConfig:
    """Frozen configuration for :class:`GatewayApplication`."""

    exports_root: Path
    gateway_key: str
    cache_mode: str = "revalidate"
    version: str | None = None
    health_public: bool = False

    @classmethod
    def from_env(cls, environ: Mapping[str, str]) -> "GatewayConfig":
        """Create a configuration object from process environment variables."""

        export_root = environ.get("MOBIUS_EXPORT_ROOT")
        if not export_root:
            raise ValueError(ERR_MISSING_EXPORT_ROOT)

        api_key = environ.get("MOBIUS_API_KEY")
        if not api_key:
            raise ValueError(ERR_MISSING_API_KEY)

        cache_mode = environ.get("MOBIUS_CACHE_MODE", cls.cache_mode)
        cache_mode = cache_mode.lower()
        if cache_mode not in _ALLOWED_CACHE_MODES:
            raise ValueError(ERR_BAD_CACHE_MODE)

        version = environ.get("MOBIUS_GATEWAY_VERSION")

        health_raw = environ.get("MOBIUS_HEALTH_PUBLIC", "false")
        try:
            health_public = _parse_bool(health_raw)
        except ValueError as exc:  # pragma: no cover - defensive
            raise ValueError("Invalid MOBIUS_HEALTH_PUBLIC value") from exc

        root_path = Path(export_root).expanduser().resolve()

        return cls(
            exports_root=root_path,
            gateway_key=api_key,
            cache_mode=cache_mode,
            version=version,
            health_public=health_public,
        )

    def cache_control_header(self) -> str | None:
        """Return the Cache-Control header value for successful artifact responses."""

        if self.cache_mode == "revalidate":
            return "public, max-age=0, must-revalidate"
        if self.cache_mode == "immutable":
            # One year in seconds
            return "public, max-age=31536000, immutable"
        if self.cache_mode == "no-store":
            return "no-store"
        if self.cache_mode == "bypass":
            return "private, max-age=0, no-store"
        return None
