from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional


_CACHE_MODES = {
    "revalidate",
    "immutable",
    "no-store",
    "bypass",
}


def _coerce_bool(value: str) -> bool:
    """
    Coerces a textual value into a boolean interpreting common truthy forms.
    
    Parameters:
        value (str): Input string to interpret; leading and trailing whitespace are ignored and comparison is case-insensitive.
    
    Returns:
        bool: `True` if the normalized value is one of "1", "true", "yes", or "on", `False` otherwise.
    """
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class GatewayConfig:
    """Configuration options for :class:`GatewayApplication`."""

    exports_root: Path
    gateway_key: str
    cache_mode: str = "revalidate"
    version: Optional[str] = None
    health_public: bool = False

    def __post_init__(self) -> None:
        """
        Normalize and validate dataclass fields after initialization.
        
        Expands and normalizes `exports_root` to a Path with user home expansion, normalizes `cache_mode` to lowercase and validates it against allowed cache modes, and ensures `gateway_key` is present.
        
        Raises:
            ValueError: If `cache_mode` is not one of the allowed values or if `gateway_key` is empty.
        """
        exports_root = Path(self.exports_root).expanduser()
        object.__setattr__(self, "exports_root", exports_root)

        cache_mode = self.cache_mode.lower()
        if cache_mode not in _CACHE_MODES:
            raise ValueError(
                f"Unsupported cache_mode '{self.cache_mode}'. Expected one of: "
                + ", ".join(sorted(_CACHE_MODES))
            )
        object.__setattr__(self, "cache_mode", cache_mode)

        if not self.gateway_key:
            raise ValueError("gateway_key must be provided")

    @classmethod
    def from_environ(cls, environ: Mapping[str, str]) -> "GatewayConfig":
        """
        Construct a GatewayConfig from environment variables.
        
        Parameters:
            environ (Mapping[str, str]): Mapping of environment variable names to values (e.g., os.environ).
        
        Returns:
            GatewayConfig: Configuration populated from environment variables:
                - MOBIUS_EXPORTS_ROOT -> exports_root (required)
                - MOBIUS_GATEWAY_KEY -> gateway_key (required)
                - MOBIUS_CACHE_MODE -> cache_mode (defaults to "revalidate")
                - MOBIUS_VERSION -> version (optional)
                - MOBIUS_HEALTH_PUBLIC -> health_public (interpreted as a boolean; defaults to False)
        
        Raises:
            ValueError: If a required environment variable (MOBIUS_EXPORTS_ROOT or MOBIUS_GATEWAY_KEY) is missing.
        """

        try:
            exports_root_raw = environ["MOBIUS_EXPORTS_ROOT"]
            gateway_key = environ["MOBIUS_GATEWAY_KEY"]
        except KeyError as exc:  # pragma: no cover - defensive branch
            raise ValueError(f"Missing required environment variable: {exc.args[0]}") from exc

        cache_mode = environ.get("MOBIUS_CACHE_MODE", "revalidate")
        version = environ.get("MOBIUS_VERSION")
        health_public_raw = environ.get("MOBIUS_HEALTH_PUBLIC")
        health_public = False
        if health_public_raw is not None:
            health_public = _coerce_bool(health_public_raw)

        return cls(
            exports_root=Path(exports_root_raw),
            gateway_key=gateway_key,
            cache_mode=cache_mode,
            version=version,
            health_public=health_public,
        )