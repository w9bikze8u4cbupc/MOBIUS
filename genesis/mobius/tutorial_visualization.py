from __future__ import annotations

from dataclasses import dataclass
from math import tau
from typing import Any, Dict, Iterable, List


TIMELINE_SAMPLING_HZ: int = 30


@dataclass
class TimelineSample:
    t_start_sec: float
    t_end_sec: float
    scene_index: int
    scene_kind: str
    wpm: float
    cps: float
    motion_load: float
    audio_stability: float
    clarity_score: float


@dataclass
class GlobalMetrics:
    duration_sec: float
    avg_wpm: float
    avg_cps: float
    avg_motion_load: float
    avg_clarity_score: float
    density_variance: float
    pacing_stability: float
    caption_load_index: float


@dataclass
class PacingWavePoint:
    angle: float
    radius: float
    amplitude: float


@dataclass
class DensitySegment:
    angle_start: float
    angle_end: float
    radius_inner: float
    radius_outer: float
    density_score: float


@dataclass
class VisualLoadArc:
    angle_start: float
    angle_end: float
    radius: float
    load: float


@dataclass
class CaptionBlock:
    angle_start: float
    angle_end: float
    radius_inner: float
    radius_outer: float
    cps: float
    lines: int


@dataclass
class ClarityPoint:
    angle: float
    radius: float
    clarity_score: float


@dataclass
class TutorialVisualization:
    contract_name: str
    contract_version: str
    tutorial_id: str
    mobius_export_version: str
    genesis_ingest_version: str
    g2_quality_contract_version: str
    seq_index: int
    timeline: List[TimelineSample]
    global_metrics: GlobalMetrics
    pacing_wave: List[PacingWavePoint]
    density_band: List[DensitySegment]
    visual_load_ring: List[VisualLoadArc]
    caption_band: List[CaptionBlock]
    clarity_thread: List[ClarityPoint]
    metadata: Dict[str, Any]


def _safe_div(n: float, d: float, default: float = 0.0) -> float:
    return n / d if d != 0 else default


def _compute_global_metrics(timeline: Iterable[TimelineSample]) -> GlobalMetrics:
    samples = list(timeline)
    if not samples:
        return GlobalMetrics(
            duration_sec=0.0,
            avg_wpm=0.0,
            avg_cps=0.0,
            avg_motion_load=0.0,
            avg_clarity_score=0.0,
            density_variance=0.0,
            pacing_stability=0.0,
            caption_load_index=0.0,
        )

    duration = samples[-1].t_end_sec - samples[0].t_start_sec
    n = float(len(samples))

    avg_wpm = _safe_div(sum(s.wpm for s in samples), n)
    avg_cps = _safe_div(sum(s.cps for s in samples), n)
    avg_motion = _safe_div(sum(s.motion_load for s in samples), n)
    avg_clarity = _safe_div(sum(s.clarity_score for s in samples), n)

    density_values = [s.motion_load + s.cps * 0.02 for s in samples]
    density_mean = _safe_div(sum(density_values), n)
    density_var = _safe_div(sum((d - density_mean) ** 2 for d in density_values), n)

    pacing_values = [s.wpm for s in samples]
    pacing_mean = avg_wpm
    pacing_var = _safe_div(sum((p - pacing_mean) ** 2 for p in pacing_values), n)

    caption_load_index = _safe_div(sum(s.cps for s in samples), max(1.0, duration))

    return GlobalMetrics(
        duration_sec=max(0.0, duration),
        avg_wpm=avg_wpm,
        avg_cps=avg_cps,
        avg_motion_load=avg_motion,
        avg_clarity_score=avg_clarity,
        density_variance=density_var,
        pacing_stability=pacing_var,
        caption_load_index=caption_load_index,
    )


def _map_index_to_angle(idx: int, total: int) -> float:
    if total <= 1:
        return 0.0
    return (idx / float(total)) * tau


def _build_pacing_wave(timeline: List[TimelineSample], target_wpm: float) -> List[PacingWavePoint]:
    points: List[PacingWavePoint] = []
    total = len(timeline)
    if total == 0:
        return points

    for i, sample in enumerate(timeline):
        angle = _map_index_to_angle(i, total)
        radius = 0.28 + (0.55 - 0.28) * (i / max(1, total - 1))
        amplitude = sample.wpm - target_wpm
        points.append(PacingWavePoint(angle=angle, radius=radius, amplitude=amplitude))
    return points


def _build_density_band(timeline: List[TimelineSample]) -> List[DensitySegment]:
    segments: List[DensitySegment] = []
    total = len(timeline)
    if total == 0:
        return segments

    for i, sample in enumerate(timeline):
        angle_start = _map_index_to_angle(i, total)
        angle_end = _map_index_to_angle(i + 1, total)
        radius_inner = 0.50
        radius_outer = 0.75
        density_score = sample.motion_load + sample.cps * 0.02
        segments.append(
            DensitySegment(
                angle_start=angle_start,
                angle_end=angle_end,
                radius_inner=radius_inner,
                radius_outer=radius_outer,
                density_score=density_score,
            )
        )
    return segments


def _build_visual_load_ring(timeline: List[TimelineSample]) -> List[VisualLoadArc]:
    arcs: List[VisualLoadArc] = []
    total = len(timeline)
    if total == 0:
        return arcs

    for i, sample in enumerate(timeline):
        angle_start = _map_index_to_angle(i, total)
        angle_end = _map_index_to_angle(i + 1, total)
        radius = 0.85
        load = max(0.0, min(1.0, sample.motion_load))
        arcs.append(
            VisualLoadArc(
                angle_start=angle_start,
                angle_end=angle_end,
                radius=radius,
                load=load,
            )
        )
    return arcs


def _build_caption_band(timeline: List[TimelineSample]) -> List[CaptionBlock]:
    blocks: List[CaptionBlock] = []
    total = len(timeline)
    if total == 0:
        return blocks

    for i, sample in enumerate(timeline):
        angle_start = _map_index_to_angle(i, total)
        angle_end = _map_index_to_angle(i + 1, total)
        radius_inner = 0.30
        radius_outer = 0.45
        cps = sample.cps
        if cps <= 0:
            lines = 0
        elif cps <= 17:
            lines = 1
        else:
            lines = 2
        blocks.append(
            CaptionBlock(
                angle_start=angle_start,
                angle_end=angle_end,
                radius_inner=radius_inner,
                radius_outer=radius_outer,
                cps=cps,
                lines=lines,
            )
        )
    return blocks


def _build_clarity_thread(timeline: List[TimelineSample]) -> List[ClarityPoint]:
    points: List[ClarityPoint] = []
    total = len(timeline)
    if total == 0:
        return points

    for i, sample in enumerate(timeline):
        angle = _map_index_to_angle(i, total)
        radius = 0.65
        score = max(0.0, min(1.0, sample.clarity_score))
        points.append(ClarityPoint(angle=angle, radius=radius, clarity_score=score))
    return points


def _timeline_sample_to_dict(sample: TimelineSample) -> Dict[str, Any]:
    return {
        "tStartSec": sample.t_start_sec,
        "tEndSec": sample.t_end_sec,
        "sceneIndex": sample.scene_index,
        "sceneKind": sample.scene_kind,
        "wpm": sample.wpm,
        "cps": sample.cps,
        "motionLoad": sample.motion_load,
        "audioStability": sample.audio_stability,
        "clarityScore": sample.clarity_score,
    }


def _global_metrics_to_dict(metrics: GlobalMetrics) -> Dict[str, Any]:
    return {
        "durationSec": metrics.duration_sec,
        "avgWpm": metrics.avg_wpm,
        "avgCps": metrics.avg_cps,
        "avgMotionLoad": metrics.avg_motion_load,
        "avgClarityScore": metrics.avg_clarity_score,
        "densityVariance": metrics.density_variance,
        "pacingStability": metrics.pacing_stability,
        "captionLoadIndex": metrics.caption_load_index,
    }


def _pacing_wave_to_dict(points: List[PacingWavePoint]) -> List[Dict[str, Any]]:
    return [
        {
            "angle": point.angle,
            "radius": point.radius,
            "amplitude": point.amplitude,
        }
        for point in points
    ]


def _density_band_to_dict(segments: List[DensitySegment]) -> List[Dict[str, Any]]:
    return [
        {
            "angleStart": segment.angle_start,
            "angleEnd": segment.angle_end,
            "radiusInner": segment.radius_inner,
            "radiusOuter": segment.radius_outer,
            "densityScore": segment.density_score,
        }
        for segment in segments
    ]


def _visual_load_ring_to_dict(arcs: List[VisualLoadArc]) -> List[Dict[str, Any]]:
    return [
        {
            "angleStart": arc.angle_start,
            "angleEnd": arc.angle_end,
            "radius": arc.radius,
            "load": arc.load,
        }
        for arc in arcs
    ]


def _caption_band_to_dict(blocks: List[CaptionBlock]) -> List[Dict[str, Any]]:
    return [
        {
            "angleStart": block.angle_start,
            "angleEnd": block.angle_end,
            "radiusInner": block.radius_inner,
            "radiusOuter": block.radius_outer,
            "cps": block.cps,
            "lines": block.lines,
        }
        for block in blocks
    ]


def _clarity_thread_to_dict(points: List[ClarityPoint]) -> List[Dict[str, Any]]:
    return [
        {
            "angle": point.angle,
            "radius": point.radius,
            "clarityScore": point.clarity_score,
        }
        for point in points
    ]


def build_tutorial_visualization(
    *,
    tutorial_id: str,
    mobius_export_version: str,
    genesis_ingest_version: str,
    g2_quality_contract_version: str,
    seq_index: int,
    timeline_samples: List[TimelineSample],
    metadata: Dict[str, Any] | None = None,
    contract_name: str = "g3_tutorial_visualization_contract",
    contract_version: str = "1.0.0",
    target_wpm: float = 160.0,
) -> Dict[str, Any]:
    """
    Build a deterministic visualization bundle that conforms to the
    G3 visualization contract. This is the main entry point for GENESIS.
    """
    if metadata is None:
        metadata = {}

    timeline_sorted = sorted(timeline_samples, key=lambda s: (s.t_start_sec, s.scene_index))

    global_metrics = _compute_global_metrics(timeline_sorted)
    pacing_wave = _build_pacing_wave(timeline_sorted, target_wpm=target_wpm)
    density_band = _build_density_band(timeline_sorted)
    visual_load_ring = _build_visual_load_ring(timeline_sorted)
    caption_band = _build_caption_band(timeline_sorted)
    clarity_thread = _build_clarity_thread(timeline_sorted)

    viz = TutorialVisualization(
        contract_name=contract_name,
        contract_version=contract_version,
        tutorial_id=tutorial_id,
        mobius_export_version=mobius_export_version,
        genesis_ingest_version=genesis_ingest_version,
        g2_quality_contract_version=g2_quality_contract_version,
        seq_index=seq_index,
        timeline=timeline_sorted,
        global_metrics=global_metrics,
        pacing_wave=pacing_wave,
        density_band=density_band,
        visual_load_ring=visual_load_ring,
        caption_band=caption_band,
        clarity_thread=clarity_thread,
        metadata=metadata,
    )

    return {
        "contract": {
            "name": viz.contract_name,
            "version": viz.contract_version,
        },
        "identity": {
            "tutorialId": viz.tutorial_id,
            "mobiusExportVersion": viz.mobius_export_version,
            "genesisIngestVersion": viz.genesis_ingest_version,
            "g2QualityContractVersion": viz.g2_quality_contract_version,
            "seqIndex": viz.seq_index,
        },
        "timeline": [_timeline_sample_to_dict(sample) for sample in viz.timeline],
        "globalMetrics": _global_metrics_to_dict(viz.global_metrics),
        "overlays": {
            "pacingWave": {
                "targetWpm": target_wpm,
                "points": _pacing_wave_to_dict(viz.pacing_wave),
            },
            "densityBand": {
                "segments": _density_band_to_dict(viz.density_band),
            },
            "visualLoadRing": {
                "arcs": _visual_load_ring_to_dict(viz.visual_load_ring),
            },
            "captionBand": {
                "blocks": _caption_band_to_dict(viz.caption_band),
            },
            "clarityThread": {
                "points": _clarity_thread_to_dict(viz.clarity_thread),
            },
        },
        "metadata": viz.metadata,
    }
