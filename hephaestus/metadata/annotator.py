"""
Metadata annotator that binds text analysis to extracted images.

This module orchestrates the complete metadata inference process by combining
spatial text analysis with label and quantity extraction.
"""

from typing import List, Dict, Any

from ..pdf.images import ExtractedImage
from ..classifier.model import ClassificationResult
from ..text.index import SpatialTextIndex, SpatialQuery
from ..text.spatial import BBox
from .model import ComponentMetadata
from .labels import infer_label
from .quantity import infer_quantity
from ..logging import get_logger

logger = get_logger(__name__)


def annotate_components(
    images: List[ExtractedImage],
    classifier_results: Dict[str, ClassificationResult],
    text_index: SpatialTextIndex,
    expand: float = 24.0,
) -> List[ComponentMetadata]:
    """
    Annotate extracted images with metadata inferred from nearby text.
    
    Args:
        images: List of ExtractedImage objects to annotate
        classifier_results: Classification results keyed by image ID
        text_index: Spatial index of text spans for proximity queries
        expand: Expansion distance in points for text proximity queries
        
    Returns:
        List of ComponentMetadata objects with inferred labels and quantities
    """
    logger.info(f"Starting metadata annotation for {len(images)} images")
    
    metadata_list = []
    
    for image in images:
        try:
            metadata = _annotate_single_image(
                image, classifier_results, text_index, expand
            )
            metadata_list.append(metadata)
            
        except Exception as exc:
            logger.error(f"Failed to annotate image {image.id}: {exc}")
            # Create fallback metadata
            fallback_metadata = ComponentMetadata(
                image_id=image.id,
                page_index=image.page_index,
                label=None,
                quantity=None,
                evidence={"error": str(exc), "annotation_failed": True}
            )
            metadata_list.append(fallback_metadata)
    
    # Log summary statistics
    _log_annotation_summary(metadata_list)
    
    return metadata_list


def _annotate_single_image(
    image: ExtractedImage,
    classifier_results: Dict[str, ClassificationResult],
    text_index: SpatialTextIndex,
    expand: float
) -> ComponentMetadata:
    """Annotate a single image with metadata."""
    
    # Get classification result
    classification = classifier_results.get(image.id)
    
    # Check if we should annotate this image
    should_annotate = _should_annotate_image(image, classification)
    
    evidence = {
        "classification": classification.label if classification else "unknown",
        "classification_confidence": classification.confidence if classification else 0.0,
        "should_annotate": should_annotate,
        "expand_distance": expand
    }
    
    if not should_annotate:
        logger.debug(f"Skipping annotation for {image.id} (classification: {evidence['classification']})")
        return ComponentMetadata(
            image_id=image.id,
            page_index=image.page_index,
            label=None,
            quantity=None,
            evidence=evidence
        )
    
    # Get nearby text if image has bounding box
    if image.bbox is None:
        logger.debug(f"No bounding box available for {image.id}, cannot find nearby text")
        evidence["missing_bbox"] = True
        return ComponentMetadata(
            image_id=image.id,
            page_index=image.page_index,
            label=None,
            quantity=None,
            evidence=evidence
        )
    
    # Query nearby text
    query = SpatialQuery(
        page_index=image.page_index,
        bbox=image.bbox,
        expand=expand
    )
    
    nearby_spans = text_index.query(query)
    evidence["nearby_spans_found"] = len(nearby_spans)
    
    logger.debug(f"Found {len(nearby_spans)} nearby text spans for {image.id}")
    
    # Infer label from nearby text
    label, label_evidence = infer_label(nearby_spans)
    evidence["label_analysis"] = label_evidence
    
    # Infer quantity from nearby text
    quantity, quantity_evidence = infer_quantity(nearby_spans)
    evidence["quantity_analysis"] = quantity_evidence
    
    # Create metadata object
    metadata = ComponentMetadata(
        image_id=image.id,
        page_index=image.page_index,
        label=label,
        quantity=quantity,
        evidence=evidence
    )
    
    logger.debug(f"Annotated {image.id}: label='{label}', quantity={quantity}")
    
    return metadata


def _should_annotate_image(
    image: ExtractedImage,
    classification: ClassificationResult
) -> bool:
    """
    Determine if an image should be annotated based on its classification.
    
    Args:
        image: ExtractedImage to check
        classification: Classification result for the image
        
    Returns:
        True if image should be annotated, False otherwise
    """
    if classification is None:
        # No classification available - annotate conservatively
        return True
    
    # Skip non-components with high confidence
    if not classification.is_component() and classification.confidence > 0.7:
        return False
    
    # Skip obvious decorative elements
    if classification.label in ["icon", "decorative", "non-component"]:
        return False
    
    # Annotate everything else (components and uncertain classifications)
    return True


def _log_annotation_summary(metadata_list: List[ComponentMetadata]) -> None:
    """Log summary statistics about the annotation process."""
    total = len(metadata_list)
    if total == 0:
        return
    
    with_labels = sum(1 for m in metadata_list if m.has_label())
    with_quantities = sum(1 for m in metadata_list if m.has_quantity())
    complete = sum(1 for m in metadata_list if m.is_complete())
    
    # Calculate average confidence
    confidences = [m.get_confidence_score() for m in metadata_list]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    
    logger.info(f"Annotation summary:")
    logger.info(f"  Total images: {total}")
    logger.info(f"  With labels: {with_labels} ({with_labels/total*100:.1f}%)")
    logger.info(f"  With quantities: {with_quantities} ({with_quantities/total*100:.1f}%)")
    logger.info(f"  Complete (both): {complete} ({complete/total*100:.1f}%)")
    logger.info(f"  Average confidence: {avg_confidence:.2f}")


def get_annotation_statistics(metadata_list: List[ComponentMetadata]) -> Dict[str, Any]:
    """
    Generate comprehensive statistics about annotation results.
    
    Args:
        metadata_list: List of ComponentMetadata objects
        
    Returns:
        Dictionary with detailed annotation statistics
    """
    total = len(metadata_list)
    if total == 0:
        return {"total": 0}
    
    # Basic counts
    with_labels = sum(1 for m in metadata_list if m.has_label())
    with_quantities = sum(1 for m in metadata_list if m.has_quantity())
    complete = sum(1 for m in metadata_list if m.is_complete())
    
    # Confidence statistics
    confidences = [m.get_confidence_score() for m in metadata_list]
    avg_confidence = sum(confidences) / len(confidences)
    
    # Classification distribution
    classifications = {}
    for m in metadata_list:
        classification = m.evidence.get("classification", "unknown")
        classifications[classification] = classifications.get(classification, 0) + 1
    
    # Label distribution
    labels = {}
    for m in metadata_list:
        if m.has_label():
            labels[m.label] = labels.get(m.label, 0) + 1
    
    # Quantity distribution
    quantities = {}
    for m in metadata_list:
        if m.has_quantity():
            quantities[m.quantity] = quantities.get(m.quantity, 0) + 1
    
    # Error analysis
    errors = sum(1 for m in metadata_list if "error" in m.evidence)
    missing_bbox = sum(1 for m in metadata_list if m.evidence.get("missing_bbox", False))
    
    return {
        "total": total,
        "with_labels": with_labels,
        "with_quantities": with_quantities,
        "complete": complete,
        "label_success_rate": with_labels / total,
        "quantity_success_rate": with_quantities / total,
        "complete_success_rate": complete / total,
        "average_confidence": avg_confidence,
        "confidence_distribution": {
            "high": sum(1 for c in confidences if c >= 0.7),
            "medium": sum(1 for c in confidences if 0.4 <= c < 0.7),
            "low": sum(1 for c in confidences if c < 0.4)
        },
        "classification_distribution": classifications,
        "label_distribution": labels,
        "quantity_distribution": quantities,
        "error_analysis": {
            "annotation_errors": errors,
            "missing_bboxes": missing_bbox,
            "error_rate": errors / total
        }
    }