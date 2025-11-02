"""Sliding window rate limiter with metric hooks."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, DefaultDict, Optional

from observability.metrics import MetricEmitter


class RateLimiter:
    """Sliding window rate limiter that records metrics."""

    def __init__(
        self,
        limit: int,
        window_seconds: float,
        *,
        metrics: Optional[MetricEmitter] = None,
        metric_base_name: str = "rate_limiter",
    ) -> None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self.limit = limit
        self.window_seconds = float(window_seconds)
        self._metrics = metrics
        self._metric_base_name = metric_base_name
        self._requests: DefaultDict[str, Deque[float]] = defaultdict(deque)

    def allow(self, identity: str, *, now: Optional[float] = None) -> bool:
        """Return True if the request is allowed, False if it should be rejected."""
        current_time = float(now if now is not None else time.time())
        window_start = current_time - self.window_seconds
        events = self._requests[identity]
        while events and events[0] <= window_start:
            events.popleft()
        if len(events) >= self.limit:
            self._emit("blocked", identity)
            return False
        events.append(current_time)
        self._emit("allowed", identity)
        return True

    def reset(self, identity: str) -> None:
        """Clear any stored requests for *identity*."""
        self._requests.pop(identity, None)

    def _emit(self, outcome: str, identity: str) -> None:
        if not self._metrics:
            return
        metric_name = f"{self._metric_base_name}.{outcome}"
        self._metrics.incr_counter(metric_name, tags={"identity": identity})
