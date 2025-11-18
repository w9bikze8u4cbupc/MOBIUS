"""Adapter for converting a MobiusExportBundle into a GenesisMobiusSnapshot."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple

GENESIS_INGEST_CONTRACT_VERSION = "1.0.0"
SUPPORTED_EXPORT_CONTRACT_VERSION = "1.0.0"

_SEGMENT_KINDS = {
    "intro",
    "components",
    "setup",
    "turn",
    "scoring",
    "end",
    "other",
}


@dataclass(frozen=True)
class GenesisSegment:
    id: str
    kind: str
    title: str
    scene_ids: List[str]


@dataclass(frozen=True)
class GenesisScene:
    id: str
    segment_id: str
    index: int
    duration_sec: float


@dataclass(frozen=True)
class GenesisNarrationTrackItem:
    scene_id: str
    start_sec: float
    end_sec: float


@dataclass(frozen=True)
class GenesisCaptionTrackItem:
    scene_id: str
    language: str
    item_count: int


@dataclass(frozen=True)
class GenesisTracks:
    narration: List[GenesisNarrationTrackItem]
    captions: List[GenesisCaptionTrackItem]


@dataclass(frozen=True)
class GenesisMobiusSnapshot:
    genesis_ingest_contract_version: str
    meta: Dict[str, Any]
    segments: List[GenesisSegment]
    scenes: List[GenesisScene]
    tracks: GenesisTracks
    metrics: Dict[str, Any]
    provenance: Dict[str, Any]


__all__ = [
    "GENESIS_INGEST_CONTRACT_VERSION",
    "GenesisSegment",
    "GenesisScene",
    "GenesisNarrationTrackItem",
    "GenesisCaptionTrackItem",
    "GenesisTracks",
    "GenesisMobiusSnapshot",
    "ingest_mobius_export",
]


def ingest_mobius_export(bundle: Dict[str, Any]) -> GenesisMobiusSnapshot:
    """Convert a MobiusExportBundle into a GenesisMobiusSnapshot."""

    export_version = bundle.get("exportContractVersion")
    if export_version != SUPPORTED_EXPORT_CONTRACT_VERSION:
        raise ValueError(
            "Unsupported export contract version: "
            f"{export_version!r} (expected {SUPPORTED_EXPORT_CONTRACT_VERSION})"
        )

    meta = _build_meta(bundle)
    segments, scenes = _build_segments_and_scenes(bundle["storyboard"]["scenes"])
    tracks = _build_tracks(bundle, scenes)
    metrics = _build_metrics(bundle, scenes)
    provenance = _build_provenance(bundle["provenance"])

    return GenesisMobiusSnapshot(
        genesis_ingest_contract_version=GENESIS_INGEST_CONTRACT_VERSION,
        meta=meta,
        segments=segments,
        scenes=scenes,
        tracks=tracks,
        metrics=metrics,
        provenance=provenance,
    )


def _build_meta(bundle: Dict[str, Any]) -> Dict[str, Any]:
    project = bundle["project"]
    game = bundle["game"]
    languages = list(project.get("languages") or [])
    if not languages:
        raise ValueError("Project.languages must contain at least one entry")

    return {
        "projectId": project["id"],
        "projectSlug": project["slug"],
        "gameName": game["name"],
        "languages": languages,
        "mobiusExportContractVersion": bundle["exportContractVersion"],
    }


def _build_segments_and_scenes(
    storyboard_scenes: Iterable[Dict[str, Any]]
) -> Tuple[List[GenesisSegment], List[GenesisScene]]:
    scenes: List[GenesisScene] = []
    segments_by_id: Dict[str, Dict[str, Any]] = {}

    for index, scene in enumerate(storyboard_scenes):
        segment_meta = scene.get("segment", {})
        segment_id = segment_meta.get("id") or scene.get("segmentId") or scene["id"]
        segment_kind = _normalize_segment_kind(segment_meta.get("kind"))
        segment_title = segment_meta.get("title") or scene.get("title") or segment_id

        scene_id = scene["id"]
        duration = float(scene.get("durationSec", 0.0))

        if segment_id not in segments_by_id:
            segments_by_id[segment_id] = {
                "id": segment_id,
                "kind": segment_kind,
                "title": segment_title,
                "scene_ids": [],
                "first_index": index,
            }
        else:
            if segments_by_id[segment_id]["kind"] == "other" and segment_kind != "other":
                segments_by_id[segment_id]["kind"] = segment_kind
            if segments_by_id[segment_id]["title"] == segment_id and segment_title != segment_id:
                segments_by_id[segment_id]["title"] = segment_title
        segments_by_id[segment_id]["scene_ids"].append(scene_id)

        scenes.append(
            GenesisScene(
                id=scene_id,
                segment_id=segment_id,
                index=index,
                duration_sec=duration,
            )
        )

    sorted_segments = sorted(
        segments_by_id.values(), key=lambda seg: seg["first_index"]
    )
    segment_objects = [
        GenesisSegment(
            id=seg["id"],
            kind=seg["kind"],
            title=seg["title"],
            scene_ids=list(seg["scene_ids"]),
        )
        for seg in sorted_segments
    ]

    return segment_objects, scenes


def _build_tracks(bundle: Dict[str, Any], scenes: List[GenesisScene]) -> GenesisTracks:
    scene_order = {scene.id: scene.index for scene in scenes}
    scene_durations = {scene.id: scene.duration_sec for scene in scenes}

    narration_items = _build_narration_track(
        scene_order, scene_durations, bundle.get("audio", {})
    )
    caption_items = _build_caption_track(scene_order, bundle.get("subtitles", {}))

    return GenesisTracks(narration=narration_items, captions=caption_items)


def _build_narration_track(
    scene_order: Dict[str, int],
    scene_durations: Dict[str, float],
    audio: Dict[str, Any],
) -> List[GenesisNarrationTrackItem]:
    timeline = audio.get("narration", {}).get("items") or []
    if timeline:
        sorted_timeline = sorted(
            (item for item in timeline if item.get("sceneId") in scene_order),
            key=lambda item: (scene_order[item["sceneId"]], float(item.get("startSec", 0.0))),
        )
    else:
        sorted_timeline = []

    narration_items: List[GenesisNarrationTrackItem] = []

    if sorted_timeline:
        for entry in sorted_timeline:
            scene_id = entry["sceneId"]
            narration_items.append(
                GenesisNarrationTrackItem(
                    scene_id=scene_id,
                    start_sec=float(entry.get("startSec", 0.0)),
                    end_sec=float(entry.get("endSec", scene_durations.get(scene_id, 0.0))),
                )
            )
    else:
        # Fallback: derive a single narration window per scene spanning its duration.
        for scene_id, index in sorted(scene_order.items(), key=lambda kv: kv[1]):
            duration = scene_durations.get(scene_id, 0.0)
            narration_items.append(
                GenesisNarrationTrackItem(
                    scene_id=scene_id,
                    start_sec=0.0,
                    end_sec=duration,
                )
            )

    return narration_items


def _build_caption_track(
    scene_order: Dict[str, int], subtitles: Dict[str, Any]
) -> List[GenesisCaptionTrackItem]:
    caption_counts: Dict[Tuple[str, str], int] = {}

    for track in subtitles.get("tracks", []):
        language = track.get("language")
        if not language:
            continue
        for item in track.get("items", []):
            scene_id = item.get("sceneId")
            if scene_id not in scene_order:
                continue
            key = (scene_id, language)
            caption_counts[key] = caption_counts.get(key, 0) + 1

    sorted_counts = sorted(
        caption_counts.items(), key=lambda kv: (scene_order[kv[0][0]], kv[0][1])
    )

    return [
        GenesisCaptionTrackItem(scene_id=scene_id, language=lang, item_count=count)
        for (scene_id, lang), count in sorted_counts
    ]


def _build_metrics(bundle: Dict[str, Any], scenes: List[GenesisScene]) -> Dict[str, Any]:
    total_duration = sum(scene.duration_sec for scene in scenes)
    motion_section = bundle.get("motion", {})
    motion_map = {
        entry.get("sceneId"): int(entry.get("motionCount", 0))
        for entry in motion_section.get("motions", [])
        if entry.get("sceneId")
    }
    per_scene = [
        {"sceneId": scene.id, "motionCount": motion_map.get(scene.id, 0)}
        for scene in scenes
    ]

    audio_mix = bundle.get("audio", {}).get("mix", {})

    return {
        "totalDurationSec": total_duration,
        "sceneCount": len(scenes),
        "motionDensity": {"perScene": per_scene},
        "audio": {
            "lufsIntegrated": float(audio_mix.get("lufsIntegrated", 0.0)),
            "truePeakDbtp": float(audio_mix.get("truePeakDbtp", 0.0)),
        },
    }


def _build_provenance(provenance: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "mobiusCommit": provenance["mobiusCommit"],
        "branch": provenance["branch"],
        "generatedAt": provenance["generatedAt"],
        "mobiusContracts": dict(provenance.get("contracts", {})),
    }


def _normalize_segment_kind(kind: Any) -> str:
    kind_str = str(kind).lower() if kind is not None else ""
    if kind_str in _SEGMENT_KINDS:
        return kind_str
    return "other"
