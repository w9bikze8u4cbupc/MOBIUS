"""
HEPHAESTUS Spatial Text Extraction

This module provides spatial text extraction capabilities for associating
text content with extracted images based on geometric proximity.
"""

from .spatial import TextSpan, BBox, extract_spatial_text
from .index import SpatialTextIndex, SpatialQuery

__all__ = [
    "TextSpan",
    "BBox", 
    "extract_spatial_text",
    "SpatialTextIndex",
    "SpatialQuery",
]