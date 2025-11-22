from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis.mobius.tutorial_visualization import TimelineSample, build_tutorial_visualization
from scripts.check_g3_visualization import validate_bundle


def _make_sample_bundle() -> dict:
    samples = [
        TimelineSample(0.0, 1.0, 0, "setup", 150.0, 12.0, 0.2, 0.9, 0.8),
        TimelineSample(1.0, 2.0, 1, "gameplay", 170.0, 18.0, 0.4, 0.8, 0.7),
    ]
    return build_tutorial_visualization(
        tutorial_id="demo",
        mobius_export_version="1.0.0",
        genesis_ingest_version="1.0.0",
        g2_quality_contract_version="1.0.0",
        seq_index=42,
        timeline_samples=samples,
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
