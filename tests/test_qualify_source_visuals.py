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
