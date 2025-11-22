#!/usr/bin/env python
"""
scripts/check_g3_visualization.py

Validate G3 tutorial visualization bundles against the contract.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List


TAU = 6.283185307179586


def _fail(msgs: List[str]) -> int:
    for m in msgs:
        print(f"[G3-VALIDATION] ERROR: {m}", file=sys.stderr)
    return 1


def _ok(msg: str) -> None:
    print(f"[G3-VALIDATION] OK: {msg}")


def _within(value: float, lo: float, hi: float) -> bool:
    return lo <= value <= hi


def validate_bundle(bundle: Dict[str, Any]) -> List[str]:
    errors: List[str] = []

    contract = bundle.get("contract", {})
    if contract.get("name") != "g3_tutorial_visualization_contract":
        errors.append("contract.name must be 'g3_tutorial_visualization_contract'")
    if "version" not in contract:
        errors.append("contract.version missing")

    identity = bundle.get("identity", {})
    for key in ("tutorialId", "mobiusExportVersion", "genesisIngestVersion", "g2QualityContractVersion", "seqIndex"):
        if key not in identity:
            errors.append(f"identity.{key} missing")

    timeline = bundle.get("timeline")
    if not isinstance(timeline, list):
        errors.append("timeline must be a list")

    overlays = bundle.get("overlays")
    if not isinstance(overlays, dict):
        errors.append("overlays must be an object")

    if errors:
        return errors

    last_t_end = 0.0
    for idx, sample in enumerate(timeline):
        try:
            t_start = float(sample["tStartSec"])
            t_end = float(sample["tEndSec"])
            wpm = float(sample["wpm"])
            cps = float(sample["cps"])
            motion_load = float(sample["motionLoad"])
            audio_stability = float(sample["audioStability"])
            clarity_score = float(sample["clarityScore"])
        except Exception as exc:  # noqa: BLE001
            errors.append(f"timeline[{idx}] missing or invalid numeric fields: {exc}")
            continue

        if t_start < 0.0:
            errors.append(f"timeline[{idx}].tStartSec must be >= 0")
        if t_end <= t_start:
            errors.append(f"timeline[{idx}].tEndSec must be > tStartSec")
        if t_start < last_t_end:
            errors.append(f"timeline[{idx}] starts before previous sample ended (non-monotonic time)")
        last_t_end = t_end

        if not _within(wpm, 0.0, 320.0):
            errors.append(f"timeline[{idx}].wpm out of range [0,320]: {wpm}")
        if not _within(cps, 0.0, 40.0):
            errors.append(f"timeline[{idx}].cps out of range [0,40]: {cps}")
        if not _within(motion_load, 0.0, 1.0):
            errors.append(f"timeline[{idx}].motionLoad out of range [0,1]: {motion_load}")
        if not _within(audio_stability, 0.0, 1.0):
            errors.append(f"timeline[{idx}].audioStability out of range [0,1]: {audio_stability}")
        if not _within(clarity_score, 0.0, 1.0):
            errors.append(f"timeline[{idx}].clarityScore out of range [0,1]: {clarity_score}")

    pacing = overlays.get("pacingWave", {})
    for idx, pt in enumerate(pacing.get("points", [])):
        angle = float(pt.get("angle", 0.0))
        radius = float(pt.get("radius", 0.0))
        if not _within(angle, 0.0, TAU):
            errors.append(f"pacingWave.points[{idx}].angle out of range [0,2π]: {angle}")
        if not _within(radius, 0.28, 0.55):
            errors.append(f"pacingWave.points[{idx}].radius out of range [0.28,0.55]: {radius}")

    density = overlays.get("densityBand", {})
    for idx, seg in enumerate(density.get("segments", [])):
        angle_start = float(seg.get("angleStart", 0.0))
        angle_end = float(seg.get("angleEnd", 0.0))
        r_inner = float(seg.get("radiusInner", 0.0))
        r_outer = float(seg.get("radiusOuter", 0.0))
        if angle_end < angle_start:
            errors.append(f"densityBand.segments[{idx}] angleEnd < angleStart")
        if not _within(r_inner, 0.40, 0.75):
            errors.append(f"densityBand.segments[{idx}].radiusInner out of range [0.40,0.75]: {r_inner}")
        if not _within(r_outer, 0.40, 0.92):
            errors.append(f"densityBand.segments[{idx}].radiusOuter out of range [0.40,0.92]: {r_outer}")
        if r_outer < r_inner:
            errors.append(f"densityBand.segments[{idx}] radiusOuter < radiusInner")

    visual = overlays.get("visualLoadRing", {})
    for idx, arc in enumerate(visual.get("arcs", [])):
        angle_start = float(arc.get("angleStart", 0.0))
        angle_end = float(arc.get("angleEnd", 0.0))
        radius = float(arc.get("radius", 0.0))
        load = float(arc.get("load", 0.0))
        if angle_end < angle_start:
            errors.append(f"visualLoadRing.arcs[{idx}] angleEnd < angleStart")
        if not _within(radius, 0.75, 0.92):
            errors.append(f"visualLoadRing.arcs[{idx}].radius out of range [0.75,0.92]: {radius}")
        if not _within(load, 0.0, 1.0):
            errors.append(f"visualLoadRing.arcs[{idx}].load out of range [0,1]: {load}")

    caption = overlays.get("captionBand", {})
    for idx, block in enumerate(caption.get("blocks", [])):
        r_inner = float(block.get("radiusInner", 0.0))
        r_outer = float(block.get("radiusOuter", 0.0))
        cps = float(block.get("cps", 0.0))
        lines = int(block.get("lines", 0))
        if not _within(r_inner, 0.28, 0.55):
            errors.append(f"captionBand.blocks[{idx}].radiusInner out of range [0.28,0.55]: {r_inner}")
        if not _within(r_outer, 0.28, 0.55):
            errors.append(f"captionBand.blocks[{idx}].radiusOuter out of range [0.28,0.55]: {r_outer}")
        if r_outer < r_inner:
            errors.append(f"captionBand.blocks[{idx}] radiusOuter < radiusInner")
        if not _within(cps, 0.0, 40.0):
            errors.append(f"captionBand.blocks[{idx}].cps out of range [0,40]: {cps}")
        if lines < 0 or lines > 2:
            errors.append(f"captionBand.blocks[{idx}].lines out of range [0,2]: {lines}")

    clarity = overlays.get("clarityThread", {})
    for idx, pt in enumerate(clarity.get("points", [])):
        radius = float(pt.get("radius", 0.0))
        score = float(pt.get("clarityScore", 0.0))
        if not _within(radius, 0.55, 0.75):
            errors.append(f"clarityThread.points[{idx}].radius out of range [0.55,0.75]: {radius}")
        if not _within(score, 0.0, 1.0):
            errors.append(f"clarityThread.points[{idx}].clarityScore out of range [0,1]: {score}")

    return errors


def write_junit_xml(path: Path, elapsed_sec: float, errors: List[str]) -> None:
    testsuite = ET.Element("testsuite", name="g3_tutorial_visualization", tests="1")
    testcase = ET.SubElement(
        testsuite, "testcase", classname="g3", name="visualization_contract_check", time=f"{elapsed_sec:.3f}"
    )
    if errors:
        failure = ET.SubElement(testcase, "failure", message="; ".join(errors))
        failure.text = "\n".join(errors)

    tree = ET.ElementTree(testsuite)
    path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(path, encoding="utf-8", xml_declaration=True)


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check G3 tutorial visualization bundles.")
    parser.add_argument("bundle", help="Path to visualization JSON file")
    parser.add_argument(
        "--junit-out",
        help="Optional path to write JUnit XML (e.g., artifacts/junit/g3_visualization.xml)",
    )
    args = parser.parse_args(argv)

    bundle_path = Path(args.bundle)
    if not bundle_path.is_file():
        return _fail([f"Bundle file not found: {bundle_path}"])

    t0 = time.time()
    try:
        bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return _fail([f"Failed to parse JSON: {exc!r}"])

    errors = validate_bundle(bundle)
    elapsed = time.time() - t0

    if args.junit_out:
        write_junit_xml(Path(args.junit_out), elapsed, errors)

    if errors:
        return _fail(errors)

    _ok(f"Bundle {bundle_path} passed G3 visualization checks in {elapsed:.3f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
