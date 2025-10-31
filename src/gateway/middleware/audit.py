"""Audit middleware writing structured JSON lines to a rotating daily log."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Iterable

from ..types import Request

DEFAULT_LOG_DIR = Path("artifacts/audit")


def _log_path(base: Path, *, timestamp: datetime | None = None) -> Path:
    """Return the audit log path for the supplied timestamp."""

    ts = timestamp or datetime.utcnow()
    return base / f"audit-{ts:%Y-%m-%d}.log"


def emit_audit_event(request: Request, *, log_dir: Path = DEFAULT_LOG_DIR, tags: Iterable[str] | None = None) -> Path:
    """Persist a JSON-line audit record for the request and return the path."""

    log_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "client": f"{request.client[0]}:{request.client[1]}",
        "path": request.path,
        "method": request.method,
        "headers": dict(request.headers),
    }
    if tags:
        record["tags"] = list(tags)
    path = _log_path(log_dir)
    with path.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, sort_keys=True) + "\n")
    return path
