from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis.mobius.mobius_feedback_bridge import build_mobius_feedback_for_tutorial


def _mock_g4(tid: str, clarity_score: float, grade: str = "B") -> dict:
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
            "clarityScore": clarity_score,
            "pacingStability": 0.8,
            "densityVariance": 0.3,
            "captionLoadIndex": 0.5,
        },
        "insights": {
            "grade": grade,
            "summary": "",
            "issues": [],
        },
    }


def _mock_g5_with_comparison(tid: str) -> dict:
    return {
        "contract": {"name": "g5_cross_tutorial_analytics_contract", "version": "1.0.0"},
        "identity": {
            "analysisId": "analysis-default",
            "generatedAtUtc": "2025-11-18T00:00:00Z",
            "generatorVersion": "1.0.0",
        },
        "tutorialComparisons": [
            {
                "tutorialId": tid,
                "distanceFromCentroid": 0.4,
                "rankIndex": 0,
                "zScores": {
                    "clarityScore": 0.0,
                    "captionLoadIndex": 1.2,
                    "avgMotionLoad": 0.5,
                },
                "flags": ["CAPTIONS_HEAVY"],
            }
        ],
    }


def test_g6_feedback_basic_fields() -> None:
    g4 = _mock_g4("demo", 0.6, "B")
    g5 = _mock_g5_with_comparison("demo")

    g6 = build_mobius_feedback_for_tutorial(g4, g5)
    assert g6["contract"]["name"] == "g6_mobius_feedback_contract"
    assert g6["input"]["tutorialId"] == "demo"
    assert g6["summary"]["grade"] == "B"
    assert g6["recommendations"], "Expected at least one recommendation"


def test_g6_mobius_hints_ranges() -> None:
    g4 = _mock_g4("demo", 0.6, "B")
    g5 = _mock_g5_with_comparison("demo")
    g6 = build_mobius_feedback_for_tutorial(g4, g5)
    hints = g6["mobiusHints"]

    assert hints["targetWpmRange"]["min"] < hints["targetWpmRange"]["max"]
    assert 0.0 <= hints["maxMotionLoad"] <= 1.0
