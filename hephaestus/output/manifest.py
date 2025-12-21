"""
Structured manifest generation for HEPHAESTUS output.

This module creates JSON manifests that describe all extracted components
with their classifications, metadata, and file locations.
"""

import json
import hashlib
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..pdf.images import ExtractedImage
from ..pdf.colorspace import ExtractionHealthMetrics
from ..classifier.model import ClassificationResult
from ..metadata.model import ComponentMetadata
from ..logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class ManifestItem:
    """Single item in the component manifest."""
    image_id: str                           # Unique image identifier
    file_name: str                          # Output file name
    page_index: int                         # Source page number
    classification: str                     # Component classification
    classification_confidence: float       # Classification confidence score
    label: Optional[str]                    # Inferred component label
    quantity: Optional[int]                 # Inferred quantity
    metadata_confidence: float              # Overall metadata confidence
    dimensions: Dict[str, int]              # Image dimensions
    bbox: Optional[Dict[str, float]]        # Bounding box on page (if available)
    dedup_group_id: Optional[str]           # Deduplication group ID
    is_duplicate: bool                      # Whether this is a duplicate image
    canonical_image_id: Optional[str]       # ID of canonical image in group
    file_path: Optional[str] = None         # Path to saved image file
    # Phase 5: Structured output path fields
    path_all: Optional[str] = None          # Path to image in images/all/
    path_primary: Optional[str] = None      # Path to canonical image in structured folders
    path_duplicate: Optional[str] = None    # Path to duplicate image in structured folders
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass(frozen=True)
class TextArtifacts:
    """References to text extraction artifacts."""
    page_text_jsonl_path: Optional[str] = None      # Path to page_text.jsonl file
    page_text_jsonl_sha256: Optional[str] = None    # SHA256 checksum of page_text.jsonl


@dataclass(frozen=True)
class Manifest:
    """Complete manifest describing all extracted components."""
    version: str                            # Manifest format version
    source_pdf: str                         # Source PDF file path
    extraction_timestamp: str               # When extraction was performed
    total_items: int                        # Total number of items
    summary: Dict[str, Any]                 # Summary statistics
    items: List[ManifestItem]               # Individual component items
    extraction_health: Optional[Dict[str, Any]] = None  # Phase 5.6: Colorspace health metrics
    text_artifacts: Optional[TextArtifacts] = None      # Phase 6.2: Text artifact references
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "version": self.version,
            "source_pdf": self.source_pdf,
            "extraction_timestamp": self.extraction_timestamp,
            "total_items": self.total_items,
            "summary": self.summary,
            "items": [item.to_dict() for item in self.items]
        }
        if self.extraction_health is not None:
            result["extraction_health"] = self.extraction_health
        if self.text_artifacts is not None:
            result["text_artifacts"] = asdict(self.text_artifacts)
        return result


def build_manifest(
    source_pdf_path: Path,
    images: List[ExtractedImage],
    classifications: Dict[str, ClassificationResult],
    metadata: List[ComponentMetadata],
    path_mapping: Dict[str, Path],
    dedup_groups: Optional[Dict[str, Any]] = None,
    health_metrics: Optional[ExtractionHealthMetrics] = None,
    page_text_path: Optional[Path] = None
) -> Manifest:
    """
    Build a complete manifest from extraction results.
    
    Args:
        source_pdf_path: Path to the source PDF file
        images: List of extracted images
        classifications: Classification results by image ID
        metadata: List of component metadata
        path_mapping: Mapping of image ID to saved file path
        dedup_groups: Deduplication group information
        health_metrics: Phase 5.6 extraction health metrics
        page_text_path: Phase 6.2 path to page_text.jsonl artifact
        
    Returns:
        Complete Manifest object
    """
    logger.info("Building component manifest")
    
    # Path mapping is already provided correctly
    
    # Create mapping of image ID to metadata
    metadata_mapping = {m.image_id: m for m in metadata}
    
    # Build manifest items
    items = []
    for image in images:
        classification = classifications.get(image.id)
        component_metadata = metadata_mapping.get(image.id)
        saved_path = path_mapping.get(image.id)
        
        if saved_path is None:
            logger.warning(f"No saved file path found for image {image.id} - image failed to save")
            continue
        
        # Get deduplication information
        dedup_group = dedup_groups.get(image.id) if dedup_groups else None
        is_duplicate = dedup_group is not None and dedup_group.canonical_id != image.id
        canonical_id = dedup_group.canonical_id if dedup_group else image.id
        
        # Create manifest item
        item = ManifestItem(
            image_id=image.id,
            file_name=saved_path.name,
            page_index=image.page_index,
            classification=classification.label if classification else "unknown",
            classification_confidence=classification.confidence if classification else 0.0,
            label=component_metadata.label if component_metadata else None,
            quantity=component_metadata.quantity if component_metadata else None,
            metadata_confidence=component_metadata.get_confidence_score() if component_metadata else 0.0,
            dimensions={"width": image.width, "height": image.height},
            bbox=_bbox_to_dict(image.bbox) if image.bbox else None,
            dedup_group_id=dedup_group.group_id if dedup_group else None,
            is_duplicate=is_duplicate,
            canonical_image_id=canonical_id,
            file_path=str(saved_path)
        )
        
        items.append(item)
    
    # Generate summary statistics
    summary = _generate_summary(items, classifications, metadata, dedup_groups)
    
    # Phase 6.2: Create text artifacts reference
    text_artifacts = None
    if page_text_path and page_text_path.exists():
        try:
            # Calculate relative path from output directory
            relative_path = page_text_path.name  # Just the filename for now
            sha256_hash = _calculate_file_sha256(page_text_path)
            
            text_artifacts = TextArtifacts(
                page_text_jsonl_path=relative_path,
                page_text_jsonl_sha256=sha256_hash
            )
            logger.info(f"Text artifacts reference: {relative_path} (SHA256: {sha256_hash[:16]}...)")
        except Exception as exc:
            logger.warning(f"Failed to create text artifacts reference: {exc}")
    
    # Create manifest
    manifest = Manifest(
        version="1.0.0",
        source_pdf=str(source_pdf_path),
        extraction_timestamp=datetime.now().isoformat(),
        total_items=len(items),
        summary=summary,
        items=items,
        extraction_health=health_metrics.to_dict() if health_metrics else None,
        text_artifacts=text_artifacts
    )
    
    logger.info(f"Built manifest with {len(items)} items")
    return manifest


def write_manifest_json(manifest: Manifest, output_dir: Path) -> Path:
    """
    Write manifest to JSON file in the output directory.
    
    Args:
        manifest: Manifest object to write
        output_dir: Directory to write manifest file
        
    Returns:
        Path to the written manifest file
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    
    try:
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest.to_dict(), f, indent=2, ensure_ascii=False)
        
        logger.info(f"Wrote manifest to {manifest_path}")
        return manifest_path
        
    except Exception as exc:
        logger.error(f"Failed to write manifest to {manifest_path}: {exc}")
        raise


def load_manifest_json(manifest_path: Path) -> Manifest:
    """
    Load manifest from JSON file.
    
    Args:
        manifest_path: Path to manifest JSON file
        
    Returns:
        Loaded Manifest object
    """
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Convert items back to ManifestItem objects
        items = []
        for item_data in data.get("items", []):
            # Handle bbox conversion
            bbox_data = item_data.get("bbox")
            if bbox_data:
                item_data["bbox"] = bbox_data
            
            items.append(ManifestItem(**item_data))
        
        # Create manifest object
        manifest = Manifest(
            version=data["version"],
            source_pdf=data["source_pdf"],
            extraction_timestamp=data["extraction_timestamp"],
            total_items=data["total_items"],
            summary=data["summary"],
            items=items,
            extraction_health=data.get("extraction_health"),
            text_artifacts=TextArtifacts(**data["text_artifacts"]) if data.get("text_artifacts") else None
        )
        
        logger.info(f"Loaded manifest from {manifest_path} with {len(items)} items")
        return manifest
        
    except Exception as exc:
        logger.error(f"Failed to load manifest from {manifest_path}: {exc}")
        raise


def _bbox_to_dict(bbox) -> Dict[str, float]:
    """Convert BBox object to dictionary."""
    return {
        "x0": bbox.x0,
        "y0": bbox.y0,
        "x1": bbox.x1,
        "y1": bbox.y1
    }


def _calculate_file_sha256(file_path: Path) -> str:
    """Calculate SHA256 checksum of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read in chunks to handle large files
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def _generate_summary(
    items: List[ManifestItem],
    classifications: Dict[str, ClassificationResult],
    metadata: List[ComponentMetadata],
    dedup_groups: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate summary statistics for the manifest."""
    total = len(items)
    if total == 0:
        return {"total": 0}
    
    # Classification summary
    components = sum(1 for item in items if item.classification not in ["icon", "decorative", "non-component"])
    non_components = total - components
    
    # Metadata summary
    with_labels = sum(1 for item in items if item.label is not None)
    with_quantities = sum(1 for item in items if item.quantity is not None)
    complete = sum(1 for item in items if item.label is not None and item.quantity is not None)
    
    # Confidence statistics
    classification_confidences = [item.classification_confidence for item in items]
    metadata_confidences = [item.metadata_confidence for item in items if item.metadata_confidence > 0]
    
    avg_classification_confidence = sum(classification_confidences) / len(classification_confidences)
    avg_metadata_confidence = sum(metadata_confidences) / len(metadata_confidences) if metadata_confidences else 0.0
    
    # Classification distribution
    classification_dist = {}
    for item in items:
        classification_dist[item.classification] = classification_dist.get(item.classification, 0) + 1
    
    # Page distribution
    page_dist = {}
    for item in items:
        page_dist[item.page_index] = page_dist.get(item.page_index, 0) + 1
    
    # Label distribution (top 10)
    label_dist = {}
    for item in items:
        if item.label:
            label_dist[item.label] = label_dist.get(item.label, 0) + 1
    
    # Sort and limit label distribution
    sorted_labels = sorted(label_dist.items(), key=lambda x: x[1], reverse=True)[:10]
    
    # Deduplication statistics
    duplicates = sum(1 for item in items if item.is_duplicate)
    unique_groups = len(set(item.dedup_group_id for item in items if item.dedup_group_id))
    
    return {
        "total_items": total,
        "components": components,
        "non_components": non_components,
        "component_ratio": components / total,
        "metadata_coverage": {
            "with_labels": with_labels,
            "with_quantities": with_quantities,
            "complete": complete,
            "label_success_rate": with_labels / total,
            "quantity_success_rate": with_quantities / total,
            "complete_success_rate": complete / total
        },
        "confidence_scores": {
            "average_classification": avg_classification_confidence,
            "average_metadata": avg_metadata_confidence
        },
        "distributions": {
            "classifications": classification_dist,
            "pages": page_dist,
            "top_labels": dict(sorted_labels)
        },
        "deduplication": {
            "total_duplicates": duplicates,
            "unique_groups": unique_groups,
            "duplicate_ratio": duplicates / total if total > 0 else 0.0
        }
    }