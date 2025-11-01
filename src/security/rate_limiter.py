"""Sliding window rate limiter used by API services."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Deque, DefaultDict, Optional

from telemetry.metrics import MetricEmitter


@dataclass
class _Request:
    timestamp: datetime
    weight: int


class RateLimiter:
    """Simple sliding window rate limiter with metric hooks."""

    def __init__(
        self,
        *,
        limit: int,
        window_seconds: int,
        metrics: Optional[MetricEmitter] = None,
        metric_prefix: str = "rate_limit",
    ) -> None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")

        self._limit = limit
        self._window = timedelta(seconds=window_seconds)
        self._metrics = metrics
        self._metric_prefix = metric_prefix
        self._requests: DefaultDict[str, Deque[_Request]] = defaultdict(deque)
        self._lock = RLock()

    def _now(self, now: Optional[datetime]) -> datetime:
        return now or datetime.now(timezone.utc)

    def _prune(self, key: str, now: datetime) -> None:
        window_start = now - self._window
        queue = self._requests[key]
        while queue and queue[0].timestamp <= window_start:
            queue.popleft()

    def _emit(self, name: str, *, tags: Optional[dict[str, str]] = None) -> None:
        if self._metrics:
            self._metrics.increment(f"{self._metric_prefix}_{name}", tags=tags)

    def allow(self, key: str, *, weight: int = 1, now: Optional[datetime] = None) -> bool:
        if weight <= 0:
            raise ValueError("weight must be positive")
        if not key:
            raise ValueError("key is required")

        current_time = self._now(now)
        with self._lock:
            self._prune(key, current_time)
            queue = self._requests[key]
            used = sum(item.weight for item in queue)
            tags = {"key": key}

            if used + weight > self._limit:
                self._emit("denied", tags=tags)
                if self._metrics:
                    self._metrics.set_gauge(f"{self._metric_prefix}_queue_depth", len(queue), tags=tags)
                return False

            queue.append(_Request(timestamp=current_time, weight=weight))
            self._emit("allowed", tags=tags)
            if self._metrics:
                self._metrics.set_gauge(
                    f"{self._metric_prefix}_queue_depth", len(queue), tags=tags
                )
            return True

    def remaining(self, key: str, *, now: Optional[datetime] = None) -> int:
        current_time = self._now(now)
        with self._lock:
            self._prune(key, current_time)
            used = sum(item.weight for item in self._requests[key])
            return max(self._limit - used, 0)

    def reset(self, key: str) -> None:
        with self._lock:
            self._requests.pop(key, None)
            if self._metrics:
                self._metrics.set_gauge(f"{self._metric_prefix}_queue_depth", 0, tags={"key": key})

