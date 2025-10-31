from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from fastapi import Request

_lock = threading.Lock()


def _default_clock() -> datetime:
    return datetime.utcnow()


class AuditMiddleware:
    def __init__(self, *, log_dir: Path, clock: Optional[Callable[[], datetime]] = None) -> None:
        self._log_dir = log_dir
        self._clock = clock or _default_clock
        self._log_dir.mkdir(parents=True, exist_ok=True)

    async def __call__(self, request: Request, call_next):
        start = self._clock()
        try:
            response = await call_next(request)
        except Exception as exc:  # pragma: no cover - defensive logging
            self._write_entry(request, status=500, started_at=start, finished_at=self._clock(), error=str(exc))
            raise
        else:
            self._write_entry(
                request,
                status=response.status_code,
                started_at=start,
                finished_at=self._clock(),
            )
            return response

    def _write_entry(
        self,
        request: Request,
        *,
        status: int,
        started_at: datetime,
        finished_at: datetime,
        error: Optional[str] = None,
    ) -> None:
        entry = {
            "ts": finished_at.isoformat() + "Z",
            "duration_ms": max(0.0, (finished_at - started_at).total_seconds() * 1000.0),
            "method": request.method,
            "path": request.url,
            "status": status,
        }
        if error is not None:
            entry["error"] = error
        log_path = self._log_dir / "audit.log"
        line = json.dumps(entry, sort_keys=True)
        with _lock:
            with log_path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
