"""Clustering logic for grouping duplicate images."""

from dataclasses import dataclass
from typing import Dict, List, Tuple
from collections import defaultdict

from .hash import ImageHashes
from .distance import hamming_distance
from ..logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class DedupGroup:
    """A group of duplicate images with a canonical representative."""
    group_id: str
    image_ids: List[str]
    canonical_id: str


def cluster_duplicates(
    image_hashes: Dict[str, ImageHashes],
    threshold: int = 8
) -> List[DedupGroup]:
    """
    Group images into duplicate clusters using single-link clustering.
    
    Args:
        image_hashes: Mapping of image_id -> ImageHashes
        threshold: Maximum hamming distance for considering images duplicates
        
    Returns:
        List of DedupGroup objects
    """
    if not image_hashes:
        return []
    
    # Convert to list for easier processing
    image_items = list(image_hashes.items())
    n = len(image_items)
    
    # Union-Find data structure for clustering
    parent = list(range(n))
    
    def find(x: int) -> int:
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]
    
    def union(x: int, y: int) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py
    
    # Compare all pairs and union duplicates
    for i in range(n):
        for j in range(i + 1, n):
            image_id_i, hashes_i = image_items[i]
            image_id_j, hashes_j = image_items[j]
            
            # Use phash for primary comparison
            distance = hamming_distance(hashes_i.phash, hashes_j.phash)
            
            if distance <= threshold:
                union(i, j)
                logger.debug(f"Grouped {image_id_i} and {image_id_j} (distance: {distance})")
    
    # Group images by cluster
    clusters: Dict[int, List[Tuple[str, ImageHashes]]] = defaultdict(list)
    for i, (image_id, hashes) in enumerate(image_items):
        root = find(i)
        clusters[root].append((image_id, hashes))
    
    # Convert to DedupGroup objects
    groups = []
    group_counter = 1
    
    # Sort clusters by canonical ID for deterministic ordering
    sorted_clusters = sorted(clusters.values(), key=lambda cluster: min(img_id for img_id, _ in cluster))
    
    for cluster in sorted_clusters:
        if len(cluster) == 1:
            # Single image, no duplicates
            continue
            
        # Select canonical image (prefer largest resolution, then lexicographically smallest ID)
        canonical_id = _select_canonical(cluster)
        image_ids = [img_id for img_id, _ in cluster]
        
        group_id = f"dup_{group_counter:03d}"
        groups.append(DedupGroup(
            group_id=group_id,
            image_ids=sorted(image_ids),  # Sort for deterministic output
            canonical_id=canonical_id
        ))
        
        group_counter += 1
        logger.info(f"Created dedup group {group_id} with {len(image_ids)} images, canonical: {canonical_id}")
    
    return groups


def _select_canonical(cluster: List[Tuple[str, ImageHashes]]) -> str:
    """
    Select canonical image from a cluster.
    
    Selection criteria (in order):
    1. Lexicographically smallest image_id (for deterministic results)
    
    Args:
        cluster: List of (image_id, hashes) tuples
        
    Returns:
        ID of canonical image
    """
    # For now, use simple lexicographic ordering for deterministic results
    # In future, could consider image resolution, metadata confidence, etc.
    return min(img_id for img_id, _ in cluster)