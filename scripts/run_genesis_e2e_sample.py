#!/usr/bin/env python
"""
scripts/run_genesis_e2e_sample.py

Run a simple end-to-end GENESIS pipeline on a sample project/tutorial.

This is a harness, not a full orchestrator; you can evolve it into a golden
baseline runner.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from genesis.mobius.tutorial_visualization import build_visualization_from_snapshots
from genesis.mobius.clarity_insight import build_clarity_insight_from_g3
from genesis.mobius.cross_tutorial_analytics import build_g5_analytics
from genesis.mobius.mobius_feedback_bridge import build_mobius_feedback_for_tutorial
from genesis.mobius.eval_logging import log_genesis_evaluation
from genesis.mobius.tutorial_timeline_adapter import (
    GenesisMobiusSnapshotLike,
    GenesisMobiusQualitySnapshotLike,
)
from types import SimpleNamespace


def main() -> None:
    project_id = "sample-project-001"
    out_dir = Path("output") / project_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Build fake snapshots (in a real pipeline, these come from MobiusExportBundle).
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

    # 2. G3 visualization
    g3 = build_visualization_from_snapshots(
        g1,
        g2,
        seq_index=1,
        metadata={"createdAtUtc": "2025-11-18T00:00:00Z", "generator": "GENESIS-G3", "generatorVersion": "1.0.0"},
    )
    (out_dir / "genesis_visualization_g3_v1.0.0.json").write_text(json.dumps(g3, indent=2), encoding="utf-8")

    # 3. G4 clarity/insight
    g4 = build_clarity_insight_from_g3(g3)
    (out_dir / "genesis_clarity_g4_v1.0.0.json").write_text(json.dumps(g4, indent=2), encoding="utf-8")

    # 4. G5 analytics (single-element cheat: use [g4, g4] just for smoke test)
    g5 = build_g5_analytics([g4, g4])
    (out_dir / "genesis_analytics_g5_v1.0.0.json").write_text(json.dumps(g5, indent=2), encoding="utf-8")

    # 5. G6 feedback for this tutorial
    g6 = build_mobius_feedback_for_tutorial(g4, g5)
    (out_dir / "genesis_feedback_v1.0.0.json").write_text(json.dumps(g6, indent=2), encoding="utf-8")

    # 6. Log evaluation (compat assumed true for sample)
    log_genesis_evaluation(
        project_id=project_id,
        g4_bundle=g4,
        g5_bundle=g5,
        g6_bundle=g6,
        compatible=True,
        repo_root=os.getcwd(),
    )

    print(f"Sample GENESIS artifacts written to {out_dir}")


if __name__ == "__main__":
    main()
