#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional


CONFIG_PATH = Path("configs/genesis_auto_optimize.json")
AUTO_LOG_PATH = Path("logs/genesis_auto_optimize.jsonl")


@dataclass
class AutoOptimizeIteration:
    projectId: str
    iteration: int
    targetGrade: str
    targetClarity: float
    targetMaxDistance: float
    achievedGrade: str
    achievedClarity: float
    achievedDistance: float
    compliant: Optional[bool]
    reasons: list[str]
    wpm: float
    cpsMin: float
    cpsMax: float
    maxMotionLoad: float
    status: str  # "continue" | "success" | "limit" | "error"


def load_config() -> Dict[str, Any]:
    if CONFIG_PATH.is_file():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {
        "maxIterations": 5,
        "maxWpmStep": 20,
        "clarityStep": 0.05,
        "distanceStep": 0.05,
    }


def load_goals(project_id: str) -> Optional[Dict[str, Any]]:
    path = Path("output") / project_id / "quality_goals.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_feedback(project_id: str) -> Dict[str, Any]:
    path = Path("output") / project_id / "genesis_feedback_v1.0.0.json"
    if not path.is_file():
        raise FileNotFoundError(f"G6 feedback not found for project {project_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_render_config(project_id: str) -> Dict[str, Any]:
    path = Path("output") / project_id / "render_config.json"
    if not path.is_file():
        # Fallback baseline
        return {
            "subtitles": {"targetCpsMin": 10, "targetCpsMax": 20},
            "audio": {"targetWpm": 160, "duckingThresholdDb": -18},
            "motion": {"maxMotionLoad": 0.85},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def save_render_config(project_id: str, cfg: Dict[str, Any]) -> None:
    path = Path("output") / project_id / "render_config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def run_mobius_render(project_id: str) -> None:
    """
    Shells out to the existing MOBIUS render pipeline.
    Adjust command to match your actual entrypoint.
    """
    cmd = ["python", "video_generator.py", "--project-id", str(project_id)]
    subprocess.check_call(cmd)


def run_genesis_eval(project_id: str) -> None:
    """
    Shells out to the GENESIS evaluation pipeline that produces G3–G6
    for the given project. Adjust to your actual script.
    """
    cmd = ["python", "scripts/run_genesis_e2e_for_project.py", "--project-id", str(project_id)]
    subprocess.check_call(cmd)


def compute_compliance(g6: Dict[str, Any], goals: Dict[str, Any]) -> Dict[str, Any]:
    grade_order = {"A": 4, "B": 3, "C": 2, "D": 1, "F": 0}
    reasons: list[str] = []
    compliant = True

    grade = g6.get("summary", {}).get("grade")
    clarity = float(g6.get("summary", {}).get("clarityScore", 0.0))
    dist = float(g6.get("summary", {}).get("distanceFromCentroid", 0.0))

    min_grade = goals.get("minGrade", "B")
    min_clarity = float(goals.get("minClarity", 0.75))
    max_dist = float(goals.get("maxDistance", 0.55))

    if grade_order.get(grade, 0) < grade_order.get(min_grade, 3):
        compliant = False
        reasons.append(f"Grade {grade} < required {min_grade}")

    if clarity < min_clarity:
        compliant = False
        reasons.append(f"Clarity {clarity:.2f} < minimum {min_clarity:.2f}")

    if dist > max_dist:
        compliant = False
        reasons.append(f"Distance {dist:.3f} > maximum {max_dist:.3f}")

    return {
        "compliant": compliant,
        "reasons": reasons,
        "grade": grade,
        "clarity": clarity,
        "distance": dist,
        "minGrade": min_grade,
        "minClarity": min_clarity,
        "maxDistance": max_dist,
    }


def adjust_config(
    cfg: Dict[str, Any],
    g6: Dict[str, Any],
    goals: Dict[str, Any],
    cfg_limits: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Deterministic config adjuster guided by GENESIS feedback.
    Only uses summary + recommendations.
    """
    max_wpm_step = float(cfg_limits.get("maxWpmStep", 20))
    clarity_step = float(cfg_limits.get("clarityStep", 0.05))

    summary = g6.get("summary", {})
    recs = g6.get("recommendations", [])

    clarity = float(summary.get("clarityScore", 0.0))

    audio = cfg.setdefault("audio", {})
    subs = cfg.setdefault("subtitles", {})
    motion = cfg.setdefault("motion", {})

    wpm = float(audio.get("targetWpm", 160))
    cps_min = float(subs.get("targetCpsMin", 10))
    cps_max = float(subs.get("targetCpsMax", 20))
    max_motion = float(motion.get("maxMotionLoad", 0.85))

    # If clarity below goal: reduce WPM slightly and motion intensity.
    min_clarity = float(goals.get("minClarity", 0.75))
    if clarity < min_clarity:
        delta = min(max_wpm_step, (min_clarity - clarity) / clarity_step * 5)
        wpm = max(120.0, wpm - delta)
        max_motion = max(0.5, max_motion - 0.1)

    # Apply rec-specific hints.
    codes = {r.get("code") for r in recs}

    if "REDUCE_CAPTION_DENSITY" in codes:
        cps_max = max(14.0, cps_max - 2.0)

    if "REDUCE_MOTION_LOAD" in codes:
        max_motion = max(0.6, max_motion - 0.1)

    if "IMPROVE_SCRIPT_CLARITY" in codes:
        # Encourage slower speech
        wpm = max(120.0, wpm - 10.0)

    audio["targetWpm"] = round(wpm)
    subs["targetCpsMin"] = round(cps_min, 1)
    subs["targetCpsMax"] = round(cps_max, 1)
    motion["maxMotionLoad"] = round(max_motion, 2)

    return cfg


def append_log(entry: AutoOptimizeIteration) -> None:
    AUTO_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with AUTO_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(entry), separators=(",", ":")) + "\n")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="GENESIS auto-optimize loop")
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args(argv)

    project_id = args.project_id
    cfg_limits = load_config()
    goals = load_goals(project_id)
    if not goals:
        print(f"[AUTO] No quality_goals.json for {project_id}, nothing to do.")
        return 0

    cfg = load_render_config(project_id)

    max_iterations = int(cfg_limits.get("maxIterations", 5))

    for i in range(1, max_iterations + 1):
        print(f"[AUTO] Iteration {i}/{max_iterations} for project {project_id}")

        # 1) Render
        run_mobius_render(project_id)

        # 2) GENESIS evaluation
        run_genesis_eval(project_id)

        # 3) Load feedback and compute compliance
        g6 = load_feedback(project_id)
        comp = compute_compliance(g6, goals)

        summary = g6.get("summary", {})
        cfg_snapshot = {
            "wpm": cfg.get("audio", {}).get("targetWpm", 160),
            "cpsMin": cfg.get("subtitles", {}).get("targetCpsMin", 10),
            "cpsMax": cfg.get("subtitles", {}).get("targetCpsMax", 20),
            "maxMotionLoad": cfg.get("motion", {}).get("maxMotionLoad", 0.85),
        }

        status = "continue"
        if comp["compliant"]:
            status = "success"
        elif i == max_iterations:
            status = "limit"

        entry = AutoOptimizeIteration(
            projectId=project_id,
            iteration=i,
            targetGrade=comp["minGrade"],
            targetClarity=comp["minClarity"],
            targetMaxDistance=comp["maxDistance"],
            achievedGrade=comp["grade"],
            achievedClarity=comp["clarity"],
            achievedDistance=comp["distance"],
            compliant=comp["compliant"],
            reasons=comp["reasons"],
            wpm=cfg_snapshot["wpm"],
            cpsMin=cfg_snapshot["cpsMin"],
            cpsMax=cfg_snapshot["cpsMax"],
            maxMotionLoad=cfg_snapshot["maxMotionLoad"],
            status=status,
        )
        append_log(entry)

        if status == "success":
            print(f"[AUTO] Goals satisfied in iteration {i}.")
            break
        if status == "limit":
            print(f"[AUTO] Reached max iterations without meeting goals.")
            break

        # 4) Adjust config for next iteration
        cfg = adjust_config(cfg, g6, goals, cfg_limits)
        save_render_config(project_id, cfg)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
