from __future__ import annotations

import threading
from typing import Dict, List

_lock = threading.Lock()
_counters: Dict[str, int] = {
    "requests_total": 0,
    "responses_2xx_total": 0,
    "responses_3xx_total": 0,
    "responses_4xx_total": 0,
    "responses_5xx_total": 0,
    "exports_bytes_total": 0,
}
_buckets: List[float] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
_hist: Dict[float, int] = {b: 0 for b in _buckets}
_hist_inf = 0


def reset_metrics() -> None:
    global _hist_inf
    with _lock:
        for key in _counters:
            _counters[key] = 0
        for bucket in _buckets:
            _hist[bucket] = 0
        _hist_inf = 0


def observe_request(duration_s: float, status: int, bytes_sent: int) -> None:
    global _hist_inf
    with _lock:
        _counters["requests_total"] += 1
        if 200 <= status < 300:
            _counters["responses_2xx_total"] += 1
        elif 300 <= status < 400:
            _counters["responses_3xx_total"] += 1
        elif 400 <= status < 500:
            _counters["responses_4xx_total"] += 1
        else:
            _counters["responses_5xx_total"] += 1
        if bytes_sent > 0:
            _counters["exports_bytes_total"] += bytes_sent
        for bucket in _buckets:
            if duration_s <= bucket:
                _hist[bucket] += 1
                break
        else:
            _hist_inf += 1


def _render_counter(name: str, help_text: str) -> str:
    return f"# HELP {name} {help_text}\n# TYPE {name} counter\n{name} {_counters[name]}\n"


def _render_histogram() -> str:
    lines = [
        "# HELP gateway_request_duration_seconds Request duration",
        "# TYPE gateway_request_duration_seconds histogram",
    ]
    cumulative = 0
    for bucket in _buckets:
        cumulative += _hist[bucket]
        lines.append(f'gateway_request_duration_seconds_bucket{{le="{bucket}"}} {cumulative}')
    lines.append(f'gateway_request_duration_seconds_bucket{{le="+Inf"}} {cumulative + _hist_inf}')
    total = cumulative + _hist_inf
    approx_sum = 0.0
    previous = 0.0
    for bucket in _buckets:
        count = _hist[bucket]
        midpoint = (previous + bucket) / 2.0 if previous or bucket else 0.0
        approx_sum += count * midpoint
        previous = bucket
    approx_sum += _hist_inf * (previous * 1.5 if previous else 0.0)
    lines.append(f"gateway_request_duration_seconds_sum {approx_sum:.6f}")
    lines.append(f"gateway_request_duration_seconds_count {total}")
    return "\n".join(lines) + "\n"


def render_metrics() -> str:
    with _lock:
        sections = [
            _render_counter("requests_total", "Total HTTP requests"),
            _render_counter("responses_2xx_total", "2xx responses"),
            _render_counter("responses_3xx_total", "3xx responses"),
            _render_counter("responses_4xx_total", "4xx responses"),
            _render_counter("responses_5xx_total", "5xx responses"),
            _render_counter("exports_bytes_total", "Total bytes served"),
            _render_histogram(),
        ]
        return "\n".join(sections)
