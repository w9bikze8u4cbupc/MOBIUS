"""Minimal Prometheus metrics exporter (dependency-free)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .types import Response


@dataclass
class Counter:
    """A counter metric supporting simple increment operations."""

    name: str
    help: str
    value: int = 0

    def inc(self, amount: int = 1) -> None:
        """Increase the counter by the supplied amount."""

        self.value += amount


class MetricsRegistry:
    """Registry that exposes a text representation for scraping."""

    def __init__(self) -> None:
        self._counters: Dict[str, Counter] = {}

    def counter(self, name: str, help_text: str) -> Counter:
        """Return an existing counter or create a new one."""

        if name not in self._counters:
            self._counters[name] = Counter(name=name, help=help_text)
        return self._counters[name]

    def export(self) -> Response:
        """Create a plain-text response with Prometheus metrics."""

        lines = []
        for counter in self._counters.values():
            lines.append(f"# HELP {counter.name} {counter.help}")
            lines.append(f"# TYPE {counter.name} counter")
            lines.append(f"{counter.name} {counter.value}")
        payload = "\n".join(lines).encode()
        return Response(status_code=200, body=payload, headers={"Content-Type": "text/plain; version=0.0.4"})
