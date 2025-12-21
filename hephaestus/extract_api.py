#!/usr/bin/env python3
"""
HEPHAESTUS API for MOBIUS integration.
Provides a simple JSON API for extracting component images from PDFs.
"""

import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from pdf.ingestion import PdfDocument, PdfOpenError, EncryptedPdfError
from pdf.images import extract_embedded_images, save_images_flat
from classifier.model import HybridClassifier
from metadata.annotator import annotate_components
from dedup.model import deduplicate_images
from output.manifest import build_manifest, write_manifest_json


def extract_components(pdf_path: str, output_dir: str, min_width: int = 50, min_height: int = 50) -> dict:
    """
    Extract component images from a PDF file.
    
    Args:
        pdf_path: Path to the PDF file
        output_dir: Directory to save extracted images
        min_width: Minimum image width in pixels
        min_height: Minimum image height in pixels
        
    Returns:
        Dictionary with extraction results
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
        # Open PDF
        pdf = PdfDocument(pdf_path)
        
        # Extract embedded images
        images = extract_embedded_images(pdf, min_width=min_width, min_height=min_height)
        
        if not images:
            result["success"] = True
            result["stats"] = {"total_images": 0, "components": 0}
            return result
        
        # Save images to disk
        path_mapping, health_metrics = save_images_flat(
            images, 
            output_dir, 
            rulebook_id=pdf_path.stem
        )
        
        # Classify images
        classifier = HybridClassifier(enable_vision=False)  # Disable vision for speed
        classifications = {}
        for image in images:
            try:
                classification = classifier.classify(image)
                classifications[image.id] = classification
            except Exception as e:
                print(f"Warning: Classification failed for {image.id}: {e}", file=sys.stderr)
        
        # Annotate with metadata (labels, quantities)
        metadata_list = annotate_components(images, classifications, {})
        
        # Deduplicate
        dedup_map = deduplicate_images(images, threshold=8)
        
        # Build manifest
        manifest = build_manifest(
            source_pdf_path=pdf_path,
            images=images,
            classifications=classifications,
            metadata=metadata_list,
            dedup_map=dedup_map,
            path_mapping=path_mapping,
            health_metrics=health_metrics
        )
        
        # Write manifest
        manifest_path = write_manifest_json(manifest, output_dir)
        
        # Build result
        result["success"] = True
        result["manifest_path"] = str(manifest_path)
        result["stats"] = manifest.summary
        result["images"] = []
        
        for item in manifest.items:
            if not item.is_duplicate:  # Only include canonical images
                img_data = {
                    "id": item.image_id,
                    "file_name": item.file_name,
                    "file_path": str(path_mapping.get(item.image_id, "")),
                    "page_index": item.page_index,
                    "classification": item.classification,
                    "is_component": item.classification not in ["icon", "decorative", "non-component", "unknown"],
                    "confidence": item.classification_confidence,
                    "label": item.label,
                    "quantity": item.quantity,
                    "dimensions": item.dimensions
                }
                result["images"].append(img_data)
        
        pdf.close()
        
    except EncryptedPdfError as e:
        result["error"] = f"PDF is encrypted: {e}"
    except PdfOpenError as e:
        result["error"] = f"Failed to open PDF: {e}"
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
