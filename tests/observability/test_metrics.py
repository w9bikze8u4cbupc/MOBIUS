import time

import pytest

from telemetry.metrics import InMemoryMetricsBackend, MetricEmitter, metric_timer


def test_increment_records_values_and_tags():
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)

    emitter.increment("requests_total", tags={"route": "/healthz"})
    emitter.increment("requests_total", value=2, tags={"route": "/healthz"})
    emitter.increment("requests_total", tags={"route": "/metrics"})

    counters = {(sample.name, sample.tags): sample.value for sample in backend.counters()}
    assert counters[("requests_total", (("route", "/healthz"),))] == pytest.approx(3)
    assert counters[("requests_total", (("route", "/metrics"),))] == pytest.approx(1)


@pytest.mark.parametrize("value", [-1, -0.1])
def test_increment_rejects_negative_values(value):
    emitter = MetricEmitter()
    with pytest.raises(ValueError):
        emitter.increment("requests_total", value=value)


def test_metric_timer_records_duration(monkeypatch):
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)

    calls = []

    def fake_perf_counter():
        if not calls:
            calls.append(1.0)
            return 100.0
        calls.append(2.0)
        return 100.5

    monkeypatch.setattr(time, "perf_counter", fake_perf_counter)

    with metric_timer(emitter, "request_duration_ms", tags={"route": "POST /summaries"}):
        pass

    samples = list(backend.timers())
    assert len(samples) == 1
    sample = samples[0]
    assert sample.name == "request_duration_ms"
    assert sample.tags == (("route", "POST /summaries"),)
    assert sample.value == pytest.approx(500.0)


def test_gauge_tracks_latest_value():
    backend = InMemoryMetricsBackend()
    emitter = MetricEmitter(backend)

    emitter.set_gauge("queue_depth", 1, tags={"queue": "preview"})
    emitter.set_gauge("queue_depth", 5, tags={"queue": "preview"})

    gauges = {(sample.name, sample.tags): sample.value for sample in backend.gauges()}
    assert gauges[("queue_depth", (("queue", "preview"),))] == 5

