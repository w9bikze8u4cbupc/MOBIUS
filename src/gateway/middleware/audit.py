"""Audit logging middleware for the gateway service."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp


class AuditMiddleware(BaseHTTPMiddleware):
    """Persist JSON audit logs for every request.

    The middleware writes structured log entries to ``logs/gateway_access.jsonl``.
    When a new UTC day starts the file is rotated to ``gateway_access_YYYY-MM-DD.jsonl``
    before logging continues. Rotation keeps the active file compact while keeping
    historical logs available for later inspection.
    """

    def __init__(self, app: ASGIApp, *, log_dir: Optional[str] = None) -> None:
        super().__init__(app)
        self._log_dir = Path(log_dir or os.environ.get("GATEWAY_LOG_DIR", "logs"))
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._log_file = self._log_dir / "gateway_access.jsonl"
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        status_code = 500
        etag: Optional[str] = None
        start_time = datetime.now(timezone.utc)
        try:
            response = await call_next(request)
            status_code = response.status_code
            etag = response.headers.get("etag")
            return response
        finally:
            self._write_entry(
                request=request,
                timestamp=start_time,
                status_code=status_code,
                etag=etag,
            )

    def _write_entry(
        self,
        *,
        request: Request,
        timestamp: datetime,
        status_code: int,
        etag: Optional[str],
    ) -> None:
        entry: Dict[str, Any] = {
            "timestamp": timestamp.isoformat(),
            "method": request.method,
            "path": request.url.path,
            "status_code": status_code,
        }
        if etag is not None:
            entry["etag"] = etag

        self._rotate_if_needed(timestamp)
        line = json.dumps(entry, separators=(",", ":"))

        with self._lock:
            with self._log_file.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")

    def _rotate_if_needed(self, timestamp: datetime) -> None:
        if not self._log_file.exists():
            return

        try:
            last_modified = datetime.fromtimestamp(
                self._log_file.stat().st_mtime, timezone.utc
            )
        except FileNotFoundError:
            return

        if last_modified.date() == timestamp.date():
            return

        rotated_name = f"gateway_access_{last_modified.date().isoformat()}.jsonl"
        rotated_path = self._log_dir / rotated_name

        # Ensure unique name if rotation happens multiple times within tests.
        counter = 1
        unique_path = rotated_path
        while unique_path.exists():
            unique_path = rotated_path.with_name(
                rotated_path.stem + f"_{counter}" + rotated_path.suffix
            )
            counter += 1

        try:
            self._log_file.rename(unique_path)
        except FileNotFoundError:
            # Another worker may have rotated the file first. Ignore.
            pass
