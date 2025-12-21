"""
Spatial text extraction using PyMuPDF with bounding box information.

This module extracts text content along with precise geometric positioning
to enable proximity-based text-to-image association.
"""

import re
from dataclasses import dataclass
from typing import Literal, List

import fitz  # type: ignore[import]

from ..pdf.ingestion import PdfDocument
from ..logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class BBox:
    """Bounding box with coordinates in PDF points."""
    x0: float
    y0: float
    x1: float
    y1: float
    
    def width(self) -> float:
        """Calculate bounding box width."""
        return self.x1 - self.x0
    
    def height(self) -> float:
        """Calculate bounding box height."""
        return self.y1 - self.y0
    
    def area(self) -> float:
        """Calculate bounding box area."""
        return self.width() * self.height()
    
    def center(self) -> tuple[float, float]:
        """Get center point of bounding box."""
        return ((self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2)


@dataclass(frozen=True)
class TextSpan:
    """Text span with spatial information."""
    page_index: int
    text: str
    bbox: BBox
    source: Literal["block", "line", "span"]


def extract_spatial_text(pdf: PdfDocument) -> List[TextSpan]:
    """
    Extract text with geometry for all pages.
    
    Args:
        pdf: PdfDocument to extract text from
        
    Returns:
        List of TextSpan objects with text content and bounding boxes
    """
    spans = []
    
    logger.info(f"Extracting spatial text from {pdf.page_count} pages")
    
    for page in pdf.pages():
        try:
            page_spans = _extract_page_text(page)
            spans.extend(page_spans)
            logger.debug(f"Page {page.index}: extracted {len(page_spans)} text spans")
            
        except Exception as exc:
            logger.warning(f"Failed to extract text from page {page.index}: {exc}")
            continue
    
    logger.info(f"Extracted {len(spans)} total text spans")
    return spans


def _extract_page_text(page) -> List[TextSpan]:
    """Extract text spans from a single page."""
    spans = []
    
    try:
        # Get text dictionary with detailed structure
        raw_page = page.as_pymupdf_page()
        text_dict = raw_page.get_text("dict")
        
        # Process blocks -> lines -> spans hierarchy
        for block in text_dict.get("blocks", []):
            if "lines" not in block:  # Skip image blocks
                continue
                
            # Process text blocks
            for line in block["lines"]:
                # Extract line-level span (combined text)
                line_text = ""
                line_bbox = None
                
                for span in line.get("spans", []):
                    span_text = span.get("text", "").strip()
                    if not span_text:
                        continue
                    
                    # Normalize whitespace
                    span_text = re.sub(r'\s+', ' ', span_text)
                    line_text += span_text + " "
                    
                    # Create span-level entry
                    span_bbox = BBox(
                        x0=span["bbox"][0],
                        y0=span["bbox"][1], 
                        x1=span["bbox"][2],
                        y1=span["bbox"][3]
                    )
                    
                    if len(span_text) > 0:  # Only add non-empty spans
                        spans.append(TextSpan(
                            page_index=page.index,
                            text=span_text,
                            bbox=span_bbox,
                            source="span"
                        ))
                    
                    # Update line bounding box
                    if line_bbox is None:
                        line_bbox = span_bbox
                    else:
                        line_bbox = _merge_bboxes(line_bbox, span_bbox)
                
                # Add line-level entry if we have content
                line_text = line_text.strip()
                if line_text and line_bbox:
                    spans.append(TextSpan(
                        page_index=page.index,
                        text=line_text,
                        bbox=line_bbox,
                        source="line"
                    ))
        
    except Exception as exc:
        logger.debug(f"Error processing page {page.index} text structure: {exc}")
        # Fallback to simple text extraction
        try:
            simple_text = raw_page.get_text()
            if simple_text.strip():
                # Create a single span covering the whole page
                page_rect = raw_page.rect
                fallback_bbox = BBox(
                    x0=page_rect.x0,
                    y0=page_rect.y0,
                    x1=page_rect.x1, 
                    y1=page_rect.y1
                )
                spans.append(TextSpan(
                    page_index=page.index,
                    text=simple_text.strip(),
                    bbox=fallback_bbox,
                    source="block"
                ))
        except Exception as fallback_exc:
            logger.warning(f"Fallback text extraction failed for page {page.index}: {fallback_exc}")
    
    return spans


def _merge_bboxes(bbox1: BBox, bbox2: BBox) -> BBox:
    """Merge two bounding boxes to create encompassing box."""
    return BBox(
        x0=min(bbox1.x0, bbox2.x0),
        y0=min(bbox1.y0, bbox2.y0),
        x1=max(bbox1.x1, bbox2.x1),
        y1=max(bbox1.y1, bbox2.y1)
    )


def bbox_distance(bbox1: BBox, bbox2: BBox) -> float:
    """Calculate distance between two bounding box centers."""
    center1 = bbox1.center()
    center2 = bbox2.center()
    
    dx = center1[0] - center2[0]
    dy = center1[1] - center2[1]
    
    return (dx * dx + dy * dy) ** 0.5


def bbox_intersects(bbox1: BBox, bbox2: BBox) -> bool:
    """Check if two bounding boxes intersect."""
    return not (
        bbox1.x1 < bbox2.x0 or bbox2.x1 < bbox1.x0 or
        bbox1.y1 < bbox2.y0 or bbox2.y1 < bbox1.y0
    )


def bbox_expand(bbox: BBox, padding: float) -> BBox:
    """Expand bounding box by padding amount in all directions."""
    return BBox(
        x0=bbox.x0 - padding,
        y0=bbox.y0 - padding,
        x1=bbox.x1 + padding,
        y1=bbox.y1 + padding
    )