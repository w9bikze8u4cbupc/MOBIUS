from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest
from fastapi.testclient import TestClient

from src.gateway.app import create_app


class MutableClock:
    def __init__(self, start: datetime) -> None:
        self._current = start

    def __call__(self) -> datetime:
        return self._current

    def advance(self, **delta: int) -> None:
        self._current = self._current + timedelta(**delta)


@pytest.fixture
def clock() -> MutableClock:
    return MutableClock(datetime(2024, 1, 1, tzinfo=timezone.utc))


@pytest.fixture
def exports_dir(tmp_path) -> Iterator[str]:
    directory = tmp_path / "exports"
    directory.mkdir()
    yield str(directory)


@pytest.fixture
def logs_dir(tmp_path) -> Iterator[str]:
    directory = tmp_path / "logs"
    directory.mkdir()
    yield str(directory)


@pytest.fixture
def client(monkeypatch, exports_dir: str, logs_dir: str, clock: MutableClock) -> Iterator[TestClient]:
    monkeypatch.setenv("EXPORTS_DIR", exports_dir)
    monkeypatch.setenv("LOG_DIR", logs_dir)
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    app = create_app(audit_clock=clock)
    with TestClient(app) as test_client:
        yield test_client
