from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis.mobius.clarity_insight import build_clarity_insight_from_g3
from scripts.check_g4_clarity_insight import validate_g4  # adjust import if needed


def _make_dummy_g3_bundle() -> dict:
    return {
        "contract": {"name": "g3_tutorial_visualization_contract", "version": "1.0.0"},
        "identity": {
            "tutorialId": "demo",
            "mobiusExportVersion": "1.0.0",
            "genesisIngestVersion": "1.0.0",
            "g2QualityContractVersion": "1.0.0",
            "seqIndex": 5,
        },
        "globalMetrics": {
            "durationSec": 120.0,
            "avgWpm": 160.0,
            "avgCps": 15.0,
            "avgMotionLoad": 0.4,
            "avgClarityScore": 0.75,
            "densityVariance": 1.5,
            "pacingStability": 2000.0,
            "captionLoadIndex": 18.0,
        },
        "overlays": {},  # not needed for G4 pass 1
        "metadata": {
            "createdAtUtc": "2025-11-18T00:00:00Z",
        },
    }


def test_g4_bundle_roundtrip_json(tmp_path: Path) -> None:
    g3 = _make_dummy_g3_bundle()
    g4 = build_clarity_insight_from_g3(g3)

    path = tmp_path / "g4_bundle.json"
    path.write_text(json.dumps(g4), encoding="utf-8")

    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["contract"]["name"] == "g4_clarity_insight_contract"
    assert loaded["identity"]["tutorialId"] == "demo"
    assert loaded["insights"]["grade"] in {"A", "B", "C", "D", "F"}


def test_g4_bundle_passes_validator() -> None:
    g3 = _make_dummy_g3_bundle()
    g4 = build_clarity_insight_from_g3(g3)
    errors = validate_g4(g4)
    assert errors == []
