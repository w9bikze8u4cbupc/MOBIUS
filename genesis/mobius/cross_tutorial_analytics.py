"""Deterministic cross-tutorial analytics (G5).

This module ingests multiple G4 clarity/insight bundles and produces
cross-tutorial analytics including clustering, drift detection, and
recommendations following the G5 contract.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

ROUND_PLACES = 6


# --- Data Structures --------------------------------------------------------


@dataclass(frozen=True)
class G4Mini:
    tutorialId: str
    clarityScore: float
    pacingStability: float
    densityVariance: float
    captionLoadIndex: float
    avgMotionLoad: float


@dataclass
class Centroid:
    clarityScore: float
    pacingStability: float
    densityVariance: float
    captionLoadIndex: float


# --- Helpers ---------------------------------------------------------------


def _round(value: float) -> float:
    return round(float(value), ROUND_PLACES)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _bounded_metric(value: float) -> float:
    return _clamp(_round(value), 0.0, 1.0)


def _euclid(a: G4Mini, c: Centroid) -> float:
    return _round(
        math.sqrt(
            (a.clarityScore - c.clarityScore) ** 2
            + (a.pacingStability - c.pacingStability) ** 2
            + (a.densityVariance - c.densityVariance) ** 2
            + (a.captionLoadIndex - c.captionLoadIndex) ** 2
        )
    )


def _zscore(v: float, mean: float, sd: float) -> float:
    if sd == 0:
        return 0.0
    return _round(_clamp((v - mean) / sd, -3.0, 3.0))


def _mean(values: Iterable[float]) -> float:
    return _round(statistics.mean(values))


def _extract_g4_mini(bundle: Dict[str, Any]) -> G4Mini:
    identity = bundle.get("identity", {})
    clarity = bundle.get("clarity", {})
    global_metrics = bundle.get("globalMetrics", {})

    return G4Mini(
        tutorialId=str(identity.get("tutorialId", "")),
        clarityScore=_bounded_metric(clarity.get("clarityScore", 0.0)),
        pacingStability=_bounded_metric(clarity.get("pacingStability", 0.0)),
        densityVariance=_bounded_metric(clarity.get("densityVariance", 0.0)),
        captionLoadIndex=_bounded_metric(clarity.get("captionLoadIndex", 0.0)),
        avgMotionLoad=_bounded_metric(global_metrics.get("avgMotionLoad", 0.0)),
    )


def _seed_centroids(minis: List[G4Mini]) -> List[Centroid]:
    seeds: List[G4Mini] = minis[:3]
    while len(seeds) < 3:
        seeds.append(minis[-1])
    return [
        Centroid(
            clarityScore=m.clarityScore,
            pacingStability=m.pacingStability,
            densityVariance=m.densityVariance,
            captionLoadIndex=m.captionLoadIndex,
        )
        for m in seeds
    ]


# --- Core Engine -----------------------------------------------------------


def build_g5_analytics(
    g4_bundles: List[Dict[str, Any]],
    *,
    analysis_id: str = "analysis-default",
    generated_at_utc: Optional[str] = None,
    generator_version: str = "1.0.0",
) -> Dict[str, Any]:
    """
    Build a governed, deterministic G5 analytics bundle from N>=2 G4 bundles.
    """

    if len(g4_bundles) < 2:
        raise ValueError("G5 analytics requires at least two G4 bundles.")

    # Sort for determinism.
    g4_bundles = sorted(g4_bundles, key=lambda b: str(b["identity"]["tutorialId"]))

    minis = [_extract_g4_mini(b) for b in g4_bundles]

    centroid = Centroid(
        clarityScore=_bounded_metric(_mean(m.clarityScore for m in minis)),
        pacingStability=_bounded_metric(_mean(m.pacingStability for m in minis)),
        densityVariance=_bounded_metric(_mean(m.densityVariance for m in minis)),
        captionLoadIndex=_bounded_metric(_mean(m.captionLoadIndex for m in minis)),
    )

    clarity_mean = _mean(m.clarityScore for m in minis)
    clarity_sd = _round(statistics.pstdev(m.clarityScore for m in minis))

    caption_mean = _mean(m.captionLoadIndex for m in minis)
    caption_sd = _round(statistics.pstdev(m.captionLoadIndex for m in minis))

    motion_mean = _mean(m.avgMotionLoad for m in minis)
    motion_sd = _round(statistics.pstdev(m.avgMotionLoad for m in minis))

    distances = {m.tutorialId: _euclid(m, centroid) for m in minis}
    rank_map = {
        tid: rank
        for rank, tid in enumerate(
            [m.tutorialId for m in sorted(minis, key=lambda mini: distances[mini.tutorialId])]
        )
    }

    comparisons = []
    for m in minis:
        comparisons.append(
            {
                "tutorialId": m.tutorialId,
                "distanceFromCentroid": distances[m.tutorialId],
                "rankIndex": rank_map[m.tutorialId],
                "zScores": {
                    "clarityScore": _zscore(m.clarityScore, clarity_mean, clarity_sd),
                    "captionLoadIndex": _zscore(m.captionLoadIndex, caption_mean, caption_sd),
                    "avgMotionLoad": _zscore(m.avgMotionLoad, motion_mean, motion_sd),
                },
                "flags": [
                    code
                    for code, cond in {
                        "CLARITY_LOW": m.clarityScore < 0.45,
                        "CAPTIONS_HEAVY": m.captionLoadIndex > 0.8,
                        "MOTION_HIGH": m.avgMotionLoad > 0.75,
                    }.items()
                    if cond
                ],
            }
        )

    centroids = _seed_centroids(minis)
    clusters = {i: [] for i in range(3)}

    for _ in range(5):
        for k in clusters:
            clusters[k] = []
        for mini in minis:
            dists = [_euclid(mini, c) for c in centroids]
            k = dists.index(min(dists))
            clusters[k].append(mini)
        for k, members in clusters.items():
            if not members:
                continue
            centroids[k] = Centroid(
                clarityScore=_bounded_metric(_mean(m.clarityScore for m in members)),
                pacingStability=_bounded_metric(_mean(m.pacingStability for m in members)),
                densityVariance=_bounded_metric(_mean(m.densityVariance for m in members)),
                captionLoadIndex=_bounded_metric(_mean(m.captionLoadIndex for m in members)),
            )

    cluster_out = [
        {
            "clusterId": f"C{k}",
            "members": [m.tutorialId for m in clusters[k]],
            "centroidClarity": centroids[k].clarityScore,
        }
        for k in range(3)
    ]

    count = len(minis)
    third = max(1, count // 3)
    early = minis[:third]
    late = minis[-third:]

    drift = {
        "clarityDrift": _round(_mean(m.clarityScore for m in late) - _mean(m.clarityScore for m in early)),
        "captionLoadDrift": _round(_mean(m.captionLoadIndex for m in late) - _mean(m.captionLoadIndex for m in early)),
        "motionLoadDrift": _round(_mean(m.avgMotionLoad for m in late) - _mean(m.avgMotionLoad for m in early)),
        "tutorialsImpacted": [m.tutorialId for m in late],
    }

    recommendations = []
    if drift["clarityDrift"] < -0.05:
        recommendations.append(
            {
                "code": "CLARITY_DOWNWARD_TREND",
                "severity": "warn",
                "message": "Clarity is trending downward across recent tutorials. Consider reviewing scripting guidelines.",
            }
        )

    if drift["captionLoadDrift"] > 0.05:
        recommendations.append(
            {
                "code": "CAPTION_DENSITY_INCREASING",
                "severity": "warn",
                "message": "Caption load is increasing; consider rebalancing narration pacing or subtitle segmentation.",
            }
        )

    if drift["motionLoadDrift"] > 0.05:
        recommendations.append(
            {
                "code": "MOTION_INTENSITY_UPWARD",
                "severity": "info",
                "message": "Motion intensity trending upward; ensure animation decisions remain intentional.",
            }
        )

    bundle = {
        "contract": {
            "name": "g5_cross_tutorial_analytics_contract",
            "version": "1.0.0",
        },
        "identity": {
            "analysisId": analysis_id,
            "generatedAtUtc": generated_at_utc
            or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "generatorVersion": generator_version,
        },
        "input": {
            "tutorialIds": [m.tutorialId for m in minis],
            "g4Versions": [b.get("contract", {}).get("version", "") for b in g4_bundles],
            "count": count,
        },
        "aggregateMetrics": {
            "clarityCentroid": asdict(centroid),
            "motionLoadMean": motion_mean,
            "captionLoadMean": caption_mean,
        },
        "tutorialComparisons": comparisons,
        "clusters": cluster_out,
        "drift": drift,
        "recommendations": recommendations,
        "metadata": {"notes": "Deterministic cross-tutorial analytics generated by GENESIS-G5."},
    }

    return bundle
