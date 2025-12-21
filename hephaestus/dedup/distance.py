"""Distance metrics for perceptual hash comparison."""

import imagehash
from typing import Optional

from .hash import ImageHashes


def hamming_distance(a: imagehash.ImageHash, b: imagehash.ImageHash) -> int:
    """
    Calculate Hamming distance between two perceptual hashes.
    
    Args:
        a: First hash
        b: Second hash
        
    Returns:
        Hamming distance (number of differing bits)
    """
    return a - b


def combined_distance(
    hashes_a: ImageHashes, 
    hashes_b: ImageHashes,
    phash_weight: float = 0.7,
    dhash_weight: float = 0.3
) -> float:
    """
    Calculate combined distance using weighted pHash + dHash.
    
    Args:
        hashes_a: First image hashes
        hashes_b: Second image hashes
        phash_weight: Weight for phash distance
        dhash_weight: Weight for dhash distance
        
    Returns:
        Combined weighted distance
    """
    # Always use phash distance
    phash_dist = hamming_distance(hashes_a.phash, hashes_b.phash)
    
    # Use dhash if available for both images
    if hashes_a.dhash is not None and hashes_b.dhash is not None:
        dhash_dist = hamming_distance(hashes_a.dhash, hashes_b.dhash)
        return phash_weight * phash_dist + dhash_weight * dhash_dist
    else:
        # Fall back to phash only
        return float(phash_dist)