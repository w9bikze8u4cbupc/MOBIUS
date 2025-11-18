from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis.mobius_ingest import (
    GENESIS_INGEST_CONTRACT_VERSION,
    GenesisCaptionTrackItem,
    GenesisMobiusSnapshot,
    GenesisNarrationTrackItem,
    ingest_mobius_export,
)

FIXTURE_PATH = Path("tests/fixtures/mobius_export_v1.0.0_sushi_go.json")


def _load_bundle() -> dict:
    return json.loads(FIXTURE_PATH.read_text("utf-8"))


def test_ingest_produces_snapshot_with_expected_meta():
    bundle = _load_bundle()
    snapshot = ingest_mobius_export(bundle)

    assert isinstance(snapshot, GenesisMobiusSnapshot)
    assert snapshot.genesis_ingest_contract_version == GENESIS_INGEST_CONTRACT_VERSION
    assert snapshot.meta["projectSlug"] == bundle["project"]["slug"]
    assert snapshot.meta["gameName"] == bundle["game"]["name"]
    assert snapshot.meta["mobiusExportContractVersion"] == bundle["exportContractVersion"]
    assert snapshot.metrics["sceneCount"] == len(snapshot.scenes)
    assert pytest.approx(snapshot.metrics["totalDurationSec"], rel=1e-6) == sum(
        scene.duration_sec for scene in snapshot.scenes
    )


def test_ingest_is_deterministic_and_pure_function():
    bundle = _load_bundle()
    bundle_copy = copy.deepcopy(bundle)

    snap1 = ingest_mobius_export(bundle)
    snap2 = ingest_mobius_export(bundle)
    snap3 = ingest_mobius_export(bundle_copy)

    assert snap1 == snap2 == snap3
    assert bundle == bundle_copy  # No mutation


def test_segments_and_scenes_are_id_stable():
    snapshot = ingest_mobius_export(_load_bundle())

    segment_ids = [segment.id for segment in snapshot.segments]
    assert segment_ids == ["segment-intro", "segment-setup", "segment-turn"]

    first_segment = snapshot.segments[0]
    assert first_segment.kind == "intro"
    assert first_segment.scene_ids == ["scene-001"]

    scene_ids = [scene.id for scene in snapshot.scenes]
    assert scene_ids == ["scene-001", "scene-002", "scene-003"]
    assert [scene.segment_id for scene in snapshot.scenes] == segment_ids


def test_tracks_are_aligned_with_scenes():
    snapshot = ingest_mobius_export(_load_bundle())

    narration: list[GenesisNarrationTrackItem] = snapshot.tracks.narration
    caption: list[GenesisCaptionTrackItem] = snapshot.tracks.captions

    assert [item.scene_id for item in narration] == ["scene-001", "scene-002", "scene-003"]
    assert narration[2].start_sec == pytest.approx(0.5)
    assert narration[2].end_sec == pytest.approx(15.0)

    caption_counts = {(item.scene_id, item.language): item.item_count for item in caption}
    assert caption_counts[("scene-001", "en")] == 1
    assert caption_counts[("scene-001", "es")] == 1
    assert caption_counts[("scene-002", "en")] == 1
    assert caption_counts[("scene-003", "en")] == 1
    assert caption_counts[("scene-003", "es")] == 1


def test_motion_metrics_cover_all_scenes():
    snapshot = ingest_mobius_export(_load_bundle())
    per_scene = snapshot.metrics["motionDensity"]["perScene"]
    per_scene_map = {item["sceneId"]: item["motionCount"] for item in per_scene}

    assert per_scene_map == {
        "scene-001": 3,
        "scene-002": 5,
        "scene-003": 2,
    }


def test_version_mismatch_is_rejected():
    bundle = _load_bundle()
    bundle["exportContractVersion"] = "2.0.0"

    with pytest.raises(ValueError):
        ingest_mobius_export(bundle)
