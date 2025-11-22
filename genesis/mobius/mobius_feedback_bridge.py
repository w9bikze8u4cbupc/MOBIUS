from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass
class G4ClarityMini:
    grade: str
    clarityScore: float


@dataclass
class G5ComparisonMini:
    distanceFromCentroid: float
    z_clarity: float
    z_captions: float
    z_motion: float
    flags: List[str]


def _extract_g4_clarity(g4_bundle: Dict[str, Any]) -> G4ClarityMini:
    insights = g4_bundle.get("insights", {})
    clarity = g4_bundle.get("clarity", {})
    return G4ClarityMini(
        grade=str(insights.get("grade", "C")),
        clarityScore=float(clarity.get("clarityScore", 0.5)),
    )


def _find_g5_comparison_for_tutorial(
    g5_bundle: Dict[str, Any],
    tutorial_id: str,
) -> G5ComparisonMini:
    comps = g5_bundle.get("tutorialComparisons", [])
    for comp in comps:
        if comp.get("tutorialId") == tutorial_id:
            zs = comp.get("zScores", {})
            return G5ComparisonMini(
                distanceFromCentroid=float(comp.get("distanceFromCentroid", 0.0)),
                z_clarity=float(zs.get("clarityScore", 0.0)),
                z_captions=float(zs.get("captionLoadIndex", 0.0)),
                z_motion=float(zs.get("avgMotionLoad", 0.0)),
                flags=list(comp.get("flags", [])),
            )
    return G5ComparisonMini(
        distanceFromCentroid=0.0,
        z_clarity=0.0,
        z_captions=0.0,
        z_motion=0.0,
        flags=[],
    )


def _build_recommendations(
    clarity: G4ClarityMini,
    cmp: G5ComparisonMini,
) -> List[Dict[str, Any]]:
    recs: List[Dict[str, Any]] = []

    if clarity.clarityScore < 0.5 or "CLARITY_LOW" in cmp.flags:
        recs.append({
            "code": "IMPROVE_SCRIPT_CLARITY",
            "severity": "error",
            "message": "Clarify explanations and reduce cognitive jumps between steps.",
            "category": "script",
            "priority": 1,
        })

    if cmp.z_captions > 1.0 or "CAPTIONS_HEAVY" in cmp.flags:
        recs.append({
            "code": "REDUCE_CAPTION_DENSITY",
            "severity": "warn",
            "message": "Subtitles are heavy relative to other tutorials; reduce CPS or split lines.",
            "category": "captions",
            "priority": 2,
        })

    if cmp.z_motion > 1.0 or "MOTION_HIGH" in cmp.flags:
        recs.append({
            "code": "REDUCE_MOTION_LOAD",
            "severity": "warn",
            "message": "Motion intensity is high; reduce concurrent animations or durations.",
            "category": "motion",
            "priority": 2,
        })

    if not recs:
        recs.append({
            "code": "MAINTAIN_QUALITY",
            "severity": "info",
            "message": "Tutorial quality is consistent with peers. Maintain current settings.",
            "category": "overall",
            "priority": 3,
        })

    recs.sort(key=lambda r: (r["priority"], r["code"]))
    return recs


def _build_mobius_hints(
    clarity: G4ClarityMini,
    cmp: G5ComparisonMini,
) -> Dict[str, Any]:
    target_wpm_min = 140.0
    target_wpm_max = 175.0

    if clarity.clarityScore > 0.75 and cmp.z_clarity > 0.5:
        target_wpm_max = 185.0

    target_cps_min = 10.0
    target_cps_max = 22.0
    if cmp.z_captions > 1.0:
        target_cps_max = 18.0

    max_motion_load = 0.85
    if cmp.z_motion > 1.0:
        max_motion_load = 0.7

    suggest_lower_ducking = cmp.z_motion > 0.5
    suggest_more_pauses = clarity.clarityScore < 0.6 or cmp.z_captions > 0.5

    return {
        "targetWpmRange": {
            "min": target_wpm_min,
            "max": target_wpm_max,
        },
        "targetCaptionCpsRange": {
            "min": target_cps_min,
            "max": target_cps_max,
        },
        "maxMotionLoad": max_motion_load,
        "suggestLowerDuckingThreshold": bool(suggest_lower_ducking),
        "suggestStrongerPauseCues": bool(suggest_more_pauses),
    }


def build_mobius_feedback_for_tutorial(
    g4_bundle: Dict[str, Any],
    g5_bundle: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Primary G6 entry point for a single tutorial.

    Inputs:
      - G4 clarity/insight bundle for that tutorial.
      - G5 analytics bundle containing cross-tutorial context.

    Output:
      - G6 feedback bundle conforming to g6_mobius_feedback_contract_v1.0.0.
    """
    identity = g4_bundle.get("identity", {})
    tutorial_id = str(identity.get("tutorialId", ""))

    clarity = _extract_g4_clarity(g4_bundle)
    cmp = _find_g5_comparison_for_tutorial(g5_bundle, tutorial_id)
    recs = _build_recommendations(clarity, cmp)
    hints = _build_mobius_hints(clarity, cmp)

    g6 = {
        "contract": {
            "name": "g6_mobius_feedback_contract",
            "version": "1.0.0",
        },
        "identity": {
            "analysisId": f"g6-{tutorial_id}",
            "generatedAtUtc": g5_bundle.get("identity", {}).get("generatedAtUtc", "2025-11-18T00:00:00Z"),
            "generatorVersion": "1.0.0",
        },
        "input": {
            "tutorialId": tutorial_id,
            "mobiusExportVersion": str(identity.get("mobiusExportVersion", "")),
            "genesisIngestVersion": str(identity.get("genesisIngestVersion", "")),
            "g4ClarityVersion": str(g4_bundle.get("contract", {}).get("version", "")),
            "g5AnalyticsVersion": str(g5_bundle.get("contract", {}).get("version", "")),
        },
        "summary": {
            "grade": clarity.grade,
            "clarityScore": clarity.clarityScore,
            "distanceFromCentroid": cmp.distanceFromCentroid,
        },
        "recommendations": recs,
        "mobiusHints": hints,
        "metadata": {
            "notes": "GENESIS-generated feedback; MOBIUS may apply these hints to future renders.",
        },
    }
    return g6
