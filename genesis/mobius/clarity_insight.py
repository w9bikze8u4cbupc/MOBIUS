# genesis/mobius/clarity_insight.py

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, Any, List


@dataclass
class G3GlobalMetricsLike:
    durationSec: float
    avgWpm: float
    avgCps: float
    avgMotionLoad: float
    avgClarityScore: float
    densityVariance: float
    pacingStability: float
    captionLoadIndex: float


@dataclass
class G3IdentityLike:
    tutorialId: str
    mobiusExportVersion: str
    genesisIngestVersion: str
    g2QualityContractVersion: str
    seqIndex: int


@dataclass
class ClarityScores:
    clarityScore: float
    pacingStability: float
    densityVariance: float
    captionLoadIndex: float


@dataclass
class InsightIssue:
    code: str          # e.g. "PACING_HIGH_VARIANCE"
    severity: str      # "info" | "warn" | "error"
    message: str
    segment: str       # e.g. "pacing", "captions", "motion", "overall"


@dataclass
class PerSceneInsight:
    sceneIndex: int
    kind: str
    message: str


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _normalize_clarity(global_metrics: G3GlobalMetricsLike) -> ClarityScores:
    # Normalize into [0,1] with conservative scaling; these can be tuned in a future version.
    clarity_score = _clamp01(global_metrics.avgClarityScore)

    pacing_stability = _clamp01(1.0 - (global_metrics.pacingStability / 5000.0))
    density_variance = _clamp01(global_metrics.densityVariance / 5.0)
    caption_load_index = _clamp01(global_metrics.captionLoadIndex / 25.0)

    return ClarityScores(
        clarityScore=clarity_score,
        pacingStability=pacing_stability,
        densityVariance=density_variance,
        captionLoadIndex=caption_load_index,
    )


def _grade_from_clarity(clarity: ClarityScores) -> str:
    score = clarity.clarityScore
    if score >= 0.85:
        return "A"
    if score >= 0.7:
        return "B"
    if score >= 0.55:
        return "C"
    if score >= 0.4:
        return "D"
    return "F"


def _issues_from_metrics(global_metrics: G3GlobalMetricsLike, clarity: ClarityScores) -> List[InsightIssue]:
    issues: List[InsightIssue] = []

    # Pacing: high variance implies inconsistent pacing.
    if global_metrics.pacingStability > 4000.0:
        issues.append(
            InsightIssue(
                code="PACING_HIGH_VARIANCE",
                severity="warn",
                message="Pacing varies significantly between segments; consider smoothing narration speed.",
                segment="pacing",
            )
        )

    # Captions: high load index indicates dense subtitles.
    if global_metrics.captionLoadIndex > 22.0:
        issues.append(
            InsightIssue(
                code="CAPTIONS_HEAVY_LOAD",
                severity="warn",
                message="Subtitles are dense; consider reducing CPS or splitting lines.",
                segment="captions",
            )
        )

    # Motion: sustained high motion load.
    if global_metrics.avgMotionLoad > 0.75:
        issues.append(
            InsightIssue(
                code="MOTION_EXCESSIVE",
                severity="warn",
                message="Motion intensity is high; consider reducing concurrent animations.",
                segment="motion",
            )
        )

    # Clarity: overall low clarity score.
    if clarity.clarityScore < 0.5:
        issues.append(
            InsightIssue(
                code="CLARITY_LOW",
                severity="error",
                message="Overall clarity score is low; consider revising script structure and explanations.",
                segment="overall",
            )
        )

    return issues


def _summary_from_grade_and_issues(grade: str, issues: List[InsightIssue]) -> str:
    if not issues:
        if grade in ("A", "B"):
            return "Tutorial quality appears stable with no major pacing, caption, or motion issues detected."
        return "Tutorial quality is acceptable with no specific major issues detected, but clarity can still be improved."

    segments = sorted({iss.segment for iss in issues})
    segment_list = ", ".join(segments)
    return f"Tutorial shows potential issues in: {segment_list}."


def build_clarity_insight_from_g3(
    g3_bundle: Dict[str, Any],
    *,
    g3_contract_version: str | None = None,
) -> Dict[str, Any]:
    """
    Build a G4 clarity/insight bundle from a G3 visualization bundle.

    This is the primary G4 entry point.
    """
    identity_raw = g3_bundle.get("identity", {})
    global_raw = g3_bundle.get("globalMetrics", {})

    identity = G3IdentityLike(
        tutorialId=str(identity_raw.get("tutorialId", "")),
        mobiusExportVersion=str(identity_raw.get("mobiusExportVersion", "")),
        genesisIngestVersion=str(identity_raw.get("genesisIngestVersion", "")),
        g2QualityContractVersion=str(identity_raw.get("g2QualityContractVersion", "")),
        seqIndex=int(identity_raw.get("seqIndex", 0)),
    )

    gm = G3GlobalMetricsLike(
        durationSec=float(global_raw.get("durationSec", 0.0)),
        avgWpm=float(global_raw.get("avgWpm", 0.0)),
        avgCps=float(global_raw.get("avgCps", 0.0)),
        avgMotionLoad=float(global_raw.get("avgMotionLoad", 0.0)),
        avgClarityScore=float(global_raw.get("avgClarityScore", 0.0)),
        densityVariance=float(global_raw.get("densityVariance", 0.0)),
        pacingStability=float(global_raw.get("pacingStability", 0.0)),
        captionLoadIndex=float(global_raw.get("captionLoadIndex", 0.0)),
    )

    clarity = _normalize_clarity(gm)
    grade = _grade_from_clarity(clarity)
    issues = _issues_from_metrics(gm, clarity)
    summary = _summary_from_grade_and_issues(grade, issues)

    # Per-scene insights: stub for now, to be extended later using G3.timeline.
    per_scene_insights: List[PerSceneInsight] = []

    g4_bundle: Dict[str, Any] = {
        "contract": {
            "name": "g4_clarity_insight_contract",
            "version": "1.0.0",
        },
        "identity": {
            "tutorialId": identity.tutorialId,
            "mobiusExportVersion": identity.mobiusExportVersion,
            "genesisIngestVersion": identity.genesisIngestVersion,
            "g2QualityContractVersion": identity.g2QualityContractVersion,
            "g3VisualizationContractVersion": g3_contract_version or g3_bundle.get("contract", {}).get("version", ""),
            "seqIndex": identity.seqIndex,
        },
        "clarity": asdict(clarity),
        "insights": {
            "grade": grade,
            "summary": summary,
            "issues": [asdict(issue) for issue in issues],
        },
        "perSceneInsights": {
            "items": [asdict(item) for item in per_scene_insights],
        },
        "metadata": {
            "createdAtUtc": g3_bundle.get("metadata", {}).get("createdAtUtc", None),
            "generator": "GENESIS-G4",
            "generatorVersion": "1.0.0",
        },
    }

    return g4_bundle
