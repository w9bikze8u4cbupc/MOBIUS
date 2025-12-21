"""Public API for image deduplication."""

from pathlib import Path
from typing import Dict, List
import tempfile

from ..pdf.images import ExtractedImage
from ..output.manifest import ManifestItem
from .hash import compute_hashes, ImageHashes, HashComputationError
from .cluster import cluster_duplicates, DedupGroup
from ..logging import get_logger

logger = get_logger(__name__)


def deduplicate_images(
    images: List[ExtractedImage],
    manifest_items: List[ManifestItem],
    threshold: int = 8,
) -> Dict[str, DedupGroup]:
    """
    Deduplicate images using perceptual hashing.
    
    Args:
        images: List of extracted images
        manifest_items: List of manifest items (for file paths)
        threshold: Maximum hamming distance for considering images duplicates
        
    Returns:
        Mapping from image_id to DedupGroup (only for images that are duplicates)
    """
    if not images or not manifest_items:
        return {}
    
    # Create mapping from image_id to file path
    image_paths = {}
    for item in manifest_items:
        if item.image_id:
            image_paths[item.image_id] = item.file_path
    
    # Compute hashes for all images
    image_hashes: Dict[str, ImageHashes] = {}
    
    for image in images:
        if image.id not in image_paths:
            logger.warning(f"No file path found for image {image.id}, skipping deduplication")
            continue
            
        image_path = Path(image_paths[image.id])
        
        try:
            hashes = compute_hashes(image_path)
            image_hashes[image.id] = hashes
        except HashComputationError as exc:
            logger.warning(f"Failed to compute hashes for {image.id}: {exc}")
            continue
    
    if len(image_hashes) < 2:
        logger.info("Less than 2 images with valid hashes, no deduplication needed")
        return {}
    
    # Cluster duplicates
    groups = cluster_duplicates(image_hashes, threshold)
    
    # Create mapping from image_id to group
    result = {}
    for group in groups:
        for image_id in group.image_ids:
            result[image_id] = group
    
    logger.info(f"Found {len(groups)} duplicate groups covering {len(result)} images")
    return result