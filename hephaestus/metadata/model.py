"""
Metadata models for component annotation and structured data representation.

This module defines the core data structures for storing component metadata
including labels, quantities, and evidence from text analysis.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass(frozen=True)
class ComponentMetadata:
    """
    Metadata for a single extracted component.
    
    Contains inferred information about the component including its label,
    quantity, and evidence supporting these inferences.
    """
    image_id: str                    # Unique identifier for the associated image
    page_index: int                  # Page where component was found
    label: Optional[str]             # Inferred component label/name
    quantity: Optional[int]          # Inferred quantity/count
    evidence: Dict[str, Any]         # Supporting evidence and analysis details
    
    def has_label(self) -> bool:
        """Check if component has an inferred label."""
        return self.label is not None and len(self.label.strip()) > 0
    
    def has_quantity(self) -> bool:
        """Check if component has an inferred quantity."""
        return self.quantity is not None and self.quantity > 0
    
    def is_complete(self) -> bool:
        """Check if component has both label and quantity."""
        return self.has_label() and self.has_quantity()
    
    def get_confidence_score(self) -> float:
        """
        Get overall confidence score for this metadata.
        
        Returns:
            Confidence score between 0.0 and 1.0
        """
        evidence = self.evidence or {}
        
        # Combine label and quantity confidence if available
        label_confidence = evidence.get("label_confidence", 0.0)
        quantity_confidence = evidence.get("quantity_confidence", 0.0)
        
        if self.has_label() and self.has_quantity():
            # Both available - average the confidences
            return (label_confidence + quantity_confidence) / 2.0
        elif self.has_label():
            # Only label available
            return label_confidence
        elif self.has_quantity():
            # Only quantity available  
            return quantity_confidence
        else:
            # Neither available
            return 0.0
    
    def get_summary(self) -> str:
        """Get human-readable summary of the metadata."""
        parts = []
        
        if self.has_quantity():
            parts.append(f"{self.quantity}x")
        
        if self.has_label():
            parts.append(self.label)
        else:
            parts.append("unknown")
        
        confidence = self.get_confidence_score()
        parts.append(f"(confidence: {confidence:.2f})")
        
        return " ".join(parts)