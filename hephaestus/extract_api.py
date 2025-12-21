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


def extract_embedded_images(pdf_path: str, min_width: int = 50, min_height: int = 50) -> List[Dict[str, Any]]:
    """Extract embedded raster images from PDF pages."""
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
                
                if width < min_width or height < min_height:
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
    
    doc.close()
    return images


def classify_image(img: Dict[str, Any]) -> Dict[str, Any]:
    """Simple heuristic classification of images."""
    width = img['width']
    height = img['height']
    aspect = width / height if height > 0 else 1
    area = width * height
    
    if area < 10000:
        return {'label': 'icon', 'is_component': False, 'confidence': 0.7}
    elif area > 1000000:
        return {'label': 'board', 'is_component': True, 'confidence': 0.6}
    elif 0.6 < aspect < 0.8:
        return {'label': 'card', 'is_component': True, 'confidence': 0.8}
    elif 0.9 < aspect < 1.1:
        return {'label': 'token', 'is_component': True, 'confidence': 0.7}
    elif area > 50000:
        return {'label': 'tile', 'is_component': True, 'confidence': 0.6}
    else:
        return {'label': 'unknown', 'is_component': True, 'confidence': 0.5}


def compute_phash(pil_image: Image.Image) -> str:
    """Compute perceptual hash for deduplication."""
    try:
        return str(imagehash.phash(pil_image))
    except:
        return ""


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


def extract_components(pdf_path: str, output_dir: str, min_width: int = 50, min_height: int = 50) -> dict:
    """
    Extract component images from a PDF file.
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
    
    try:
        print(f"[HEPHAESTUS] Opening PDF: {pdf_path}", file=sys.stderr)
        images = extract_embedded_images(str(pdf_path), min_width, min_height)
        print(f"[HEPHAESTUS] Found {len(images)} embedded images", file=sys.stderr)
        
        if not images:
            result["success"] = True
            result["stats"] = {"total_items": 0, "components": 0, "non_components": 0}
            return result
        
        print(f"[HEPHAESTUS] Saving images...", file=sys.stderr)
        path_mapping = save_images(images, output_dir)
        print(f"[HEPHAESTUS] Saved {len(path_mapping)} images", file=sys.stderr)
        
        print(f"[HEPHAESTUS] Deduplicating...", file=sys.stderr)
        dedup_map = deduplicate_images(images, path_mapping, threshold=8)
        
        print(f"[HEPHAESTUS] Classifying...", file=sys.stderr)
        components = 0
        non_components = 0
        
        for img in images:
            img_id = img['id']
            filepath = path_mapping.get(img_id)
            
            if not filepath:
                continue
            
            classification = classify_image(img)
            is_canonical = dedup_map.get(img_id) == img_id
            
            if classification['is_component']:
                components += 1
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
            "duplicates_removed": dup_count,
            "unique_images": unique_count
        }
        
        manifest_path = output_dir / "manifest.json"
        with open(manifest_path, 'w') as f:
            json.dump(result, f, indent=2)
        result["manifest_path"] = str(manifest_path)
        
        print(f"[HEPHAESTUS] Complete: {unique_count} unique images ({dup_count} duplicates removed)", file=sys.stderr)
        
    except Exception as e:
        result["error"] = str(e)
        import traceback
        traceback.print_exc()
    
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
    min_width = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    min_height = int(sys.argv[4]) if len(sys.argv) > 4 else 50
    
    result = extract_components(pdf_path, output_dir, min_width, min_height)
    print(json.dumps(result, indent=2))
    
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
