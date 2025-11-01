"""In-memory metrics helpers used in unit tests and local development.

The production system pushes metrics to Prometheus through a sidecar.
These helpers mimic the behaviour of the production exporter so business
logic can be tested without having to run the full stack.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass
from typing import DefaultDict, Dict, Iterable, Iterator, Mapping, MutableMapping, Optional, Tuple

TagDict = Mapping[str, str]
FrozenTags = Tuple[Tuple[str, str], ...]


def _freeze_tags(tags: Optional[TagDict]) -> FrozenTags:
    if not tags:
        return tuple()
    return tuple(sorted((str(k), str(v)) for k, v in tags.items()))


@dataclass(frozen=True)
class MetricSample:
    name: str
    value: float
    tags: FrozenTags


class InMemoryMetricsBackend:
    """Thread-safe storage for captured metrics."""

    def __init__(self) -> None:
        self._counters: DefaultDict[Tuple[str, FrozenTags], float] = defaultdict(float)
        self._gauges: MutableMapping[Tuple[str, FrozenTags], float] = {}
        self._timers: DefaultDict[Tuple[str, FrozenTags], list[float]] = defaultdict(list)
        self._lock = threading.RLock()

    def increment(self, name: str, value: float = 1.0, *, tags: Optional[TagDict] = None) -> float:
        frozen = (name, _freeze_tags(tags))
        with self._lock:
            self._counters[frozen] += value
            return self._counters[frozen]

    def set_gauge(self, name: str, value: float, *, tags: Optional[TagDict] = None) -> float:
        frozen = (name, _freeze_tags(tags))
        with self._lock:
            self._gauges[frozen] = value
            return value

    def observe(self, name: str, value: float, *, tags: Optional[TagDict] = None) -> None:
        frozen = (name, _freeze_tags(tags))
        with self._lock:
            self._timers[frozen].append(value)

    def counters(self) -> Iterable[MetricSample]:
        with self._lock:
            for (name, tags), value in self._counters.items():
                yield MetricSample(name=name, value=value, tags=tags)

    def gauges(self) -> Iterable[MetricSample]:
        with self._lock:
            for (name, tags), value in self._gauges.items():
                yield MetricSample(name=name, value=value, tags=tags)

    def timers(self) -> Iterable[MetricSample]:
        with self._lock:
            for (name, tags), values in self._timers.items():
                for value in values:
                    yield MetricSample(name=name, value=value, tags=tags)


class MetricEmitter:
    """Lightweight metrics emitter that mirrors production labels."""

    def __init__(self, backend: Optional[InMemoryMetricsBackend] = None) -> None:
        self._backend = backend or InMemoryMetricsBackend()

    @property
    def backend(self) -> InMemoryMetricsBackend:
        return self._backend

    def increment(self, metric: str, *, value: float = 1.0, tags: Optional[TagDict] = None) -> float:
        if value < 0:
            raise ValueError("Counters cannot be decremented")
        return self._backend.increment(metric, value, tags=tags)

    def set_gauge(self, metric: str, value: float, *, tags: Optional[TagDict] = None) -> float:
        return self._backend.set_gauge(metric, value, tags=tags)

    def observe(self, metric: str, value: float, *, tags: Optional[TagDict] = None) -> None:
        self._backend.observe(metric, value, tags=tags)


@contextmanager
def metric_timer(emitter: MetricEmitter, metric: str, *, tags: Optional[TagDict] = None) -> Iterator[None]:
    """Context manager that records the execution time of a block."""

    start = time.perf_counter()
    try:
        yield
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        emitter.observe(metric, duration_ms, tags=tags)

