#!/usr/bin/env python

from __future__ import annotations

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List


def _fail(msgs: List[str]) -> int:
    for msg in msgs:
        print(f"[G5-VALIDATION] ERROR: {msg}", file=sys.stderr)
    return 1


def _ok(msg: str) -> None:
    print(f"[G5-VALIDATION] OK: {msg}")


def _in_range(value: float, lo: float, hi: float) -> bool:
    return lo <= value <= hi


def validate(bundle: Dict[str, Any]) -> List[str]:
    errors: List[str] = []

    contract = bundle.get("contract", {})
    if contract.get("name") != "g5_cross_tutorial_analytics_contract":
        errors.append("contract.name mismatch")

    if "identity" not in bundle:
        errors.append("identity missing")

    agg = bundle.get("aggregateMetrics", {})
    centroid = agg.get("clarityCentroid", {})
    for field in ("clarityScore", "pacingStability", "densityVariance", "captionLoadIndex"):
        value = centroid.get(field)
        if value is None:
            errors.append(f"aggregateMetrics.clarityCentroid.{field} missing")
        elif not _in_range(value, 0, 1):
            errors.append(f"aggregateMetrics.clarityCentroid.{field} must be within [0,1]")

    for field in ("motionLoadMean", "captionLoadMean"):
        value = agg.get(field)
        if value is None:
            errors.append(f"aggregateMetrics.{field} missing")
        elif not _in_range(value, 0, 1):
            errors.append(f"aggregateMetrics.{field} must be within [0,1]")

    comps = bundle.get("tutorialComparisons", [])
    if not comps:
        errors.append("tutorialComparisons missing")

    for comp in comps:
        if comp.get("distanceFromCentroid", -1) < 0:
            errors.append("distanceFromCentroid must be >= 0")
        zs = comp.get("zScores", {})
        for field in ("clarityScore", "captionLoadIndex", "avgMotionLoad"):
            value = zs.get(field)
            if value is None:
                errors.append(f"zScores.{field} missing")
            elif not _in_range(value, -3, 3):
                errors.append(f"zScores.{field} out of range [-3,3]")

    drift = bundle.get("drift", {})
    for field in ("clarityDrift", "captionLoadDrift", "motionLoadDrift"):
        value = drift.get(field)
        if value is None:
            errors.append(f"drift.{field} missing")

    recs = bundle.get("recommendations", [])
    severities = {"info", "warn", "error"}
    for rec in recs:
        sev = rec.get("severity")
        if sev not in severities:
            errors.append(f"Invalid severity: {sev}")

    return errors


def write_junit(path: Path, errors: List[str], duration: float) -> None:
    suite = ET.Element("testsuite", name="g5_cross_tutorial_analytics", tests="1")
    case = ET.SubElement(suite, "testcase", name="g5_validation", time=f"{duration:.3f}")
    if errors:
        failure = ET.SubElement(case, "failure", message="; ".join(errors))
        failure.text = "\n".join(errors)
    tree = ET.ElementTree(suite)
    path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(path, encoding="utf-8", xml_declaration=True)


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle")
    parser.add_argument("--junit-out")
    args = parser.parse_args(argv)

    start = time.time()
    bundle = json.loads(Path(args.bundle).read_text())
    errors = validate(bundle)
    duration = time.time() - start

    if args.junit_out:
        write_junit(Path(args.junit_out), errors, duration)

    if errors:
        return _fail(errors)

    _ok(f"{args.bundle} passed G5 validation in {duration:.3f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
