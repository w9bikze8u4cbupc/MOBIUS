"""Top level package for the MOBIUS Python utilities.

This module exposes the library version and the small helper API surface
used by the gateway service.  The project ships primarily as an internal
library so we keep the public surface intentionally lean.
"""

from __future__ import annotations

from .observability import (
    Observability,
    ObservabilityMiddleware,
    build_observability_from_env,
    configure_fastapi_observability,
    emit_cdn_transfer,
    emit_digest_verification,
    get_current_observability,
    init_global_observability,
)

__all__ = [
    "Observability",
    "ObservabilityMiddleware",
    "build_observability_from_env",
    "configure_fastapi_observability",
    "emit_cdn_transfer",
    "emit_digest_verification",
    "get_current_observability",
    "init_global_observability",
    "__version__",
]

__version__ = "0.87.0"
