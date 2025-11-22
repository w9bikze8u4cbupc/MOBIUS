from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis.mobius.cross_tutorial_analytics import build_g5_analytics
from scripts.check_g5_cross_tutorial_analytics import validate


def _mock_g4(tid: str, clarity: float, caption: float, motion: float) -> dict:
    return {
        "contract": {"name": "g4_clarity_insight_contract", "version": "1.0.0"},
        "identity": {
            "tutorialId": tid,
            "mobiusExportVersion": "1.0.0",
            "genesisIngestVersion": "1.0.0",
            "g2QualityContractVersion": "1.0.0",
            "g3VisualizationContractVersion": "1.0.0",
            "seqIndex": 0,
        },
        "clarity": {
            "clarityScore": clarity,
            "pacingStability": 0.8,
            "densityVariance": 0.3,
            "captionLoadIndex": caption,
        },
        "insights": {"grade": "B", "summary": "", "issues": []},
        "globalMetrics": {"avgMotionLoad": motion},
    }


def test_g5_roundtrip(tmp_path: Path) -> None:
    g4s = [
        _mock_g4("t1", 0.8, 0.3, 0.4),
        _mock_g4("t2", 0.5, 0.6, 0.8),
        _mock_g4("t3", 0.9, 0.2, 0.3),
    ]
    g5 = build_g5_analytics(g4s, analysis_id="test")
    path = tmp_path / "g5.json"
    path.write_text(json.dumps(g5), encoding="utf-8")
    loaded = json.loads(path.read_text())
    assert loaded["contract"]["name"] == "g5_cross_tutorial_analytics_contract"
    assert loaded["identity"]["analysisId"] == "test"
    assert loaded["input"]["count"] == 3


def test_g5_validates() -> None:
    g4s = [
        _mock_g4("t1", 0.8, 0.3, 0.4),
        _mock_g4("t2", 0.5, 0.6, 0.8),
    ]
    g5 = build_g5_analytics(g4s)
    errors = validate(g5)
    assert errors == []
    comparison = g5["tutorialComparisons"][0]
    assert comparison["rankIndex"] == 0
    assert set(comparison.keys()) >= {"tutorialId", "distanceFromCentroid", "zScores", "flags"}


def test_zscore_capping() -> None:
    g4s = [
        _mock_g4("t1", 0.0, 0.0, 0.0),
        _mock_g4("t2", 1.0, 1.0, 1.0),
    ]
    g5 = build_g5_analytics(g4s)
    zscores = g5["tutorialComparisons"][0]["zScores"]
    assert -3 <= zscores["clarityScore"] <= 3
    assert -3 <= zscores["captionLoadIndex"] <= 3
    assert -3 <= zscores["avgMotionLoad"] <= 3


def test_drift_and_recommendations() -> None:
    g4s = [
        _mock_g4("a1", 0.9, 0.2, 0.2),
        _mock_g4("a2", 0.85, 0.25, 0.3),
        _mock_g4("a3", 0.6, 0.9, 0.9),
    ]
    g5 = build_g5_analytics(g4s)
    drift = g5["drift"]
    assert "captionLoadDrift" in drift
    if drift["captionLoadDrift"] > 0.05:
        assert any(rec["code"] == "CAPTION_DENSITY_INCREASING" for rec in g5["recommendations"])
