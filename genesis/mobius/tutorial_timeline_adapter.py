from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from .tutorial_visualization import TimelineSample


class SceneLike(Protocol):
    """Minimal interface we require from GenesisMobiusSnapshot.scene entries."""

    index: int  # stable scene index
    kind: str  # "intro" | "setup" | "gameplay" | "scoring" | "end" | etc.
    start_sec: float  # absolute start time in seconds
    end_sec: float  # absolute end time in seconds


class QualitySampleLike(Protocol):
    """Minimal interface from GenesisMobiusQualitySnapshot timeline entries."""

    t_start_sec: float
    t_end_sec: float
    wpm: float
    cps: float
    motion_load: float
    audio_stability: float
    clarity_score: float


@dataclass
class GenesisMobiusSnapshotLike:
    """
    Narrow view of GenesisMobiusSnapshot for G3. If you already have
    GenesisMobiusSnapshot defined, you can treat this as documentation of the
    fields we expect and adjust types accordingly.
    """

    tutorial_id: str
    mobius_export_version: str
    ingest_version: str
    scenes: List[SceneLike]


@dataclass
class GenesisMobiusQualitySnapshotLike:
    """
    Narrow view of GenesisMobiusQualitySnapshot for G3. Again, adapt if you
    already have a concrete class.
    """

    contract_version: str
    timeline: List[QualitySampleLike]


def _find_scene_for_time(scenes: Iterable[SceneLike], t_sec: float) -> SceneLike | None:
    for scene in scenes:
        if scene.start_sec <= t_sec < scene.end_sec:
            return scene
    return None


def build_timeline_from_snapshots(
    genesis_snapshot: GenesisMobiusSnapshotLike,
    quality_snapshot: GenesisMobiusQualitySnapshotLike,
) -> List["TimelineSample"]:
    """
    Deterministically construct TimelineSample[] from G1 + G2 snapshots.

    Strategy:
      - Use the G2 quality timeline as the primary temporal backbone.
      - For each quality sample, attach scene index/kind from G1 scenes.
      - Do not resample here; assume G2 timeline is already at desired cadence.
    """

    # Local import to avoid circular dependency at module load time.
    from .tutorial_visualization import TimelineSample

    scenes = list(genesis_snapshot.scenes)
    q_samples = list(quality_snapshot.timeline)

    timeline: List[TimelineSample] = []
    for q in q_samples:
        scene = _find_scene_for_time(scenes, q.t_start_sec)
        if scene is None:
            # If quality sample falls outside any defined scene, mark as "unknown".
            scene_index = -1
            scene_kind = "unknown"
        else:
            scene_index = getattr(scene, "index", -1)
            scene_kind = getattr(scene, "kind", "unknown")

        timeline.append(
            TimelineSample(
                t_start_sec=float(q.t_start_sec),
                t_end_sec=float(q.t_end_sec),
                scene_index=int(scene_index),
                scene_kind=str(scene_kind),
                wpm=float(q.wpm),
                cps=float(q.cps),
                motion_load=float(q.motion_load),
                audio_stability=float(q.audio_stability),
                clarity_score=float(q.clarity_score),
            )
        )

    # Sort once more for determinism
    timeline.sort(key=lambda s: (s.t_start_sec, s.scene_index))
    return timeline
