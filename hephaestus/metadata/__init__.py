"""
HEPHAESTUS Metadata Binding

This module provides intelligent binding of text content to extracted images
to infer component labels, quantities, and other metadata.
"""

from .model import ComponentMetadata
from .annotator import annotate_components
from .labels import infer_label
from .quantity import infer_quantity

__all__ = [
    "ComponentMetadata",
    "annotate_components", 
    "infer_label",
    "infer_quantity",
]