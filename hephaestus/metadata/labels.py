"""
Heuristic label extraction from nearby text spans.

This module implements rule-based label inference by analyzing text content
near extracted images to identify likely component names.
"""

import re
from typing import List, Tuple, Optional, Dict, Any

from ..text.spatial import TextSpan, bbox_distance
from ..logging import get_logger

logger = get_logger(__name__)

# Common stop phrases to ignore when selecting labels
STOP_PHRASES = {
    "setup", "example", "figure", "image", "picture", "photo", "diagram",
    "illustration", "see", "shown", "above", "below", "left", "right",
    "page", "chapter", "section", "part", "step", "note", "tip", "warning",
    "important", "remember", "don't", "do", "can", "will", "should", "must",
    "the", "and", "or", "but", "if", "then", "when", "where", "how", "why",
    "what", "who", "which", "that", "this", "these", "those", "a", "an",
    "in", "on", "at", "by", "for", "with", "without", "from", "to", "of",
    "as", "like", "than", "more", "less", "most", "least", "all", "some",
    "any", "no", "not", "only", "just", "even", "also", "too", "very",
    "quite", "rather", "pretty", "really", "truly", "actually", "basically"
}

# Patterns that suggest component-like text
COMPONENT_PATTERNS = [
    r'\b(card|token|tile|piece|marker|counter|die|dice|board|mat)\b',
    r'\b(meeple|worker|figure|pawn|cube|disc|cylinder)\b',
    r'\b(resource|coin|money|gold|silver|wood|stone|food)\b',
    r'\b(action|event|building|structure|upgrade|bonus)\b'
]

# Compiled regex patterns for efficiency
COMPONENT_REGEX = [re.compile(pattern, re.IGNORECASE) for pattern in COMPONENT_PATTERNS]


def infer_label(nearby: List[TextSpan]) -> Tuple[Optional[str], Dict[str, Any]]:
    """
    Infer a plausible label from nearby text spans.
    
    Args:
        nearby: List of TextSpan objects near the image
        
    Returns:
        Tuple of (label, evidence) where label is the inferred text
        and evidence contains analysis details
    """
    if not nearby:
        return None, {"reason": "no_nearby_text", "candidates": []}
    
    logger.debug(f"Analyzing {len(nearby)} nearby text spans for label inference")
    
    # Score and rank candidate spans
    candidates = []
    for span in nearby:
        score, reasons = _score_label_candidate(span)
        candidates.append({
            "span": span,
            "text": span.text,
            "score": score,
            "reasons": reasons,
            "source": span.source
        })
    
    # Sort by score (highest first)
    candidates.sort(key=lambda c: c["score"], reverse=True)
    
    # Select best candidate if score is above threshold
    evidence = {
        "candidates_considered": len(candidates),
        "candidates": candidates[:5],  # Keep top 5 for evidence
        "selection_method": "heuristic_scoring"
    }
    
    if candidates and candidates[0]["score"] > 0.3:
        best_candidate = candidates[0]
        label = _clean_label_text(best_candidate["text"])
        
        evidence.update({
            "selected_candidate": best_candidate,
            "label_confidence": min(best_candidate["score"], 1.0),
            "cleaning_applied": label != best_candidate["text"]
        })
        
        logger.debug(f"Selected label: '{label}' (score: {best_candidate['score']:.2f})")
        return label, evidence
    
    # No suitable candidate found
    evidence["reason"] = "no_suitable_candidate"
    evidence["label_confidence"] = 0.0
    
    logger.debug("No suitable label candidate found")
    return None, evidence


def _score_label_candidate(span: TextSpan) -> Tuple[float, List[str]]:
    """
    Score a text span as a potential component label.
    
    Args:
        span: TextSpan to evaluate
        
    Returns:
        Tuple of (score, reasons) where score is 0.0-1.0 and reasons explain scoring
    """
    text = span.text.strip().lower()
    reasons = []
    score = 0.0
    
    if not text:
        return 0.0, ["empty_text"]
    
    # Length-based scoring (prefer short, concise labels)
    word_count = len(text.split())
    if word_count == 1:
        score += 0.4
        reasons.append("single_word")
    elif word_count <= 3:
        score += 0.3
        reasons.append("short_phrase")
    elif word_count <= 6:
        score += 0.1
        reasons.append("medium_phrase")
    else:
        score -= 0.2
        reasons.append("long_phrase")
    
    # Check for stop phrases (penalize)
    if any(stop_word in text for stop_word in STOP_PHRASES):
        score -= 0.3
        reasons.append("contains_stop_words")
    
    # Check for purely numeric content (penalize)
    if re.match(r'^\d+$', text.strip()):
        score -= 0.4
        reasons.append("purely_numeric")
    
    # Check for component-related keywords (boost)
    for pattern in COMPONENT_REGEX:
        if pattern.search(text):
            score += 0.3
            reasons.append("component_keyword_match")
            break
    
    # Prefer span-level text over line-level (more precise)
    if span.source == "span":
        score += 0.1
        reasons.append("span_level_precision")
    elif span.source == "line":
        score += 0.05
        reasons.append("line_level")
    
    # Check for title case or proper formatting (slight boost)
    if text.istitle() or text.isupper():
        score += 0.1
        reasons.append("formatted_text")
    
    # Penalize very short text (likely fragments)
    if len(text) < 3:
        score -= 0.2
        reasons.append("very_short")
    
    # Penalize text with lots of punctuation (likely not a label)
    punct_ratio = sum(1 for c in text if not c.isalnum() and not c.isspace()) / len(text)
    if punct_ratio > 0.3:
        score -= 0.2
        reasons.append("high_punctuation")
    
    # Ensure score is in valid range
    score = max(0.0, min(1.0, score))
    
    return score, reasons


def _clean_label_text(text: str) -> str:
    """
    Clean and normalize label text.
    
    Args:
        text: Raw text to clean
        
    Returns:
        Cleaned label text
    """
    # Remove extra whitespace
    cleaned = re.sub(r'\s+', ' ', text.strip())
    
    # Remove common prefixes/suffixes
    cleaned = re.sub(r'^(the|a|an)\s+', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+(card|token|piece)s?$', '', cleaned, flags=re.IGNORECASE)
    
    # Remove trailing punctuation except for meaningful ones
    cleaned = re.sub(r'[.,;:!?]+$', '', cleaned)
    
    # Capitalize first letter
    if cleaned:
        cleaned = cleaned[0].upper() + cleaned[1:]
    
    return cleaned


def get_label_statistics(metadata_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate statistics about label inference performance.
    
    Args:
        metadata_list: List of metadata dictionaries with evidence
        
    Returns:
        Dictionary with label inference statistics
    """
    total = len(metadata_list)
    if total == 0:
        return {"total": 0, "with_labels": 0, "success_rate": 0.0}
    
    with_labels = sum(1 for m in metadata_list if m.get("label") is not None)
    
    # Confidence distribution
    confidences = [
        m.get("evidence", {}).get("label_confidence", 0.0) 
        for m in metadata_list if m.get("label") is not None
    ]
    
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    
    # Selection method distribution
    methods = {}
    for m in metadata_list:
        method = m.get("evidence", {}).get("selection_method", "unknown")
        methods[method] = methods.get(method, 0) + 1
    
    return {
        "total": total,
        "with_labels": with_labels,
        "success_rate": with_labels / total,
        "average_confidence": avg_confidence,
        "selection_methods": methods,
        "confidence_distribution": {
            "high": sum(1 for c in confidences if c >= 0.7),
            "medium": sum(1 for c in confidences if 0.4 <= c < 0.7),
            "low": sum(1 for c in confidences if c < 0.4)
        }
    }