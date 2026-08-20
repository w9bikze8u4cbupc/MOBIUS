"""Native PDF image extraction for the HEPHAESTUS API.

This module intentionally preserves every embedded raster image exposed by
PyMuPDF. It does not apply component heuristics, background rejection, or
perceptual deduplication before returning the extracted asset list.
"""

import io
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict

import fitz  # PyMuPDF
from PIL import Image, ImageStat

UPSCALE_FACTOR = 3
THUMBNAIL_SIZE = (360, 360)


def detect_image_type(width: int, height: int) -> str:
    """Classify an embedded image into the UI's stable type vocabulary."""
    if width <= 0 or height <= 0:
        return "other"

    aspect = width / height
    area = width * height

    if area >= 1_000_000 or width >= 1_200 or height >= 1_200:
        return "board"
    if (0.55 <= aspect <= 0.80 or 1.25 <= aspect <= 1.80) and min(width, height) >= 40:
        return "card"
    if 0.75 <= aspect <= 1.33 and max(width, height) <= 600:
        return "token"
    return "other"


def visual_information_metrics(image: Image.Image) -> Dict[str, Any]:
    """Measure only obvious near-blank native rasters for safe review suppression."""
    width, height = image.size
    if width < 100 or height < 100:
        return {}
    sample = image.convert("RGB").resize((96, 96), Image.Resampling.LANCZOS)
    pixels = list(sample.getdata())
    bright_ratio = sum(1 for red, green, blue in pixels if red >= 245 and green >= 245 and blue >= 245) / len(pixels)
    grayscale = sample.convert("L")
    contrast = ImageStat.Stat(grayscale).stddev[0] / 255.0
    values = list(grayscale.getdata())
    size = 96
    horizontal_delta = sum(abs(values[row * size + column] - values[row * size + column + 1]) for row in range(size) for column in range(size - 1))
    vertical_delta = sum(abs(values[row * size + column] - values[(row + 1) * size + column]) for row in range(size - 1) for column in range(size))
    edge_density = ((horizontal_delta / (size * (size - 1))) + (vertical_delta / ((size - 1) * size))) / (2 * 255.0)
    near_blank = bright_ratio >= 0.94 and contrast <= 0.055 and edge_density <= 0.018
    return {
        "brightPixelRatio": round(bright_ratio, 4),
        "contrast": round(contrast, 4),
        "edgeDensity": round(edge_density, 4),
        "nearBlank": near_blank,
    }


def pixmap_to_image(pixmap: fitz.Pixmap) -> Image.Image:
    """Return an independent RGB/RGBA Pillow image suitable for Lanczos processing."""
    normalized = pixmap
    if normalized.alpha:
        normalized = fitz.Pixmap(normalized, 0)
    if normalized.colorspace is None or normalized.colorspace.n != 3:
        normalized = fitz.Pixmap(fitz.csRGB, normalized)

    with Image.open(io.BytesIO(normalized.tobytes("png"))) as opened:
        return opened.convert("RGB").copy()


def extract_all_native_images(pdf_path: str, output_dir: str) -> Dict[str, Any]:
    """Extract every native raster image, upscale it 3x, and create a thumbnail."""
    pdf = Path(pdf_path)
    destination = Path(output_dir)
    images_dir = destination / "images" / "all"
    thumbnails_dir = destination / "images" / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    result: Dict[str, Any] = {
        "success": False,
        "pdf_path": str(pdf),
        "output_dir": str(destination),
        "images": [],
        "stats": {},
        "error": None,
    }

    document = None
    type_counts: Counter[str] = Counter()
    extraction_errors = 0

    try:
        document = fitz.open(pdf)
        if document.needs_pass:
            raise RuntimeError("PDF is encrypted")

        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            for image_index, image_info in enumerate(page.get_images(full=True)):
                xref = int(image_info[0])
                asset_id = f"p{page_index}_img{image_index}_xref{xref}"

                try:
                    pixmap = fitz.Pixmap(document, xref)
                    original_width, original_height = pixmap.width, pixmap.height
                    image_type = detect_image_type(original_width, original_height)

                    upscaled = pixmap_to_image(pixmap).resize(
                        (original_width * UPSCALE_FACTOR, original_height * UPSCALE_FACTOR),
                        Image.Resampling.LANCZOS,
                    )
                    file_name = f"component_{asset_id}.png"
                    image_path = images_dir / file_name
                    thumbnail_path = thumbnails_dir / file_name
                    upscaled.save(image_path, "PNG")

                    thumbnail = upscaled.copy()
                    thumbnail.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                    thumbnail.save(thumbnail_path, "PNG")

                    label = f"Native {image_type} — page {page_index + 1}, image {image_index + 1}"
                    result["images"].append({
                        "id": asset_id,
                        "file_name": file_name,
                        "file_path": str(image_path),
                        "thumbnail_path": str(thumbnail_path),
                        "page_index": page_index,
                        "native": True,
                        "type": image_type,
                        "classification": image_type,
                        "is_component": image_type in {"card", "token", "board"},
                        "confidence": 1.0,
                        "label": label,
                        "quantity": None,
                        "upscale_factor": UPSCALE_FACTOR,
                        "original_dimensions": {
                            "width": original_width,
                            "height": original_height,
                        },
                        "dimensions": {
                            "width": upscaled.width,
                            "height": upscaled.height,
                        },
                        "visual_metrics": visual_information_metrics(upscaled),
                    })
                    type_counts[image_type] += 1
                except Exception as error:
                    extraction_errors += 1
                    print(
                        f"[HEPHAESTUS] Failed to extract native image {image_index} on page {page_index}: {error}",
                        file=sys.stderr,
                    )

        result["success"] = True
        result["stats"] = {
            "total_items": len(result["images"]),
            "native_images": len(result["images"]),
            "components": sum(type_counts[kind] for kind in ("card", "token", "board")),
            "non_components": type_counts["other"],
            "cards": type_counts["card"],
            "tokens": type_counts["token"],
            "boards": type_counts["board"],
            "other": type_counts["other"],
            "upscale_factor": UPSCALE_FACTOR,
            "extraction_errors": extraction_errors,
        }
        manifest_path = destination / "manifest.json"
        manifest_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        result["manifest_path"] = str(manifest_path)
        print(
            f"[HEPHAESTUS] Extracted {len(result['images'])} native images at {UPSCALE_FACTOR}x Lanczos",
            file=sys.stderr,
        )
    except Exception as error:
        result["error"] = str(error)
        print(f"[HEPHAESTUS] Native extraction failed: {error}", file=sys.stderr)
    finally:
        if document is not None:
            document.close()

    return result
