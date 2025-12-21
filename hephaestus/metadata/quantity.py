"""
Heuristic quantity extraction from nearby text spans.

This module implements pattern-based quantity inference by analyzing text
content near extracted images to identify numerical quantities.
"""

import re
from typing import List, Tuple, Optional, Dict, Any

from ..text.spatial import TextSpan
from ..logging import get_logger

logger = get_logger(__name__)

# Quantity patterns to match
QUANTITY_PATTERNS = [
    # x3, 3x patterns
    (r'\bx(\d+)\b', 1),                    # "x3" -> group 1
    (r'\b(\d+)x\b', 1),                    # "3x" -> group 1
    
    # Parenthetical numbers
    (r'\((\d+)\)', 1),                     # "(3)" -> group 1
    
    # Multiplication symbols
    (r'×(\d+)\b', 1),                      # "×3" -> group 1
    (r'\b(\d+)×', 1),                      # "3×" -> group 1
    
    # Word-based patterns
    (r'\b(\d+)\s+(?:copies|cards?|tokens?|pieces?|items?|units?)\b', 1),  # "3 cards"
    (r'\b(?:copies|cards?|tokens?|pieces?|items?|units?)\s+(\d+)\b', 1),  # "cards 3"
    
    # Count/number patterns
    (r'\bcount:?\s*(\d+)\b', 1),           # "count: 3"
    (r'\bnumber:?\s*(\d+)\b', 1),          # "number: 3"
    (r'\bqty:?\s*(\d+)\b', 1),             # "qty: 3"
    (r'\bamount:?\s*(\d+)\b', 1),          # "amount: 3"
    
    # Range patterns (take first number)
    (r'\b(\d+)-\d+\b', 1),                 # "3-5" -> 3
    (r'\b(\d+)\s*to\s*\d+\b', 1),          # "3 to 5" -> 3
    
    # Simple standalone numbers (lower priority)
    (r'\b(\d+)\b', 1),                     # Any number
]

# Compile patterns for efficiency
COMPILED_PATTERNS = [(re.compile(pattern, re.IGNORECASE), group) for pattern, group in QUANTITY_PATTERNS]

# Maximum reasonable quantity (filter out page numbers, etc.)
MAX_REASONABLE_QUANTITY = 100


def infer_quantity(nearby: List[TextSpan]) -> Tuple[Optional[int], Dict[str, Any]]:
    """
    Infer quantity from nearby text patterns.
    
    Args:
        nearby: List of TextSpan objects near the image
        
    Returns:
        Tuple of (quantity, evidence) where quantity is the inferred number
        and evidence contains analysis details
    """
    if not nearby:
        return None, {"reason": "no_nearby_text", "matches": []}
    
    logger.debug(f"Analyzing {len(nearby)} nearby text spans for quantity inference")
    
    # Find all quantity matches across all spans
    all_matches = []
    for span in nearby:
        matches = _find_quantity_matches(span)
        all_matches.extend(matches)
    
    if not all_matches:
        return None, {
            "reason": "no_quantity_patterns_found",
            "spans_analyzed": len(nearby),
            "matches": [],
            "quantity_confidence": 0.0
        }
    
    # Score and rank matches
    scored_matches = []
    for match in all_matches:
        score = _score_quantity_match(match)
        scored_matches.append({**match, "score": score})
    
    # Sort by score (highest first)
    scored_matches.sort(key=lambda m: m["score"], reverse=True)
    
    # Select best match
    best_match = scored_matches[0]
    quantity = best_match["quantity"]
    
    evidence = {
        "matches_found": len(all_matches),
        "all_matches": scored_matches[:5],  # Keep top 5 for evidence
        "selected_match": best_match,
        "quantity_confidence": min(best_match["score"], 1.0),
        "selection_method": "pattern_scoring"
    }
    
    logger.debug(f"Selected quantity: {quantity} (score: {best_match['score']:.2f})")
    return quantity, evidence


def _find_quantity_matches(span: TextSpan) -> List[Dict[str, Any]]:
    """
    Find all quantity pattern matches in a text span.
    
    Args:
        span: TextSpan to analyze
        
    Returns:
        List of match dictionaries
    """
    matches = []
    text = span.text
    
    for pattern, group_idx in COMPILED_PATTERNS:
        for match in pattern.finditer(text):
            try:
                quantity_str = match.group(group_idx)
                quantity = int(quantity_str)
                
                # Filter out unreasonable quantities
                if 1 <= quantity <= MAX_REASONABLE_QUANTITY:
                    matches.append({
                        "quantity": quantity,
                        "pattern": pattern.pattern,
                        "matched_text": match.group(0),
                        "full_text": text,
                        "span": span,
                        "match_start": match.start(),
                        "match_end": match.end()
                    })
            except (ValueError, IndexError):
                continue
    
    return matches


def _score_quantity_match(match: Dict[str, Any]) -> float:
    """
    Score a quantity match based on pattern reliability and context.
    
    Args:
        match: Match dictionary from _find_quantity_matches
        
    Returns:
        Score between 0.0 and 1.0
    """
    score = 0.0
    pattern = match["pattern"]
    quantity = match["quantity"]
    matched_text = match["matched_text"].lower()
    full_text = match["full_text"].lower()
    
    # Pattern-based scoring (more specific patterns get higher scores)
    if r'x(\d+)' in pattern or r'(\d+)x' in pattern:
        score += 0.8  # "x3", "3x" - very reliable
    elif r'×(\d+)' in pattern or r'(\d+)×' in pattern:
        score += 0.8  # "×3", "3×" - very reliable
    elif r'\((\d+)\)' in pattern:
        score += 0.7  # "(3)" - quite reliable
    elif 'copies|cards|tokens|pieces|items|units' in pattern:
        score += 0.6  # "3 cards" - reliable with context
    elif 'count|number|qty|amount' in pattern:
        score += 0.5  # "count: 3" - moderately reliable
    elif r'(\d+)-\d+' in pattern or r'(\d+)\s*to\s*\d+' in pattern:
        score += 0.4  # "3-5", "3 to 5" - ranges are less certain
    else:
        score += 0.2  # Standalone numbers - least reliable
    
    # Quantity value scoring (prefer reasonable game quantities)
    if 2 <= quantity <= 10:
        score += 0.2  # Common game quantities
    elif quantity == 1:
        score += 0.1  # Single items are possible but less informative
    elif 11 <= quantity <= 20:
        score += 0.1  # Still reasonable
    elif quantity > 50:
        score -= 0.3  # Likely page numbers or other non-quantity numbers
    
    # Context scoring
    if any(word in full_text for word in ['card', 'token', 'piece', 'tile', 'die', 'dice']):
        score += 0.2  # Gaming context
    
    if any(word in full_text for word in ['page', 'chapter', 'section', 'figure']):
        score -= 0.3  # Document structure context (likely not quantities)
    
    # Span source scoring (prefer more precise text)
    span_source = match["span"].source
    if span_source == "span":
        score += 0.1
    elif span_source == "line":
        score += 0.05
    
    # Ensure score is in valid range
    return max(0.0, min(1.0, score))


def extract_all_quantities(nearby: List[TextSpan]) -> List[Dict[str, Any]]:
    """
    Extract all potential quantities from nearby text for analysis.
    
    Args:
        nearby: List of TextSpan objects to analyze
        
    Returns:
        List of all quantity matches with scores
    """
    all_matches = []
    for span in nearby:
        matches = _find_quantity_matches(span)
        for match in matches:
            score = _score_quantity_match(match)
            all_matches.append({**match, "score": score})
    
    # Sort by score
    all_matches.sort(key=lambda m: m["score"], reverse=True)
    return all_matches


def get_quantity_statistics(metadata_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate statistics about quantity inference performance.
    
    Args:
        metadata_list: List of metadata dictionaries with evidence
        
    Returns:
        Dictionary with quantity inference statistics
    """
    total = len(metadata_list)
    if total == 0:
        return {"total": 0, "with_quantities": 0, "success_rate": 0.0}
    
    with_quantities = sum(1 for m in metadata_list if m.get("quantity") is not None)
    
    # Confidence distribution
    confidences = [
        m.get("evidence", {}).get("quantity_confidence", 0.0)
        for m in metadata_list if m.get("quantity") is not None
    ]
    
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    
    # Quantity value distribution
    quantities = [m.get("quantity") for m in metadata_list if m.get("quantity") is not None]
    quantity_dist = {}
    for q in quantities:
        quantity_dist[q] = quantity_dist.get(q, 0) + 1
    
    # Pattern usage statistics
    patterns_used = {}
    for m in metadata_list:
        evidence = m.get("evidence", {})
        selected_match = evidence.get("selected_match", {})
        pattern = selected_match.get("pattern", "unknown")
        patterns_used[pattern] = patterns_used.get(pattern, 0) + 1
    
    return {
        "total": total,
        "with_quantities": with_quantities,
        "success_rate": with_quantities / total,
        "average_confidence": avg_confidence,
        "quantity_distribution": quantity_dist,
        "patterns_used": patterns_used,
        "confidence_distribution": {
            "high": sum(1 for c in confidences if c >= 0.7),
            "medium": sum(1 for c in confidences if 0.4 <= c < 0.7),
            "low": sum(1 for c in confidences if c < 0.4)
        }
    }