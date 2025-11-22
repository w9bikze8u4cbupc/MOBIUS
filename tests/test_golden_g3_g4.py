from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from genesis.mobius.tutorial_timeline_adapter import (
    GenesisMobiusSnapshotLike,
    GenesisMobiusQualitySnapshotLike,
)
from genesis.mobius.tutorial_visualization import build_visualization_from_snapshots
from genesis.mobius.clarity_insight import build_clarity_insight_from_g3
from tests.utils.json_diff import json_diff


GOLDEN_DIR = Path("tests/golden/genesis/sample_project_001")


def _build_sample_snapshots():
    scenes = [
        SimpleNamespace(index=0, kind="setup", start_sec=0.0, end_sec=10.0),
        SimpleNamespace(index=1, kind="gameplay", start_sec=10.0, end_sec=30.0),
    ]
    q_timeline = [
        SimpleNamespace(
            t_start_sec=0.0,
            t_end_sec=1.0,
            wpm=150.0,
            cps=12.0,
            motion_load=0.2,
            audio_stability=0.9,
            clarity_score=0.8,
        ),
        SimpleNamespace(
            t_start_sec=12.0,
            t_end_sec=13.0,
            wpm=170.0,
            cps=18.0,
            motion_load=0.4,
            audio_stability=0.8,
            clarity_score=0.7,
        ),
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
    return g1, g2


def test_g3_visualization_matches_golden():
    g1, g2 = _build_sample_snapshots()
    g3_current = build_visualization_from_snapshots(
        g1,
        g2,
        seq_index=1,
        metadata={
            "createdAtUtc": "2025-11-18T00:00:00Z",
            "generator": "GENESIS-G3",
            "generatorVersion": "1.0.0",
        },
    )
    g3_golden = json.loads((GOLDEN_DIR / "g3_visualization.json").read_text(encoding="utf-8"))

    diffs = json_diff(g3_current, g3_golden, numeric_eps=1e-6)
    assert diffs == [], "\n".join(diffs)


def test_g4_clarity_matches_golden():
    g1, g2 = _build_sample_snapshots()
    g3_current = build_visualization_from_snapshots(
        g1,
        g2,
        seq_index=1,
        metadata={
            "createdAtUtc": "2025-11-18T00:00:00Z",
            "generator": "GENESIS-G3",
            "generatorVersion": "1.0.0",
        },
    )
    g4_current = build_clarity_insight_from_g3(g3_current)
    g4_golden = json.loads((GOLDEN_DIR / "g4_clarity.json").read_text(encoding="utf-8"))

    diffs = json_diff(g4_current, g4_golden, numeric_eps=1e-6)
    assert diffs == [], "\n".join(diffs)
