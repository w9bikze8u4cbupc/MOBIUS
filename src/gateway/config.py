"""Configuration for the Mobius gateway WSGI application."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(slots=True)
class GatewayConfig:
    """Simple configuration object for :class:`GatewayApplication`.

    Parameters
    ----------
    export_root:
        Directory containing exported assets.
    gateway_key:
        Optional bearer token used to authorise export downloads and
        readiness probes when :attr:`health_public` is ``False``.
    health_public:
        Whether health/readiness endpoints should be publicly accessible.
    version:
        Optional version string appended to health responses.
    key_store_path:
        Optional path to a key store that should be readable for readiness
        checks.
    """

    export_root: Path
    gateway_key: Optional[str] = None
    health_public: bool = True
    version: Optional[str] = None
    key_store_path: Optional[Path] = None

    def __post_init__(self) -> None:  # pragma: no cover - trivial
        # Normalise paths so downstream code can rely on Path objects.
        if not isinstance(self.export_root, Path):
            self.export_root = Path(self.export_root)
        if self.key_store_path is not None and not isinstance(self.key_store_path, Path):
            self.key_store_path = Path(self.key_store_path)
