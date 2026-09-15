import importlib.util
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
