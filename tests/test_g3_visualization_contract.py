from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from genesis.mobius.tutorial_timeline_adapter import (
    GenesisMobiusQualitySnapshotLike,
    GenesisMobiusSnapshotLike,
)
from genesis.mobius.tutorial_visualization import build_visualization_from_snapshots
from scripts.check_g3_visualization import validate_bundle  # adjust path if needed


def _make_sample_bundle() -> dict:
    scenes = [
        SimpleNamespace(index=0, kind="setup", start_sec=0.0, end_sec=10.0),
        SimpleNamespace(index=1, kind="gameplay", start_sec=10.0, end_sec=30.0),
    ]
    q_timeline = [
        SimpleNamespace(t_start_sec=0.0, t_end_sec=1.0, wpm=150.0, cps=12.0, motion_load=0.2, audio_stability=0.9, clarity_score=0.8),
        SimpleNamespace(t_start_sec=12.0, t_end_sec=13.0, wpm=170.0, cps=18.0, motion_load=0.4, audio_stability=0.8, clarity_score=0.7),
    ]

    g1 = GenesisMobiusSnapshotLike(
        tutorial_id="demo",
        mobius_export_version="1.0.0",
        ingest_version="1.0.0",
        scenes=scenes,
    )
    g2 = GenesisMobiusQualitySnapshotLike(
        contract_version="1.0.0",
        timeline=q_timeline,
    )

    return build_visualization_from_snapshots(
        g1,
        g2,
        seq_index=42,
        metadata={"createdAtUtc": "2025-11-18T00:00:00Z", "generator": "GENESIS-G3", "generatorVersion": "1.0.0"},
    )


def test_g3_visualization_bundle_is_roundtrip_json(tmp_path: Path) -> None:
    bundle = _make_sample_bundle()
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps(bundle), encoding="utf-8")

    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["identity"]["tutorialId"] == "demo"
    assert loaded["contract"]["name"] == "g3_tutorial_visualization_contract"


def test_g3_visualization_bundle_passes_validator() -> None:
    bundle = _make_sample_bundle()
    errors = validate_bundle(bundle)
    assert errors == []
