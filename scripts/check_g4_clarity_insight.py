#!/usr/bin/env python
"""
scripts/check_g4_clarity_insight.py

Validate G4 clarity/insight bundles against the contract.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List


def _fail(msgs: List[str]) -> int:
    for m in msgs:
        print(f"[G4-VALIDATION] ERROR: {m}", file=sys.stderr)
    return 1


def _ok(msg: str) -> None:
    print(f"[G4-VALIDATION] OK: {msg}")


def _within(value: float, lo: float, hi: float) -> bool:
    return lo <= value <= hi


def validate_g4(bundle: Dict[str, Any]) -> List[str]:
    errors: List[str] = []

    contract = bundle.get("contract", {})
    if contract.get("name") != "g4_clarity_insight_contract":
        errors.append("contract.name must be 'g4_clarity_insight_contract'")
    if "version" not in contract:
        errors.append("contract.version missing")

    identity = bundle.get("identity", {})
    for key in (
        "tutorialId",
        "mobiusExportVersion",
        "genesisIngestVersion",
        "g2QualityContractVersion",
        "g3VisualizationContractVersion",
        "seqIndex",
    ):
        if key not in identity:
            errors.append(f"identity.{key} missing")

    clarity = bundle.get("clarity", {})
    if not clarity:
        errors.append("clarity section missing")

    insights = bundle.get("insights", {})
    if not insights:
        errors.append("insights section missing")

    # Early exit on structural issues.
    if errors:
        return errors

    # Clarity value ranges.
    for field in ("clarityScore", "pacingStability", "densityVariance", "captionLoadIndex"):
        value = float(clarity.get(field, -1.0))
        if not _within(value, 0.0, 1.0):
            errors.append(f"clarity.{field} out of range [0,1]: {value}")

    # Grade and issues.
    grade = str(insights.get("grade", ""))
    if grade not in {"A", "B", "C", "D", "F"}:
        errors.append(f"insights.grade invalid: {grade}")

    issues = insights.get("issues", [])
    if not isinstance(issues, list):
        errors.append("insights.issues must be a list")
    else:
        for idx, issue in enumerate(issues):
            code = issue.get("code")
            severity = issue.get("severity")
            segment = issue.get("segment")
            if not code:
                errors.append(f"insights.issues[{idx}].code missing")
            if severity not in {"info", "warn", "error"}:
                errors.append(f"insights.issues[{idx}].severity invalid: {severity}")
            if not segment:
                errors.append(f"insights.issues[{idx}].segment missing")

    return errors


def write_junit_xml(path: Path, elapsed_sec: float, errors: List[str]) -> None:
    testsuite = ET.Element("testsuite", name="g4_clarity_insight", tests="1")
    testcase = ET.SubElement(
        testsuite,
        "testcase",
        classname="g4",
        name="clarity_insight_contract_check",
        time=f"{elapsed_sec:.3f}",
    )
    if errors:
        failure = ET.SubElement(testcase, "failure", message="; ".join(errors))
        failure.text = "\n".join(errors)

    path.parent.mkdir(parents=True, exist_ok=True)
    tree = ET.ElementTree(testsuite)
    tree.write(path, encoding="utf-8", xml_declaration=True)


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check G4 clarity/insight bundles.")
    parser.add_argument("bundle", help="Path to G4 clarity/insight JSON file")
    parser.add_argument(
        "--junit-out",
        help="Optional path to write JUnit XML",
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

    errors = validate_g4(bundle)
    elapsed = time.time() - t0

    if args.junit_out:
        write_junit_xml(Path(args.junit_out), elapsed, errors)

    if errors:
        return _fail(errors)

    _ok(f"Bundle {bundle_path} passed G4 clarity/insight checks in {elapsed:.3f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
