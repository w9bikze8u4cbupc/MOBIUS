"""Metrics utilities supporting telemetry emission."""

from __future__ import annotations

import time
from collections import defaultdict
from contextlib import contextmanager
from typing import Iterator, Mapping, MutableMapping, Optional, Tuple

TagValue = Tuple[Tuple[str, str], ...]


def _normalise_tags(tags: Optional[Mapping[str, object]]) -> TagValue:
    """Return a stable tuple representation for a tag mapping."""
    if not tags:
        return ()
    return tuple(sorted((str(key), str(value)) for key, value in tags.items()))


class InMemoryMetricsBackend:
    """Simple in-memory backend useful for tests."""

    counters: MutableMapping[Tuple[str, TagValue], float]
    gauges: MutableMapping[Tuple[str, TagValue], float]
    timers: MutableMapping[Tuple[str, TagValue], list]

    def __init__(self) -> None:
        self.counters = defaultdict(float)
        self.gauges = {}
        self.timers = defaultdict(list)

    def record_counter(self, name: str, value: float, tags: Optional[Mapping[str, object]] = None) -> None:
        """Accumulate a counter value."""
        self.counters[(name, _normalise_tags(tags))] += float(value)

    def record_gauge(self, name: str, value: float, tags: Optional[Mapping[str, object]] = None) -> None:
        """Set the value of a gauge."""
        self.gauges[(name, _normalise_tags(tags))] = float(value)

    def record_timer(self, name: str, duration: float, tags: Optional[Mapping[str, object]] = None) -> None:
        """Append a timing sample for the metric."""
        self.timers[(name, _normalise_tags(tags))].append(float(duration))


class MetricEmitter:
    """High level facade for emitting metrics to a backend."""

    def __init__(self, backend: InMemoryMetricsBackend, default_tags: Optional[Mapping[str, object]] = None) -> None:
        self._backend = backend
        self._default_tags = dict(default_tags or {})

    def _merge_tags(self, tags: Optional[Mapping[str, object]]) -> Mapping[str, object]:
        combined = dict(self._default_tags)
        if tags:
            combined.update(tags)
        return combined

    def incr_counter(self, name: str, value: float = 1.0, tags: Optional[Mapping[str, object]] = None) -> None:
        """Increase a counter by *value*."""
        self._backend.record_counter(name, value, self._merge_tags(tags))

    def set_gauge(self, name: str, value: float, tags: Optional[Mapping[str, object]] = None) -> None:
        """Set a gauge to *value*."""
        self._backend.record_gauge(name, value, self._merge_tags(tags))

    def observe_timer(self, name: str, duration: float, tags: Optional[Mapping[str, object]] = None) -> None:
        """Record a timing sample."""
        self._backend.record_timer(name, duration, self._merge_tags(tags))


@contextmanager
def metric_timer(emitter: MetricEmitter, name: str, tags: Optional[Mapping[str, object]] = None) -> Iterator[None]:
    """Context manager to automatically record elapsed time for *name*."""
    start = time.perf_counter()
    try:
        yield
    finally:
        emitter.observe_timer(name, time.perf_counter() - start, tags=tags)
