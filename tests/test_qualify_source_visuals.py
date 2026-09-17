import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "qualify-source-visuals.py"
SPEC = importlib.util.spec_from_file_location("qualify_source_visuals", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_vision_probe_bounds_large_source_raster(tmp_path):
    source = tmp_path / "large.png"
    Image.new("RGB", (3200, 2400), (20, 120, 80)).save(source)

    data_url = MODULE.image_data_url(source)

    assert data_url.startswith("data:image/jpeg;base64,")
    encoded = data_url.split(",", 1)[1]
    assert len(encoded) < 250_000


def test_component_binding_metadata_reaches_object_matcher_as_hypothesis_only():
    metadata = MODULE.asset_metadata({
        "component_bindings": [{"componentId": "comp-card", "confidence": 0.41, "reviewState": "needs_review"}],
        "semanticObjects": ["Criminal card"],
        "referentAliases": ["card"],
        "label": "Native card",
        "category": "card",
        "sourceAuthority": "OFFICIAL_PUBLISHER_HIGH_RES",
    })

    assert metadata["component_bindings"][0]["componentId"] == "comp-card"
    assert metadata["semanticObjects"] == ["Criminal card"]
    assert metadata["referentAliases"] == ["card"]
    assert metadata["sourceAuthority"] == "OFFICIAL_PUBLISHER_HIGH_RES"
    # The local screening object only transports a hypothesis.  It does not
    # synthesize an object-pixel verdict or an accepted visual asset.
    assert "objectVisualEvidence" not in metadata
    assert MODULE.binding_ids({"component_bindings": metadata["component_bindings"]}) == {"comp-card"}


def test_textured_large_native_background_is_rejected_before_provider_spend():
    verdict = MODULE.local_judgement({
        "dimensions": {"width": 861, "height": 672},
        "visual_metrics": {"nearBlank": False, "contrast": 0.0168, "edgeDensity": 0.008},
    })

    assert verdict["category"] == "blank_or_unusable"
    assert verdict["reason"] == "local-quality-rejected: low-information raster"


def test_real_detail_is_not_rejected_by_low_information_guard():
    verdict = MODULE.local_judgement({
        "dimensions": {"width": 861, "height": 672},
        "visual_metrics": {"nearBlank": False, "contrast": 0.021, "edgeDensity": 0.011},
    })

    assert verdict["category"] == "uncertain"


def test_authorized_external_candidate_reaches_local_screening_without_a_fake_page(tmp_path):
    image = tmp_path / "character.png"
    Image.new("RGB", (640, 960), (80, 90, 100)).save(image)
    script = tmp_path / "script.json"
    manifest = tmp_path / "manifest.json"
    output = tmp_path / "quality.json"
    script.write_text(json.dumps({"scenes": [{"source_pages": [3], "visualRequirement": {"requiredObjects": ["character"]}}]}), encoding="utf-8")
    manifest.write_text(json.dumps({"images": [{
        "id": "official-character", "file_path": str(image), "width": 640, "height": 960,
        "sourceAuthority": "OFFICIAL_PUBLISHER_HIGH_RES", "label": "Character miniature",
        "component_bindings": [{"componentId": "character", "reviewState": "hypothesis"}],
    }]}), encoding="utf-8")

    subprocess.run([sys.executable, str(MODULE_PATH), str(script), str(manifest), str(output)], check=True, capture_output=True, text=True)
    rows = json.loads(output.read_text(encoding="utf-8"))["assets"]

    assert len(rows) == 1
    assert rows[0]["page_index"] is None
    assert rows[0]["asset_metadata"]["label"] == "Character miniature"
    assert rows[0]["asset_metadata"]["sourceAuthority"] == "OFFICIAL_PUBLISHER_HIGH_RES"
