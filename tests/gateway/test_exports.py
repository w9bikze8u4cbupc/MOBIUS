from __future__ import annotations

from importlib import reload
from pathlib import Path
import zipfile

import pytest

from fastapi.testclient import TestClient


def _write_zip(path: Path) -> None:
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("payload.txt", "data")


def _auth_headers() -> dict[str, str]:
    return {"x-mobius-key": "secret"}


@pytest.fixture(autouse=True)
def _reset_metrics():
    from src.gateway import metrics

    metrics.reset_metrics()
    yield
    metrics.reset_metrics()


@pytest.fixture
def exports_dir(tmp_path, monkeypatch):
    directory = tmp_path / "exports"
    directory.mkdir()
    monkeypatch.setenv("EXPORTS_DIR", str(directory))
    return directory


@pytest.fixture
def logs_dir(tmp_path, monkeypatch):
    directory = tmp_path / "logs"
    directory.mkdir()
    monkeypatch.setenv("LOG_DIR", str(directory))
    return directory


@pytest.fixture
def client(monkeypatch, exports_dir, logs_dir):
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("MOBIUS_METRICS_PUBLIC", "0")
    monkeypatch.setenv("RL_ENABLE", "0")
    from src.gateway.middleware import rate_limit
    from src.gateway import app as gateway_app

    reload(rate_limit)
    reload(gateway_app)

    app = gateway_app.create_app()
    return TestClient(app)


def test_metrics_exposes_counters(client, exports_dir):
    _write_zip(Path(exports_dir) / "m.zip")
    # Access export to increment counters
    client.get("/exports/m.zip", headers=_auth_headers())
    client.get("/exports/missing.zip", headers=_auth_headers())
    response = client.get("/metrics", headers=_auth_headers())
    body = response.text
    assert "requests_total" in body
    assert "responses_2xx_total" in body
    assert "responses_4xx_total" in body
    assert "gateway_request_duration_seconds_bucket" in body


def test_list_exports_reads_index(client, exports_dir):
    _write_zip(Path(exports_dir, "a.zip"))
    _write_zip(Path(exports_dir, "b.zip"))
    Path(exports_dir, "index.json").write_text('{"artifacts":["a.zip","b.zip","bad.txt"]}', encoding="utf-8")
    response = client.get("/exports/list", headers=_auth_headers())
    assert response.status_code == 200
    assert response.json()["artifacts"] == ["a.zip", "b.zip"]


def test_list_exports_404_without_index(client):
    response = client.get("/exports/list", headers=_auth_headers())
    assert response.status_code == 404


def test_rate_limit_blocks_when_exceeded(monkeypatch, tmp_path):
    exports = tmp_path / "exports"
    exports.mkdir()
    logs = tmp_path / "logs"
    logs.mkdir()
    monkeypatch.setenv("EXPORTS_DIR", str(exports))
    monkeypatch.setenv("LOG_DIR", str(logs))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("RL_ENABLE", "1")
    monkeypatch.setenv("RL_BURST", "2")
    monkeypatch.setenv("RL_RATE_PER_SEC", "0.0001")
    from src.gateway.middleware import rate_limit
    from src.gateway import app as gateway_app

    reload(rate_limit)
    reload(gateway_app)

    app = gateway_app.create_app()
    client = TestClient(app)
    _write_zip(exports / "rl.zip")
    assert client.get("/exports/rl.zip", headers=_auth_headers()).status_code == 200
    assert client.get("/exports/rl.zip", headers=_auth_headers()).status_code == 200
    blocked = client.get("/exports/rl.zip", headers=_auth_headers())
    assert blocked.status_code in (429, 401)
