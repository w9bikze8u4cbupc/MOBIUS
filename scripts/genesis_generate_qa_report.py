#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


AUTO_LOG_PATH = Path("logs/genesis_auto_optimize.jsonl")


@dataclass
class QaReportInputs:
    project_id: str
    g4: Dict[str, Any]
    g5: Optional[Dict[str, Any]]
    g6: Dict[str, Any]
    goals: Optional[Dict[str, Any]]
    auto_iterations: List[Dict[str, Any]]


def _load_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _load_goals(project_id: str) -> Optional[Dict[str, Any]]:
    path = Path("output") / project_id / "quality_goals.json"
    return _load_json(path)


def _load_auto_iterations(project_id: str) -> List[Dict[str, Any]]:
    if not AUTO_LOG_PATH.is_file():
        return []
    entries: List[Dict[str, Any]] = []
    for line in AUTO_LOG_PATH.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        if str(e.get("projectId")) == str(project_id):
            entries.append(e)
    # Sort by iteration ascending
    entries.sort(key=lambda e: int(e.get("iteration", 0)))
    return entries


def load_inputs(project_id: str) -> QaReportInputs:
    out_dir = Path("output") / project_id

    g4 = _load_json(out_dir / "genesis_clarity_g4_v1.0.0.json")
    g6 = _load_json(out_dir / "genesis_feedback_v1.0.0.json")

    if not g4 or not g6:
        raise FileNotFoundError(
            f"Missing G4 or G6 for project {project_id}; cannot build report."
        )

    g5 = _load_json(out_dir / "genesis_analytics_g5_v1.0.0.json")
    goals = _load_goals(project_id)
    auto_iterations = _load_auto_iterations(project_id)

    return QaReportInputs(
        project_id=project_id,
        g4=g4,
        g5=g5,
        g6=g6,
        goals=goals,
        auto_iterations=auto_iterations,
    )


def _format_pct(value: Optional[float]) -> str:
    if value is None:
        return "—"
    return f"{round(value * 100)}%"


def build_markdown_report(inputs: QaReportInputs) -> str:
    g4 = inputs.g4
    g6 = inputs.g6
    g5 = inputs.g5
    goals = inputs.goals
    autos = inputs.auto_iterations

    summary = g6.get("summary", {})
    clarity = g4.get("clarity", {})
    insights = g4.get("insights", {})
    recs = g6.get("recommendations", [])
    contract = g6.get("contract", {})
    identity = g6.get("identity", {})

    grade = summary.get("grade", "—")
    clarity_score = summary.get("clarityScore")
    dist = summary.get("distanceFromCentroid")

    lines: List[str] = []

    lines.append(f"# GENESIS QA Report – Project `{inputs.project_id}`")
    lines.append("")
    lines.append("## 1. Summary")
    lines.append("")
    lines.append(f"- **GENESIS feedback contract**: `{contract.get('name', '')}` v{contract.get('version', '')}")
    lines.append(f"- **Analysis ID**: `{identity.get('analysisId', '')}`")
    lines.append("")
    lines.append(f"- **Grade**: `{grade}`")
    lines.append(f"- **Clarity score**: `{_format_pct(clarity_score)}`")
    lines.append(
        f"- **Distance from centroid**: `{dist:.3f}`"
        if isinstance(dist, (int, float))
        else "- **Distance from centroid**: `—`"
    )
    lines.append("")

    if goals:
        lines.append("## 2. Quality Goals")
        lines.append("")
        lines.append(f"- Minimum grade: `{goals.get('minGrade', 'B')}`")
        lines.append(f"- Minimum clarity: `{goals.get('minClarity', 0.75)}`")
        lines.append(f"- Maximum distance: `{goals.get('maxDistance', 0.55)}`")
        lines.append("")
    else:
        lines.append("## 2. Quality Goals")
        lines.append("")
        lines.append("_No explicit quality goals defined for this project._")
        lines.append("")

    lines.append("## 3. Clarity & Density")
    lines.append("")
    lines.append(f"- Clarity score: `{_format_pct(clarity.get('clarityScore'))}`")
    lines.append(f"- Pacing stability: `{_format_pct(clarity.get('pacingStability'))}`")
    lines.append(
        f"- Density variance: `{clarity.get('densityVariance')}`"
        if clarity.get("densityVariance") is not None
        else "- Density variance: `—`"
    )
    lines.append(
        f"- Caption load index: `{clarity.get('captionLoadIndex')}`"
        if clarity.get("captionLoadIndex") is not None
        else "- Caption load index: `—`"
    )
    lines.append("")

    issues = insights.get("issues", [])
    if issues:
        lines.append("### 3.1 Flagged Issues")
        lines.append("")
        for iss in issues:
            code = iss.get("code", "ISSUE")
            msg = iss.get("message") or iss.get("detail") or ""
            lines.append(f"- **{code}** – {msg}")
        lines.append("")
    else:
        lines.append("### 3.1 Flagged Issues")
        lines.append("")
        lines.append("_No clarity issues recorded in G4._")
        lines.append("")

    lines.append("## 4. GENESIS Recommendations (G6)")
    lines.append("")
    if recs:
        for r in sorted(recs, key=lambda r: (r.get("priority", 99), r.get("code", ""))):
            lines.append(
                f"- `[#{r.get('priority', '?')}]` **{r.get('code', 'REC')}** "
                f"({r.get('severity', 'info')} / {r.get('category', 'overall')}): {r.get('message', '')}"
            )
        lines.append("")
    else:
        lines.append("_No recommendations in G6 feedback bundle._")
        lines.append("")

    if g5:
        comps = g5.get("tutorialComparisons", [])
        lines.append("## 5. Cross-Tutorial Context (G5)")
        lines.append("")
        if comps:
            lines.append(
                f"- Number of tutorials in comparison set: `{len(comps)}`"
            )
            # Find this tutorial
            tid = g6.get("input", {}).get("tutorialId")
            match = None
            for c in comps:
                if c.get("tutorialId") == tid:
                    match = c
                    break
            if match:
                lines.append(f"- This tutorial rank index: `{match.get('rankIndex', '—')}`")
                lines.append(
                    f"- This tutorial distance from centroid: `{match.get('distanceFromCentroid', '—')}`"
                )
                zs = match.get("zScores", {})
                lines.append(
                    f"- z(clarity): `{zs.get('clarityScore', '—')}`, "
                    f"z(captionLoad): `{zs.get('captionLoadIndex', '—')}`, "
                    f"z(motion): `{zs.get('avgMotionLoad', '—')}`"
                )
                if match.get("flags"):
                    lines.append(f"- Flags: `{', '.join(match['flags'])}`")
            lines.append("")
        else:
            lines.append("_No cross-tutorial analytics found in G5 bundle._")
            lines.append("")
    else:
        lines.append("## 5. Cross-Tutorial Context (G5)")
        lines.append("")
        lines.append("_G5 analytics bundle not present for this project._")
        lines.append("")

    lines.append("## 6. Auto-Optimization History (Optional)")
    lines.append("")
    if autos:
        for it in autos:
            status = it.get("status", "unknown")
            lines.append(
                f"- Iteration {it.get('iteration', '?')}: "
                f"grade `{it.get('achievedGrade', '—')}`, "
                f"clarity `{it.get('achievedClarity', 0.0):.2f}`, "
                f"distance `{it.get('achievedDistance', 0.0):.3f}`, "
                f"status `{status}`"
            )
            reasons = it.get("reasons") or []
            if reasons:
                for r in reasons:
                    lines.append(f"  - {r}")
        lines.append("")
    else:
        lines.append("_No auto-optimization iterations recorded._")
        lines.append("")

    lines.append("## 7. Files & Provenance")
    lines.append("")
    lines.append(
        f"- G4 clarity: `output/{inputs.project_id}/genesis_clarity_g4_v1.0.0.json`"
    )
    lines.append(
        f"- G5 analytics: `output/{inputs.project_id}/genesis_analytics_g5_v1.0.0.json`"
    )
    lines.append(
        f"- G6 feedback: `output/{inputs.project_id}/genesis_feedback_v1.0.0.json`"
    )
    lines.append("")

    return "\n".join(lines)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Generate GENESIS QA report (Markdown)")
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args(argv)

    inputs = load_inputs(args.project_id)
    md = build_markdown_report(inputs)

    out_dir = Path("output") / inputs.project_id
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "genesis_qa_report_v1.0.0.md"
    report_path.write_text(md, encoding="utf-8")

    print(f"GENESIS QA report written to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
