from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence, Optional

import fitz  # type: ignore[import]

from .ingestion import PdfDocument
from .colorspace import normalize_pdf_image, NormalizedImageResult, ExtractionHealthMetrics, calculate_health_metrics, validate_extraction_health, write_extraction_log
from ..text.spatial import BBox
from ..logging import get_logger

logger = get_logger(__name__)

ImageSourceType = Literal["embedded"]


@dataclass
class ExtractedImage:
    id: str
    page_index: int
    source_type: ImageSourceType
    width: int
    height: int
    pixmap: fitz.Pixmap
    bbox: Optional[BBox] = None  # Image placement on page


def extract_embedded_images(
    pdf: PdfDocument,
    min_width: int = 16,
    min_height: int = 16,
    min_area: int = 400,
) -> list[ExtractedImage]:
    """Extract embedded raster images from PDF pages with dimensional filtering.
    
    Uses relaxed thresholds to capture small components like tokens and coins:
    - min_width/min_height: 16px (down from 50px)
    - min_area: 400px² (20x20 equivalent) to filter tiny artifacts
    """
    images: list[ExtractedImage] = []
    total_found = 0
    
    logger.info(f"Processing {pdf.page_count} pages for embedded images (min: {min_width}x{min_height}, area>{min_area})")
    
    for page in pdf.pages():
        raw_page = page.as_pymupdf_page()
        img_refs = raw_page.get_images(full=True)
        page_found = len(img_refs)
        total_found += page_found
        
        logger.debug(f"Page {page.index}: found {page_found} embedded images")
        
        for local_idx, img in enumerate(img_refs):
            xref = img[0]
            try:
                pix = fitz.Pixmap(pdf._doc, xref)  # type: ignore[attr-defined]
                width, height = pix.width, pix.height
                area = width * height
                
                if width < min_width or height < min_height:
                    logger.debug(
                        f"Page {page.index}, image {local_idx}: "
                        f"filtered out ({width}x{height} < {min_width}x{min_height})"
                    )
                    pix = None  # Release memory
                    continue
                
                if area < min_area:
                    logger.debug(
                        f"Page {page.index}, image {local_idx}: "
                        f"filtered out (area {area} < {min_area})"
                    )
                    pix = None
                    continue
                
                # Try to get image placement bounding box
                img_bbox = _get_image_bbox(raw_page, xref)
                
                img_id = f"p{page.index}_img{local_idx}"
                images.append(
                    ExtractedImage(
                        id=img_id,
                        page_index=page.index,
                        source_type="embedded",
                        width=width,
                        height=height,
                        pixmap=pix,
                        bbox=img_bbox,
                    )
                )
                
                bbox_info = f"bbox={img_bbox}" if img_bbox else "bbox=unknown"
                logger.debug(
                    f"Page {page.index}, image {local_idx}: "
                    f"extracted as {img_id} ({width}x{height}, {bbox_info})"
                )
                
            except Exception as exc:
                logger.warning(
                    f"Page {page.index}, image {local_idx}: "
                    f"failed to extract - {exc}"
                )
                continue
    
    logger.info(f"Found {total_found} total images, retained {len(images)} after filtering")
    return images


def rasterize_vector_content(
    pdf: PdfDocument,
    output_dir: Path,
    dpi: int = 150,
    min_text_density: float = 0.1,
) -> list[ExtractedImage]:
    """
    Rasterize pages that may contain vector-drawn content (reference sheets, player aids).
    
    This captures content that isn't embedded as bitmap images but is drawn using
    vector graphics (text, lines, shapes). Reference sheets often fall into this category.
    
    Args:
        pdf: PdfDocument to process
        output_dir: Directory to save rasterized images
        dpi: Resolution for rasterization (higher = better quality, larger files)
        min_text_density: Minimum text density to consider page as potential reference sheet
        
    Returns:
        List of ExtractedImage objects from rasterized pages
    """
    rasterized_images: list[ExtractedImage] = []
    
    logger.info(f"Scanning {pdf.page_count} pages for vector content to rasterize")
    
    for page in pdf.pages():
        raw_page = page.as_pymupdf_page()
        page_rect = raw_page.rect
        page_width = page_rect.width
        page_height = page_rect.height
        page_area = page_width * page_height
        
        # Check if page has significant vector content
        embedded_images = raw_page.get_images(full=True)
        text_blocks = raw_page.get_text("blocks")
        drawings = raw_page.get_drawings() if hasattr(raw_page, 'get_drawings') else []
        
        # Calculate content metrics
        text_area = sum(
            (b[2] - b[0]) * (b[3] - b[1]) 
            for b in text_blocks 
            if len(b) >= 5 and b[4]  # Text blocks with content
        )
        text_density = text_area / page_area if page_area > 0 else 0
        
        # Heuristics for reference sheet detection:
        # 1. Few embedded images (< 5 large ones)
        # 2. Significant text density (player aid text)
        # 3. Has drawings (icons, tables, dividers)
        large_images = sum(1 for img in embedded_images 
                          if _is_large_image(pdf._doc, img[0], page_area * 0.05))
        
        is_potential_reference = (
            large_images < 5 and
            text_density > min_text_density and
            (len(drawings) > 10 or text_density > 0.3)  # Has structure or lots of text
        )
        
        # Also check for pages with tables (common in reference sheets)
        has_table_structure = _detect_table_structure(text_blocks)
        
        if is_potential_reference or has_table_structure:
            logger.info(
                f"Page {page.index}: Potential reference sheet detected "
                f"(text_density={text_density:.2f}, large_images={large_images}, "
                f"drawings={len(drawings)}, has_tables={has_table_structure})"
            )
            
            # Rasterize the page at specified DPI
            try:
                zoom = dpi / 72.0  # PDF default is 72 DPI
                mat = fitz.Matrix(zoom, zoom)
                pix = raw_page.get_pixmap(matrix=mat)
                
                img_id = f"p{page.index}_raster"
                rasterized_images.append(
                    ExtractedImage(
                        id=img_id,
                        page_index=page.index,
                        source_type="embedded",  # Treat as embedded for compatibility
                        width=pix.width,
                        height=pix.height,
                        pixmap=pix,
                        bbox=BBox(x0=0, y0=0, x1=page_width, y1=page_height),
                    )
                )
                logger.debug(f"Rasterized page {page.index} as {img_id} ({pix.width}x{pix.height})")
                
            except Exception as exc:
                logger.warning(f"Failed to rasterize page {page.index}: {exc}")
    
    logger.info(f"Rasterized {len(rasterized_images)} pages with vector content")
    return rasterized_images


def _is_large_image(doc, xref: int, min_area: float) -> bool:
    """Check if an image is large enough to be considered significant."""
    try:
        pix = fitz.Pixmap(doc, xref)
        area = pix.width * pix.height
        pix = None
        return area > min_area
    except:
        return False


def _detect_table_structure(text_blocks: list) -> bool:
    """
    Detect if text blocks suggest a table structure.
    Tables typically have aligned text in columns.
    """
    if len(text_blocks) < 10:
        return False
    
    # Get x-coordinates of text block starts
    x_starts = sorted(set(round(b[0] / 10) * 10 for b in text_blocks if len(b) >= 4))
    
    # If there are multiple distinct column positions, likely a table
    return len(x_starts) >= 3


def _get_image_bbox(page: fitz.Page, xref: int) -> Optional[BBox]:
    """
    Try to determine the bounding box of an image on the page.
    
    Args:
        page: PyMuPDF page object
        xref: Image cross-reference number
        
    Returns:
        BBox if placement can be determined, None otherwise
    """
    try:
        # Get all image instances on the page
        image_list = page.get_images(full=True)
        
        # Find matching image by xref and try to get placement
        for img_info in image_list:
            if img_info[0] == xref:  # xref matches
                # Try to get image placement using get_image_rects
                try:
                    rects = page.get_image_rects(img_info)
                    if rects:
                        # Use first rectangle if multiple found
                        rect = rects[0]
                        return BBox(
                            x0=rect.x0,
                            y0=rect.y0,
                            x1=rect.x1,
                            y1=rect.y1
                        )
                except:
                    # get_image_rects might not be available in all PyMuPDF versions
                    pass
                
                # Fallback: try to find image in page content stream
                try:
                    # This is a more complex approach that would require
                    # parsing the page content stream - for now, return None
                    pass
                except:
                    pass
                
                break
        
        # If we can't determine placement, return None
        logger.debug(f"Could not determine bbox for image xref {xref}")
        return None
        
    except Exception as exc:
        logger.debug(f"Error getting image bbox for xref {xref}: {exc}")
        return None


def save_images_flat(
    images: Sequence[ExtractedImage],
    output_dir: Path,
    fmt: str = "png",
    rulebook_id: str = "unknown",
) -> tuple[Dict[str, Path], ExtractionHealthMetrics]:
    """
    Save extracted images to a flat directory structure with colorspace normalization.
    
    Returns:
        Tuple of (image_id_to_path_mapping, health_metrics)
    """
    # Create the images/all directory structure for Phase 5 compatibility
    all_dir = output_dir / "images" / "all"
    all_dir.mkdir(parents=True, exist_ok=True)
    saved_path_mapping: Dict[str, Path] = {}
    normalization_results: list[NormalizedImageResult] = []
    
    logger.info(f"Saving {len(images)} images to {all_dir} with colorspace normalization")
    
    for image in images:
        filename = f"component_{image.id}.{fmt.lower()}"
        path = all_dir / filename
        
        # Use colorspace normalization instead of direct save
        result = normalize_pdf_image(
            pixmap=image.pixmap,
            image_id=image.id,
            output_path=path,
            fmt=fmt
        )
        
        normalization_results.append(result)
        
        if result.output_path:
            saved_path_mapping[image.id] = result.output_path
            logger.debug(f"Normalized and saved {image.id} as {path}")
        else:
            logger.error(f"Failed to normalize {image.id}: {result.errors}")
    
    # Calculate health metrics
    health_metrics = calculate_health_metrics(normalization_results)
    
    # Write structured extraction log
    log_path = output_dir / "extraction_log.jsonl"
    write_extraction_log(normalization_results, log_path, rulebook_id)
    
    # Validate extraction health (fail-fast if >20% failures)
    if not validate_extraction_health(health_metrics, failure_threshold=0.20):
        logger.error(
            f"EXTRACTION HEALTH CHECK FAILED: "
            f"{health_metrics.failure_rate:.2%} failure rate exceeds 20% threshold"
        )
        # Note: We log the error but don't raise an exception to allow partial results
        # The caller can check health_metrics.failure_rate to decide on hard failure
    
    logger.info(
        f"Extraction complete: {len(saved_path_mapping)}/{len(images)} images saved "
        f"({health_metrics.success_rate:.2%} success rate)"
    )
    
    return saved_path_mapping, health_metrics