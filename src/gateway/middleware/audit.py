from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, Optional

from fastapi import HTTPException, Request, Response, status


def _default_clock() -> datetime:
    return datetime.now(timezone.utc)


class AuditMiddleware:
    """Structured audit logging for the lightweight FastAPI clone."""

    def __init__(
        self,
        *,
        log_dir: Path,
        clock: Optional[Callable[[], datetime]] = None,
    ) -> None:
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._clock: Callable[[], datetime] = clock or _default_clock
        self._lock = Lock()

    async def __call__(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        timestamp = self._clock()
        try:
            response = await call_next(request)
            status_code = response.status_code
        except HTTPException as exc:
            status_code = exc.status_code
            self._write_entry(request, timestamp, status_code)
            raise
        except Exception:
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            self._write_entry(request, timestamp, status_code)
            raise
        else:
            self._write_entry(request, timestamp, status_code)
            return response

    def _write_entry(self, request: Request, timestamp: datetime, status_code: int) -> None:
        entry: Dict[str, Any] = {
            "timestamp": timestamp.isoformat(),
            "method": request.method,
            "path": request.url.path,
            "status_code": status_code,
        }
        client = getattr(request.client, "host", None)
        if client:
            entry["client_ip"] = client
        user_agent = request.headers.get("user-agent") if hasattr(request.headers, "get") else None
        if user_agent:
            entry["user_agent"] = user_agent[:512]

        log_path = self._log_dir / f"audit-{timestamp.date().isoformat()}.log"
        payload = json.dumps(entry, separators=(",", ":"), sort_keys=True)
        with self._lock:
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(payload)
                handle.write("\n")
