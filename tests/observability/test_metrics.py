"""Tests for telemetry utilities."""

import time

from observability.metrics import InMemoryMetricsBackend, MetricEmitter, metric_timer


def test_counter_and_gauge_recording():
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend, default_tags={"service": "preview"})

    emitter.incr_counter("requests", tags={"route": "/render"})
    emitter.incr_counter("requests", value=2, tags={"route": "/render"})
    emitter.set_gauge("inflight", 3)

    key = ("requests", (("route", "/render"), ("service", "preview")))
    assert backend.counters[key] == 3

    gauge_key = ("inflight", (("service", "preview"),))
    assert backend.gauges[gauge_key] == 3


def test_metric_timer_records_duration(monkeypatch):
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)

    calls = []

    def fake_perf_counter():
        calls.append(len(calls))
        return float(len(calls))

    monkeypatch.setattr(time, "perf_counter", fake_perf_counter)

    with metric_timer(emitter, "timer-test", tags={"stage": "encode"}):
        pass

    key = ("timer-test", (("stage", "encode"),))
    assert backend.timers[key] == [1.0]
