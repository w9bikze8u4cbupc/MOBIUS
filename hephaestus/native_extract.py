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
from typing import Any, Dict, List

import fitz  # PyMuPDF
from PIL import Image, ImageStat

THUMBNAIL_SIZE = (360, 360)


def _round_values(values) -> List[float]:
    return [round(float(value), 6) for value in values]


def collect_native_image_lineage(pdf_path: str) -> Dict[str, Any]:
    """Map every placed PDF raster back to its native object and transform.

    A high-DPI page render is only a sampling of the PDF page.  It must not be
    treated as newly created source detail when a region is backed by a small
    embedded raster.  This report gives downstream visual QA enough evidence
    to follow a page crop through its PDF placement to the true native pixels.
    """
    pdf = Path(pdf_path)
    document = fitz.open(pdf)
    try:
        pages = []
        by_xref: Dict[str, Any] = {}
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            occurrences = []
            for info in page.get_image_info(xrefs=True):
                xref = int(info.get("xref") or 0)
                # xref=0 entries are inline/mask renderings that cannot be
                # attributed to a stable native object. Keep them as explicit
                # unresolved raster evidence; never invent native dimensions.
                occurrence = {
                    "pageIndex": page_index,
                    "pageNumber": page_index + 1,
                    "xref": xref or None,
                    "bboxPoints": _round_values(info.get("bbox") or []),
                    "placementMatrix": _round_values(info.get("transform") or []),
                    "nativeWidthPx": int(info.get("width") or 0) if xref else None,
                    "nativeHeightPx": int(info.get("height") or 0) if xref else None,
                    "colorspace": info.get("cs-name"),
                    "bitsPerComponent": info.get("bpc"),
                    "hasMask": bool(info.get("has-mask")),
                    "stableNativeObject": bool(xref),
                }
                occurrences.append(occurrence)
                if xref:
                    key = str(xref)
                    record = by_xref.setdefault(key, {
                        "xref": xref,
                        "nativeWidthPx": int(info.get("width") or 0),
                        "nativeHeightPx": int(info.get("height") or 0),
                        "colorspace": info.get("cs-name"),
                        "bitsPerComponent": info.get("bpc"),
                        "hasMask": bool(info.get("has-mask")),
                        "occurrences": [],
                    })
                    record["occurrences"].append({
                        "pageNumber": page_index + 1,
                        "bboxPoints": occurrence["bboxPoints"],
                        "placementMatrix": occurrence["placementMatrix"],
                    })
            pages.append({
                "pageIndex": page_index,
                "pageNumber": page_index + 1,
                "pageBoundsPoints": _round_values(page.rect),
                "rasterOccurrenceCount": len(occurrences),
                "rasterOccurrences": occurrences,
            })
        return {
            "contract": "mobius-pdf-native-image-lineage-v1",
            "pdfPath": str(pdf),
            "pageCount": document.page_count,
            "pages": pages,
            "nativeObjects": list(by_xref.values()),
        }
    finally:
        document.close()


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
    # Some PDF background layers are very pale but not pure white; their faint
    # tint keeps the bright-pixel ratio low even though they are unusable in a video.
    # Low global contrast plus low edge density is sufficient to suppress that class
    # while preserving real cards and diagrams with meaningful outlines.
    near_blank = (bright_ratio >= 0.94 and contrast <= 0.055 and edge_density <= 0.018) or (contrast <= 0.05 and edge_density <= 0.008)
    return {
        "brightPixelRatio": round(bright_ratio, 4),
        "contrast": round(contrast, 4),
        "edgeDensity": round(edge_density, 4),
        "nearBlank": near_blank,
    }


def pixmap_to_image(pixmap: fitz.Pixmap) -> Image.Image:
    """Return an independent RGB/RGBA Pillow image without resizing."""
    normalized = pixmap
    if normalized.alpha:
        normalized = fitz.Pixmap(normalized, 0)
    if normalized.colorspace is None or normalized.colorspace.n != 3:
        normalized = fitz.Pixmap(fitz.csRGB, normalized)

    with Image.open(io.BytesIO(normalized.tobytes("png"))) as opened:
        return opened.convert("RGB").copy()


def iter_unique_image_refs(document):
    """Yield the first page occurrence of each embedded PDF image XRef.

    PDFs commonly reuse a large background or mask XRef on every page.  The
    pixels are identical, so extracting and upscaling each occurrence wastes
    disk and memory and can make a real rulebook impossible to process.
    Keeping the first page preserves provenance while avoiding duplicate work.
    """
    seen_xrefs = set()
    for page_index in range(document.page_count):
        page = document.load_page(page_index)
        for image_index, image_info in enumerate(page.get_images(full=True)):
            xref = int(image_info[0])
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)
            yield page_index, image_index, xref


def native_bytes(document, xref: int, pixmap: fitz.Pixmap):
    """Return the embedded bytes when PyMuPDF can preserve the native format.

    JPEG/DCT and PNG objects remain byte-faithful masters. Other image types are
    normalized to PNG at their native pixel dimensions; no master is enlarged.
    """
    extracted = document.extract_image(xref) or {}
    ext = str(extracted.get("ext") or "").lower()
    image = extracted.get("image")
    if image and ext in {"jpg", "jpeg", "png"}:
        return bytes(image), ("jpg" if ext == "jpeg" else ext)
    with io.BytesIO() as output:
        pixmap_to_image(pixmap).save(output, format="PNG")
        return output.getvalue(), "png"


def extract_all_native_images(pdf_path: str, output_dir: str) -> Dict[str, Any]:
    """Extract every native raster image at its original pixel dimensions."""
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

        for page_index, image_index, xref in iter_unique_image_refs(document):
                asset_id = f"p{page_index}_img{image_index}_xref{xref}"

                try:
                    pixmap = fitz.Pixmap(document, xref)
                    original_width, original_height = pixmap.width, pixmap.height
                    image_type = detect_image_type(original_width, original_height)
                    native_buffer, native_ext = native_bytes(document, xref, pixmap)
                    file_name = f"component_{asset_id}.{native_ext}"
                    image_path = images_dir / file_name
                    thumbnail_path = thumbnails_dir / file_name
                    image_path.write_bytes(native_buffer)

                    with Image.open(io.BytesIO(native_buffer)) as opened:
                        native_image = opened.convert("RGB").copy()
                    thumbnail = native_image.copy()
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
                        "native_master": True,
                        "upscale_factor": 1,
                        "derivative": False,
                        "original_dimensions": {
                            "width": original_width,
                            "height": original_height,
                        },
                        "dimensions": {
                            "width": original_width,
                            "height": original_height,
                        },
                        "visual_metrics": visual_information_metrics(native_image),
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
            "native_master": True,
            "upscale_factor": 1,
            "extraction_errors": extraction_errors,
        }
        manifest_path = destination / "manifest.json"
        manifest_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        result["manifest_path"] = str(manifest_path)
        print(
            f"[HEPHAESTUS] Extracted {len(result['images'])} native masters without resizing",
            file=sys.stderr,
        )
    except Exception as error:
        result["error"] = str(error)
        print(f"[HEPHAESTUS] Native extraction failed: {error}", file=sys.stderr)
    finally:
        if document is not None:
            document.close()

    return result
