"""
Hybrid classification model that orchestrates heuristic and vision signals.

This module combines deterministic heuristics with AI vision classification
to produce final component classification decisions.
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional, Literal
from enum import Enum

from ..pdf.images import ExtractedImage
from ..logging import get_logger
from .heuristics import classify_heuristic, calculate_confidence_score
from .vision import classify_with_vision, is_vision_available

logger = get_logger(__name__)


class ComponentType(Enum):
    """Enumeration of component types."""
    TOKEN = "token"
    CARD = "card"
    BOARD = "board"
    TILE = "tile"
    DIE = "die"
    MEEPLE = "meeple"
    ICON = "icon"
    DECORATIVE = "decorative"
    NON_COMPONENT = "non-component"
    UNKNOWN = "unknown"


@dataclass
class ClassificationResult:
    """Result of hybrid classification process."""
    label: str              # Primary classification label
    confidence: float       # Overall confidence score (0.0 to 1.0)
    source: Literal["heuristic", "vision", "hybrid"]  # Classification source
    signals: Dict[str, Any] # Complete signal dictionary
    component_type: Optional[ComponentType] = None
    
    def is_component(self) -> bool:
        """Return True if classified as a game component."""
        non_component_labels = {"icon", "decorative", "non-component", "unknown"}
        return self.label not in non_component_labels
    
    def get_primary_category(self) -> str:
        """Get primary category: 'component' or 'non-component'."""
        return "component" if self.is_component() else "non-component"


class HybridClassifier:
    """
    Hybrid classifier that combines heuristic and vision-based classification.
    
    Classification Strategy:
    1. Always run heuristics (fast, deterministic)
    2. Run vision if available and heuristics are low-confidence
    3. Merge signals using weighted combination
    4. Apply decision rules to determine final classification
    """
    
    def __init__(self, 
                 heuristic_threshold: float = 0.7,
                 vision_weight: float = 0.6,
                 enable_vision: bool = True):
        """
        Initialize hybrid classifier.
        
        Args:
            heuristic_threshold: Confidence threshold for heuristic-only decisions
            vision_weight: Weight given to vision signals in hybrid mode (0.0 to 1.0)
            enable_vision: Whether to use vision classification when available
        """
        self.heuristic_threshold = heuristic_threshold
        self.vision_weight = vision_weight
        self.enable_vision = enable_vision and is_vision_available()
        
        logger.info(f"HybridClassifier initialized: vision={'enabled' if self.enable_vision else 'disabled'}")
    
    def classify(self, image: ExtractedImage) -> ClassificationResult:
        """
        Classify an extracted image using hybrid approach.
        
        Args:
            image: ExtractedImage to classify
            
        Returns:
            ClassificationResult with final classification
        """
        logger.debug(f"Starting hybrid classification for {image.id}")
        
        # Step 1: Always run heuristics
        heuristic_signals = classify_heuristic(image)
        heuristic_confidence = calculate_confidence_score(heuristic_signals)
        
        # Step 2: Determine if vision is needed
        use_vision = (
            self.enable_vision and 
            heuristic_confidence < self.heuristic_threshold
        )
        
        vision_signals = {}
        if use_vision:
            logger.debug(f"Running vision classification for {image.id} (heuristic confidence: {heuristic_confidence:.2f})")
            vision_signals = classify_with_vision(image)
        
        # Step 3: Merge signals and make final decision
        return self._merge_and_decide(image, heuristic_signals, vision_signals)
    
    def _merge_and_decide(self, 
                         image: ExtractedImage,
                         heuristic_signals: Dict[str, Any], 
                         vision_signals: Dict[str, Any]) -> ClassificationResult:
        """Merge heuristic and vision signals to make final classification decision."""
        
        # Combine all signals
        all_signals = {
            "heuristic": heuristic_signals,
            "vision": vision_signals,
            "image_id": image.id,
            "dimensions": {"width": image.width, "height": image.height}
        }
        
        # Determine classification source and confidence
        heuristic_confidence = calculate_confidence_score(heuristic_signals)
        vision_confidence = vision_signals.get("confidence", 0.0)
        
        if not vision_signals:
            # Heuristic-only classification
            label = self._extract_heuristic_label(heuristic_signals)
            confidence = heuristic_confidence
            source = "heuristic"
            
        elif heuristic_confidence >= self.heuristic_threshold:
            # High-confidence heuristic dominates
            label = self._extract_heuristic_label(heuristic_signals)
            confidence = heuristic_confidence
            source = "heuristic"
            
        elif vision_confidence > heuristic_confidence:
            # Vision dominates when heuristics are uncertain
            label = vision_signals.get("vision_label", "unknown")
            confidence = vision_confidence
            source = "vision"
            
        else:
            # Hybrid weighted merge
            label, confidence = self._weighted_merge(heuristic_signals, vision_signals)
            source = "hybrid"
        
        # Map to component type
        component_type = self._map_to_component_type(label)
        
        result = ClassificationResult(
            label=label or "unknown",
            confidence=confidence,
            source=source,
            signals=all_signals,
            component_type=component_type
        )
        
        logger.debug(f"Classification result for {image.id}: {result.label} ({result.confidence:.2f}, {result.source})")
        return result
    
    def _extract_heuristic_label(self, signals: Dict[str, Any]) -> str:
        """Extract primary label from heuristic signals."""
        if signals.get("noise", False):
            return "non-component"
        elif signals.get("likely_board", False):
            return "board"
        elif signals.get("likely_card", False):
            return "card"
        elif signals.get("likely_token", False):
            return "token"
        elif signals.get("likely_icon", False):
            return "icon"
        else:
            return "unknown"
    
    def _weighted_merge(self, 
                       heuristic_signals: Dict[str, Any], 
                       vision_signals: Dict[str, Any]) -> tuple[str, float]:
        """Perform weighted merge of heuristic and vision signals."""
        
        heuristic_label = self._extract_heuristic_label(heuristic_signals)
        heuristic_confidence = calculate_confidence_score(heuristic_signals)
        
        vision_label = vision_signals.get("vision_label", "unknown")
        vision_confidence = vision_signals.get("confidence", 0.0)
        
        # Weighted confidence
        merged_confidence = (
            (1 - self.vision_weight) * heuristic_confidence +
            self.vision_weight * vision_confidence
        )
        
        # Label selection: prefer vision if significantly more confident
        if vision_confidence > heuristic_confidence + 0.2:
            merged_label = vision_label
        else:
            merged_label = heuristic_label
            
        return merged_label, merged_confidence
    
    def _map_to_component_type(self, label: str) -> Optional[ComponentType]:
        """Map classification label to ComponentType enum."""
        label_mapping = {
            "token": ComponentType.TOKEN,
            "card": ComponentType.CARD,
            "board": ComponentType.BOARD,
            "tile": ComponentType.TILE,
            "die": ComponentType.DIE,
            "meeple": ComponentType.MEEPLE,
            "icon": ComponentType.ICON,
            "decorative": ComponentType.DECORATIVE,
            "non-component": ComponentType.NON_COMPONENT,
            "unknown": ComponentType.UNKNOWN,
        }
        
        return label_mapping.get(label.lower())
    
    def classify_batch(self, images: list[ExtractedImage]) -> list[ClassificationResult]:
        """Classify a batch of images efficiently."""
        results = []
        
        logger.info(f"Starting batch classification of {len(images)} images")
        
        for image in images:
            try:
                result = self.classify(image)
                results.append(result)
            except Exception as exc:
                logger.error(f"Classification failed for {image.id}: {exc}")
                # Create fallback result
                fallback_result = ClassificationResult(
                    label="unknown",
                    confidence=0.0,
                    source="heuristic",
                    signals={"error": str(exc)},
                    component_type=ComponentType.UNKNOWN
                )
                results.append(fallback_result)
        
        # Log batch summary
        component_count = sum(1 for r in results if r.is_component())
        logger.info(f"Batch classification complete: {component_count}/{len(results)} classified as components")
        
        return results
    
    def get_classification_summary(self, results: list[ClassificationResult]) -> Dict[str, Any]:
        """Generate summary statistics from classification results."""
        if not results:
            return {"total": 0, "components": 0, "non_components": 0}
        
        total = len(results)
        components = sum(1 for r in results if r.is_component())
        non_components = total - components
        
        # Confidence statistics
        confidences = [r.confidence for r in results]
        avg_confidence = sum(confidences) / len(confidences)
        
        # Source breakdown
        sources = {}
        for result in results:
            sources[result.source] = sources.get(result.source, 0) + 1
        
        # Label distribution
        labels = {}
        for result in results:
            labels[result.label] = labels.get(result.label, 0) + 1
        
        return {
            "total": total,
            "components": components,
            "non_components": non_components,
            "component_ratio": components / total if total > 0 else 0,
            "average_confidence": avg_confidence,
            "sources": sources,
            "labels": labels
        }