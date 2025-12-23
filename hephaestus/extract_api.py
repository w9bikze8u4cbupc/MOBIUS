#!/usr/bin/env python3
"""
HEPHAESTUS API for MOBIUS integration.
Simplified wrapper that uses PyMuPDF directly for PDF image extraction.
"""

import json
import sys
import os
import hashlib
from pathlib import Path
from typing import Dict, List, Any, Optional

import fitz  # PyMuPDF
from PIL import Image
import imagehash


def extract_embedded_images(pdf_path: str, min_width: int = 16, min_height: int = 16, min_area: int = 400):
    """Extract embedded raster images from PDF pages.
    
    Uses relaxed thresholds to capture small components like tokens and coins:
    - min_width/min_height: 16px (captures small tokens/coins)
    - min_area: 400px² (filters tiny artifacts while keeping valid components)
    """
    images = []
    
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        raise Exception(f"Failed to open PDF: {e}")
    
    if doc.needs_pass:
        doc.close()
        raise Exception("PDF is encrypted")
    
    for page_idx in range(doc.page_count):
        page = doc.load_page(page_idx)
        img_list = page.get_images(full=True)
        
        for img_idx, img_info in enumerate(img_list):
            xref = img_info[0]
            try:
                pix = fitz.Pixmap(doc, xref)
                width, height = pix.width, pix.height
                area = width * height
                
                # Filter by minimum dimensions
                if width < min_width or height < min_height:
                    continue
                
                # Filter by minimum area (catches tiny artifacts)
                if area < min_area:
                    continue
                
                images.append({
                    'id': f'p{page_idx}_img{img_idx}',
                    'page_index': page_idx,
                    'width': width,
                    'height': height,
                    'xref': xref,
                    'pixmap': pix
                })
            except Exception as e:
                print(f"Warning: Failed to extract image {img_idx} on page {page_idx}: {e}", file=sys.stderr)
                continue
    
    # Don't close doc yet - we need it for rasterization
    return images, doc


def classify_image(img: Dict[str, Any]) -> Dict[str, Any]:
    """Improved heuristic classification of images.
    
    Better detection for:
    - Tokens/coins (small near-square images)
    - Reference sheets (large landscape images with high text density)
    - Cards (standard card aspect ratios)
    - Tiles (medium square-ish images)
    """
    width = img['width']
    height = img['height']
    aspect = width / height if height > 0 else 1
    area = width * height
    is_rasterized = img.get('is_rasterized', False)
    
    # Handle rasterized pages (potential reference sheets)
    if is_rasterized:
        return {'label': 'reference-sheet', 'is_component': True, 'confidence': 0.75}
    
    # Tiny artifacts (< 400 px²)
    if area < 400:
        return {'label': 'noise', 'is_component': False, 'confidence': 0.8}
    
    # Small near-square images: TOKENS (not icons!)
    # Tokens/coins are typically 20x20 to 100x100 (400-10000 px²)
    if area < 10000 and 0.6 <= aspect <= 1.67:
        return {'label': 'token', 'is_component': True, 'confidence': 0.7}
    
    # Small non-square images might be icons
    if area < 2500 and (aspect < 0.6 or aspect > 1.67):
        return {'label': 'icon', 'is_component': False, 'confidence': 0.6}
    
    # Very large images
    if area > 200000:
        # Check for reference sheet (landscape, near page size)
        if 1.2 <= aspect <= 1.6 and area > 400000:
            return {'label': 'reference-sheet', 'is_component': True, 'confidence': 0.7}
        else:
            return {'label': 'board', 'is_component': True, 'confidence': 0.65}
    
    # Medium-large images (40k-200k px²)
    if area > 40000:
        if 1.3 <= aspect <= 1.5:
            return {'label': 'reference-sheet', 'is_component': True, 'confidence': 0.55}
        elif 0.8 <= aspect <= 1.25:
            return {'label': 'tile', 'is_component': True, 'confidence': 0.6}
        else:
            return {'label': 'board', 'is_component': True, 'confidence': 0.55}
    
    # Card-like aspect ratios (standard playing card ~0.64 or 1.56)
    if 0.55 <= aspect <= 0.75 or 1.33 <= aspect <= 1.82:
        return {'label': 'card', 'is_component': True, 'confidence': 0.7}
    
    # Medium square-ish images - tokens or tiles
    if 0.7 <= aspect <= 1.4:
        if area < 20000:
            return {'label': 'token', 'is_component': True, 'confidence': 0.6}
        else:
            return {'label': 'tile', 'is_component': True, 'confidence': 0.55}
    
    return {'label': 'unknown', 'is_component': True, 'confidence': 0.5}


def compute_phash(pil_image: Image.Image) -> str:
    """Compute perceptual hash for deduplication."""
    try:
        return str(imagehash.phash(pil_image))
    except:
        return ""


def rasterize_reference_pages(doc, min_text_density: float = 0.1, dpi: int = 150) -> List[Dict[str, Any]]:
    """
    Rasterize pages that may contain vector-drawn reference sheets/player aids.
    
    Reference sheets are often drawn with vectors (text, tables, icons) rather than
    embedded as bitmap images. This function detects and rasterizes such pages.
    """
    rasterized = []
    
    print(f"[HEPHAESTUS] Scanning {doc.page_count} pages for reference sheets...", file=sys.stderr)
    
    for page_idx in range(doc.page_count):
        page = doc.load_page(page_idx)
        page_rect = page.rect
        page_width = page_rect.width
        page_height = page_rect.height
        page_area = page_width * page_height
        
        if page_area == 0:
            continue
        
        # Get page content metrics
        embedded_images = page.get_images(full=True)
        text_blocks = page.get_text("blocks")
        
        # Count large embedded images (> 5% of page area)
        large_images = 0
        for img_info in embedded_images:
            try:
                pix = fitz.Pixmap(doc, img_info[0])
                img_area = pix.width * pix.height
                if img_area > page_area * 0.05:
                    large_images += 1
                pix = None
            except:
                pass
        
        # Calculate text density
        text_area = sum(
            (b[2] - b[0]) * (b[3] - b[1]) 
            for b in text_blocks 
            if len(b) >= 5 and b[4]  # Has text content
        )
        text_density = text_area / page_area
        
        # Detect table structure (columns of aligned text)
        x_positions = sorted(set(round(b[0] / 20) * 20 for b in text_blocks if len(b) >= 4))
        has_table = len(x_positions) >= 3
        
        # Heuristics for reference sheet:
        # - Few large embedded images (< 5)
        # - Significant text (density > 0.1) OR has table structure
        # - Not mostly empty
        is_reference = (
            large_images < 5 and
            (text_density > min_text_density or has_table) and
            text_density < 0.8  # Not pure text page
        )
        
        if is_reference:
            print(f"[HEPHAESTUS] Page {page_idx}: Reference sheet detected (text={text_density:.2f}, tables={has_table})", file=sys.stderr)
            
            try:
                zoom = dpi / 72.0
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat)
                
                rasterized.append({
                    'id': f'p{page_idx}_ref',
                    'page_index': page_idx,
                    'width': pix.width,
                    'height': pix.height,
                    'pixmap': pix,
                    'is_rasterized': True
                })
            except Exception as e:
                print(f"Warning: Failed to rasterize page {page_idx}: {e}", file=sys.stderr)
    
    print(f"[HEPHAESTUS] Found {len(rasterized)} reference sheet pages", file=sys.stderr)
    return rasterized


def save_images(images: List[Dict[str, Any]], output_dir: Path) -> Dict[str, Path]:
    """Save images as PNG files and return path mapping."""
    images_dir = output_dir / "images" / "all"
    images_dir.mkdir(parents=True, exist_ok=True)
    
    path_mapping = {}
    
    for img in images:
        pix = img['pixmap']
        img_id = img['id']
        filename = f"component_{img_id}.png"
        filepath = images_dir / filename
        
        try:
            if pix.alpha:
                pix = fitz.Pixmap(pix, 0)
            
            if pix.n - pix.alpha > 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            
            pix.save(str(filepath))
            path_mapping[img_id] = filepath
        except Exception as e:
            print(f"Warning: Failed to save {img_id}: {e}", file=sys.stderr)
            continue
    
    return path_mapping


def deduplicate_images(images: List[Dict[str, Any]], path_mapping: Dict[str, Path], threshold: int = 8) -> Dict[str, str]:
    """Find duplicate images using perceptual hashing."""
    hashes = {}
    dedup_map = {}
    
    for img in images:
        img_id = img['id']
        filepath = path_mapping.get(img_id)
        
        if not filepath or not filepath.exists():
            continue
        
        try:
            pil_img = Image.open(filepath)
            phash = imagehash.phash(pil_img)
            
            is_dup = False
            for other_id, other_hash in hashes.items():
                if phash - other_hash <= threshold:
                    dedup_map[img_id] = other_id
                    is_dup = True
                    break
            
            if not is_dup:
                hashes[img_id] = phash
                dedup_map[img_id] = img_id
                
        except Exception as e:
            print(f"Warning: Failed to hash {img_id}: {e}", file=sys.stderr)
            dedup_map[img_id] = img_id
    
    return dedup_map


def extract_components(pdf_path, output_dir, min_width: int = 16, min_height: int = 16) -> dict:
    """
    Extract component images from a PDF file.
    
    Enhanced to capture:
    - Small components (tokens, coins) via lowered thresholds
    - Reference sheets via page rasterization
    """
    pdf_path = Path(pdf_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    result = {
        "success": False,
        "pdf_path": str(pdf_path),
        "output_dir": str(output_dir),
        "images": [],
        "stats": {},
        "error": None
    }
    
    doc = None
    try:
        print(f"[HEPHAESTUS] Opening PDF: {pdf_path}", file=sys.stderr)
        images, doc = extract_embedded_images(str(pdf_path), min_width, min_height)
        print(f"[HEPHAESTUS] Found {len(images)} embedded images", file=sys.stderr)
        
        # Phase 2: Rasterize potential reference sheets
        reference_pages = rasterize_reference_pages(doc)
        if reference_pages:
            print(f"[HEPHAESTUS] Adding {len(reference_pages)} rasterized reference sheets", file=sys.stderr)
            images.extend(reference_pages)
        
        if not images:
            result["success"] = True
            result["stats"] = {"total_items": 0, "components": 0, "non_components": 0, "reference_sheets": 0}
            return result
        
        print(f"[HEPHAESTUS] Saving {len(images)} images...", file=sys.stderr)
        path_mapping = save_images(images, output_dir)
        print(f"[HEPHAESTUS] Saved {len(path_mapping)} images", file=sys.stderr)
        
        print(f"[HEPHAESTUS] Deduplicating...", file=sys.stderr)
        dedup_map = deduplicate_images(images, path_mapping, threshold=8)
        
        print(f"[HEPHAESTUS] Classifying with improved heuristics...", file=sys.stderr)
        components = 0
        non_components = 0
        tokens = 0
        reference_sheets = 0
        
        for img in images:
            img_id = img['id']
            filepath = path_mapping.get(img_id)
            
            if not filepath:
                continue
            
            classification = classify_image(img)
            is_canonical = dedup_map.get(img_id) == img_id
            
            if classification['is_component']:
                components += 1
                if classification['label'] == 'token':
                    tokens += 1
                elif classification['label'] == 'reference-sheet':
                    reference_sheets += 1
            else:
                non_components += 1
            
            if is_canonical:
                result["images"].append({
                    "id": img_id,
                    "file_name": filepath.name,
                    "file_path": str(filepath),
                    "page_index": img['page_index'],
                    "classification": classification['label'],
                    "is_component": classification['is_component'],
                    "confidence": classification['confidence'],
                    "label": classification['label'],
                    "is_rasterized": img.get('is_rasterized', False),
                    "quantity": None,
                    "dimensions": {
                        "width": img['width'],
                        "height": img['height']
                    }
                })
        
        unique_count = len([i for i in result["images"]])
        dup_count = len(images) - unique_count
        
        result["success"] = True
        result["stats"] = {
            "total_items": len(images),
            "components": components,
            "non_components": non_components,
            "tokens": tokens,
            "reference_sheets": reference_sheets,
            "duplicates_removed": dup_count,
            "unique_images": unique_count
        }
        
        manifest_path = output_dir / "manifest.json"
        with open(manifest_path, 'w') as f:
            json.dump(result, f, indent=2)
        result["manifest_path"] = str(manifest_path)
        
        print(f"[HEPHAESTUS] Complete: {unique_count} unique images ({dup_count} duplicates, {tokens} tokens, {reference_sheets} ref sheets)", file=sys.stderr)
        
    except Exception as e:
        result["error"] = str(e)
        import traceback
        traceback.print_exc()
    finally:
        if doc:
            doc.close()
    
    return result


def main():
    """CLI interface for MOBIUS integration."""
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python extract_api.py <pdf_path> <output_dir> [min_width] [min_height]"
        }))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    min_width = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    min_height = int(sys.argv[4]) if len(sys.argv) > 4 else 16
    
    result = extract_components(pdf_path, output_dir, min_width, min_height)
    print(json.dumps(result, indent=2))
    
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
