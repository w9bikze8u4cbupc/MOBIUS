from __future__ import annotations

import json
from pathlib import Path

from genesis.mobius.cross_tutorial_analytics import build_g5_analytics
from genesis.mobius.mobius_feedback_bridge import build_mobius_feedback_for_tutorial
from tests.utils.json_diff import json_diff

GOLDEN_DIR = Path("tests/golden/genesis/sample_project_001")


def test_g5_analytics_matches_golden():
    # Golden g4 used as both elements to create a stable, deterministic g5.
    g4 = json.loads((GOLDEN_DIR / "g4_clarity.json").read_text(encoding="utf-8"))
    g5_current = build_g5_analytics(
        [g4, g4], generated_at_utc="2025-11-22T16:54:12+00:00"
    )
    g5_golden = json.loads((GOLDEN_DIR / "g5_analytics.json").read_text(encoding="utf-8"))

    diffs = json_diff(g5_current, g5_golden, numeric_eps=1e-6)
    assert diffs == [], "\n".join(diffs)


def test_g6_feedback_matches_golden():
    g4 = json.loads((GOLDEN_DIR / "g4_clarity.json").read_text(encoding="utf-8"))
    g5 = json.loads((GOLDEN_DIR / "g5_analytics.json").read_text(encoding="utf-8"))
    g6_current = build_mobius_feedback_for_tutorial(g4, g5)
    g6_golden = json.loads((GOLDEN_DIR / "g6_feedback.json").read_text(encoding="utf-8"))

    diffs = json_diff(g6_current, g6_golden, numeric_eps=1e-6)
    assert diffs == [], "\n".join(diffs)
