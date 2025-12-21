"""Perceptual deduplication engine for extracted images."""

from .model import deduplicate_images, DedupGroup
from .hash import ImageHashes, compute_hashes
from .distance import hamming_distance
from .cluster import cluster_duplicates

__all__ = [
    "deduplicate_images",
    "DedupGroup", 
    "ImageHashes",
    "compute_hashes",
    "hamming_distance",
    "cluster_duplicates",
]