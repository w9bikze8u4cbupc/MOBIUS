from dataclasses import dataclass
from pathlib import Path


@dataclass
class Settings:
    output_dir: Path = Path("output")
    min_image_width: int = 50
    min_image_height: int = 50