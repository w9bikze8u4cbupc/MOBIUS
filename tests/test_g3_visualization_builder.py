from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis.mobius.tutorial_visualization import TimelineSample, build_tutorial_visualization


def test_g3_visualization_geometry_ranges() -> None:
    samples = [
        TimelineSample(0.0, 1.0, 0, "setup", 150.0, 12.0, 0.2, 0.9, 0.8),
        TimelineSample(1.0, 2.0, 1, "gameplay", 170.0, 18.0, 0.4, 0.8, 0.7),
    ]
    bundle = build_tutorial_visualization(
        tutorial_id="demo",
        mobius_export_version="1.0.0",
        genesis_ingest_version="1.0.0",
        g2_quality_contract_version="1.0.0",
        seq_index=1,
        timeline_samples=samples,
    )

    overlays = bundle["overlays"]
    for pt in overlays["pacingWave"]["points"]:
        assert 0.28 <= pt["radius"] <= 0.55
    for seg in overlays["densityBand"]["segments"]:
        assert 0.40 <= seg["radiusInner"] <= 0.75
        assert 0.40 <= seg["radiusOuter"] <= 0.92
        assert seg["radiusOuter"] >= seg["radiusInner"]
    for arc in overlays["visualLoadRing"]["arcs"]:
        assert 0.75 <= arc["radius"] <= 0.92
        assert 0.0 <= arc["load"] <= 1.0
    for block in overlays["captionBand"]["blocks"]:
        assert 0.28 <= block["radiusInner"] <= 0.55
        assert 0.28 <= block["radiusOuter"] <= 0.55
        assert block["radiusOuter"] >= block["radiusInner"]
        assert 0 <= block["lines"] <= 2
    for pt in overlays["clarityThread"]["points"]:
        assert 0.55 <= pt["radius"] <= 0.75
        assert 0.0 <= pt["clarityScore"] <= 1.0
