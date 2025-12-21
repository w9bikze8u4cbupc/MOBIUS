"""Perceptual hash computation for image deduplication."""

from dataclasses import dataclass
from pathlib import Path
from PIL import Image
import imagehash
from typing import Optional

from ..logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class ImageHashes:
    """Container for perceptual hashes of an image."""
    phash: imagehash.ImageHash
    dhash: Optional[imagehash.ImageHash] = None


class HashComputationError(Exception):
    """Raised when hash computation fails."""


def compute_hashes(image_path: Path, compute_dhash: bool = True) -> ImageHashes:
    """
    Load image from disk and compute perceptual hashes.
    
    Args:
        image_path: Path to image file
        compute_dhash: Whether to compute dhash in addition to phash
        
    Returns:
        ImageHashes containing computed hashes
        
    Raises:
        HashComputationError: If image cannot be loaded or hashes computed
    """
    try:
        # Load image
        with Image.open(image_path) as img:
            # Convert to RGB if needed for consistent hashing
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Compute perceptual hash (required)
            phash = imagehash.phash(img)
            
            # Compute difference hash (optional)
            dhash = imagehash.dhash(img) if compute_dhash else None
            
            logger.debug(f"Computed hashes for {image_path}: phash={phash}, dhash={dhash}")
            
            return ImageHashes(phash=phash, dhash=dhash)
            
    except Exception as exc:
        raise HashComputationError(f"Failed to compute hashes for {image_path}: {exc}") from exc