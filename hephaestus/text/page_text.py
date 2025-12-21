"""
Page text artifact generation for spatial text overlay in Inspector UI.

This module generates page_text.jsonl artifacts containing structured text blocks
with bounding box coordinates for each PDF page, enabling real spatial text overlay
in the Inspector's Component Drilldown view.
"""

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

import fitz  # type: ignore[import]

from ..pdf.ingestion import PdfDocument
from ..logging import get_logger

logger = get_logger(__name__)


@dataclass
class PageSize:
    """Page dimensions in PDF points."""
    width: float
    height: float


@dataclass
class TextBlock:
    """Text block with bounding box coordinates."""
    bbox: List[float]  # [x0, y0, x1, y1] in PDF points
    text: str
    type: str  # "text" | "other"


@dataclass
class PageTextRecord:
    """Single page text extraction record for page_text.jsonl."""
    rulebook_id: str
    page_index: int
    page_size: PageSize
    blocks: List[TextBlock]
    errors: List[str]
    timestamp: str


def extract_page_text_artifacts(
    pdf: PdfDocument, 
    rulebook_id: str,
    output_dir: Path
) -> Path:
    """
    Extract page text artifacts and write to page_text.jsonl.
    
    Args:
        pdf: PdfDocument to extract text from
        rulebook_id: Identifier for the rulebook (from PDF filename)
        output_dir: Directory to write page_text.jsonl
        
    Returns:
        Path to the generated page_text.jsonl file
    """
    logger.info(f"Extracting page text artifacts for {rulebook_id}")
    
    output_dir.mkdir(parents=True, exist_ok=True)
    page_text_path = output_dir / "page_text.jsonl"
    
    timestamp = datetime.utcnow().isoformat()
    total_pages = pdf.page_count
    total_blocks = 0
    
    with open(page_text_path, 'w', encoding='utf-8') as f:
        for page in pdf.pages():
            try:
                record = _extract_single_page_text(page, rulebook_id, timestamp)
                total_blocks += len(record.blocks)
                
                # Write JSONL record (one JSON object per line)
                json_line = json.dumps(asdict(record), ensure_ascii=False)
                f.write(json_line + '\n')
                
                logger.debug(f"Page {page.index}: extracted {len(record.blocks)} text blocks")
                
            except Exception as exc:
                # Create error record for failed page
                error_record = PageTextRecord(
                    rulebook_id=rulebook_id,
                    page_index=page.index,
                    page_size=PageSize(width=0.0, height=0.0),
                    blocks=[],
                    errors=[f"Text extraction failed: {str(exc)}"],
                    timestamp=timestamp
                )
                
                json_line = json.dumps(asdict(error_record), ensure_ascii=False)
                f.write(json_line + '\n')
                
                logger.warning(f"Failed to extract text from page {page.index}: {exc}")
    
    logger.info(f"Page text extraction complete: {total_pages} pages, {total_blocks} total blocks")
    logger.info(f"Page text artifact written to: {page_text_path}")
    
    return page_text_path


def _extract_single_page_text(page, rulebook_id: str, timestamp: str) -> PageTextRecord:
    """Extract text blocks from a single PDF page."""
    raw_page = page.as_pymupdf_page()
    page_rect = raw_page.rect
    
    # Get page dimensions in PDF points (same coordinate system as component bboxes)
    page_size = PageSize(
        width=float(page_rect.width),
        height=float(page_rect.height)
    )
    
    blocks = []
    errors = []
    
    try:
        # First try: Use PyMuPDF's rawdict format for deterministic text extraction
        text_dict = raw_page.get_text("rawdict")
        
        # Process text blocks in deterministic order
        for block_idx, block in enumerate(text_dict.get("blocks", [])):
            if block.get("type") != 0:  # Skip non-text blocks (images, etc.)
                continue
            
            # Process lines within the block
            for line_idx, line in enumerate(block.get("lines", [])):
                line_text_parts = []
                line_bbox = None
                
                # Collect spans within the line
                for span_idx, span in enumerate(line.get("spans", [])):
                    span_text = span.get("text", "").strip()
                    if not span_text:
                        continue
                    
                    line_text_parts.append(span_text)
                    
                    # Update line bounding box
                    span_bbox = span.get("bbox")
                    if span_bbox and len(span_bbox) == 4:
                        if line_bbox is None:
                            line_bbox = list(span_bbox)
                        else:
                            # Merge bounding boxes
                            line_bbox[0] = min(line_bbox[0], span_bbox[0])  # x0
                            line_bbox[1] = min(line_bbox[1], span_bbox[1])  # y0
                            line_bbox[2] = max(line_bbox[2], span_bbox[2])  # x1
                            line_bbox[3] = max(line_bbox[3], span_bbox[3])  # y1
                
                # Create text block for the line if we have content
                line_text = " ".join(line_text_parts).strip()
                if line_text and line_bbox:
                    # Validate bbox coordinates are within page bounds
                    if (_validate_bbox_bounds(line_bbox, page_size)):
                        blocks.append(TextBlock(
                            bbox=line_bbox,
                            text=line_text,
                            type="text"
                        ))
                    else:
                        errors.append(f"Block bbox out of bounds: {line_bbox}")
        
        # If no text blocks found, try simple text extraction as fallback
        if not blocks:
            simple_text = raw_page.get_text().strip()
            if simple_text:
                # Create a single block covering the whole page
                full_page_bbox = [page_rect.x0, page_rect.y0, page_rect.x1, page_rect.y1]
                blocks.append(TextBlock(
                    bbox=full_page_bbox,
                    text=simple_text,
                    type="text"
                ))
            else:
                # No extractable text found - this is common for image-based PDFs
                errors.append("No extractable text found on page (likely image-based content)")
    
    except Exception as exc:
        errors.append(f"Text extraction error: {str(exc)}")
        logger.debug(f"Page {page.index} text extraction error: {exc}")
    
    return PageTextRecord(
        rulebook_id=rulebook_id,
        page_index=page.index,
        page_size=page_size,
        blocks=blocks,
        errors=errors,
        timestamp=timestamp
    )


def _validate_bbox_bounds(bbox: List[float], page_size: PageSize) -> bool:
    """Validate that bbox coordinates are within page bounds with small tolerance."""
    if len(bbox) != 4:
        return False
    
    x0, y0, x1, y1 = bbox
    tolerance = 5.0  # Allow 5 points outside page bounds
    
    return (
        x0 >= -tolerance and
        y0 >= -tolerance and
        x1 <= page_size.width + tolerance and
        y1 <= page_size.height + tolerance and
        x0 < x1 and  # Valid width
        y0 < y1      # Valid height
    )


def load_page_text_artifact(page_text_path: Path) -> Dict[int, PageTextRecord]:
    """
    Load page_text.jsonl artifact into a dictionary keyed by page_index.
    
    Args:
        page_text_path: Path to page_text.jsonl file
        
    Returns:
        Dictionary mapping page_index to PageTextRecord
    """
    page_records = {}
    
    if not page_text_path.exists():
        logger.warning(f"Page text artifact not found: {page_text_path}")
        return page_records
    
    try:
        with open(page_text_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                
                try:
                    record_dict = json.loads(line)
                    
                    # Convert dict back to PageTextRecord
                    page_size = PageSize(**record_dict["page_size"])
                    blocks = [TextBlock(**block) for block in record_dict["blocks"]]
                    
                    record = PageTextRecord(
                        rulebook_id=record_dict["rulebook_id"],
                        page_index=record_dict["page_index"],
                        page_size=page_size,
                        blocks=blocks,
                        errors=record_dict["errors"],
                        timestamp=record_dict["timestamp"]
                    )
                    
                    page_records[record.page_index] = record
                    
                except json.JSONDecodeError as exc:
                    logger.warning(f"Invalid JSON on line {line_num} in {page_text_path}: {exc}")
                except KeyError as exc:
                    logger.warning(f"Missing field on line {line_num} in {page_text_path}: {exc}")
    
    except Exception as exc:
        logger.error(f"Failed to load page text artifact {page_text_path}: {exc}")
    
    logger.debug(f"Loaded {len(page_records)} page text records from {page_text_path}")
    return page_records