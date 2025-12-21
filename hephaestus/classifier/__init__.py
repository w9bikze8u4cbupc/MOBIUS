"""
HEPHAESTUS Hybrid Component Classifier

This module provides intelligent classification of extracted images to distinguish
between actual game components and decorative/layout elements.
"""

from .model import ClassificationResult, HybridClassifier
from .heuristics import classify_heuristic
from .vision import classify_with_vision

__all__ = [
    "ClassificationResult",
    "HybridClassifier", 
    "classify_heuristic",
    "classify_with_vision",
]