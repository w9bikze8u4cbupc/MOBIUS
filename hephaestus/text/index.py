"""
Lightweight spatial index for fast proximity queries between images and text.

This module provides efficient spatial querying to find text spans near
extracted images based on bounding box intersection.
"""

from dataclasses import dataclass
from typing import List, Dict

from .spatial import TextSpan, BBox, bbox_intersects, bbox_expand, bbox_distance
from ..logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class SpatialQuery:
    """Query for finding text spans near a specific location."""
    page_index: int
    bbox: BBox
    expand: float  # padding in points/pixels


class SpatialTextIndex:
    """
    Spatial index for efficient text span proximity queries.
    
    Uses simple per-page organization with linear scanning for deterministic,
    reliable results. Can be optimized with spatial data structures later.
    """
    
    def __init__(self, spans: List[TextSpan]):
        """
        Initialize spatial index with text spans.
        
        Args:
            spans: List of TextSpan objects to index
        """
        self._spans_by_page: Dict[int, List[TextSpan]] = {}
        
        # Organize spans by page for efficient querying
        for span in spans:
            page_spans = self._spans_by_page.setdefault(span.page_index, [])
            page_spans.append(span)
        
        # Sort spans by distance from top-left for deterministic ordering
        for page_index in self._spans_by_page:
            self._spans_by_page[page_index].sort(
                key=lambda s: (s.bbox.y0, s.bbox.x0)
            )
        
        total_spans = len(spans)
        page_count = len(self._spans_by_page)
        logger.debug(f"Spatial index built: {total_spans} spans across {page_count} pages")
    
    def query(self, query: SpatialQuery) -> List[TextSpan]:
        """
        Find text spans that intersect with the expanded query bounding box.
        
        Args:
            query: SpatialQuery specifying location and expansion
            
        Returns:
            List of TextSpan objects that intersect with query area,
            sorted by distance from query center
        """
        page_spans = self._spans_by_page.get(query.page_index, [])
        if not page_spans:
            return []
        
        # Expand query bounding box
        expanded_bbox = bbox_expand(query.bbox, query.expand)
        
        # Find intersecting spans
        intersecting = []
        for span in page_spans:
            if bbox_intersects(span.bbox, expanded_bbox):
                intersecting.append(span)
        
        # Sort by distance from query center for consistent ordering
        query_center = query.bbox.center()
        intersecting.sort(key=lambda s: self._distance_to_point(s.bbox, query_center))
        
        logger.debug(f"Spatial query on page {query.page_index}: {len(intersecting)} spans found")
        return intersecting
    
    def query_nearest(self, query: SpatialQuery, max_results: int = 10) -> List[TextSpan]:
        """
        Find the nearest text spans to a query location.
        
        Args:
            query: SpatialQuery specifying location
            max_results: Maximum number of results to return
            
        Returns:
            List of nearest TextSpan objects, sorted by distance
        """
        page_spans = self._spans_by_page.get(query.page_index, [])
        if not page_spans:
            return []
        
        # Calculate distances to all spans on the page
        query_center = query.bbox.center()
        spans_with_distance = [
            (span, self._distance_to_point(span.bbox, query_center))
            for span in page_spans
        ]
        
        # Sort by distance and take top results
        spans_with_distance.sort(key=lambda x: x[1])
        nearest = [span for span, _ in spans_with_distance[:max_results]]
        
        logger.debug(f"Nearest query on page {query.page_index}: {len(nearest)} spans returned")
        return nearest
    
    def get_page_spans(self, page_index: int) -> List[TextSpan]:
        """Get all text spans for a specific page."""
        return self._spans_by_page.get(page_index, []).copy()
    
    def get_page_count(self) -> int:
        """Get number of pages with text spans."""
        return len(self._spans_by_page)
    
    def get_total_span_count(self) -> int:
        """Get total number of text spans in index."""
        return sum(len(spans) for spans in self._spans_by_page.values())
    
    def _distance_to_point(self, bbox: BBox, point: tuple[float, float]) -> float:
        """Calculate distance from bounding box center to a point."""
        center = bbox.center()
        dx = center[0] - point[0]
        dy = center[1] - point[1]
        return (dx * dx + dy * dy) ** 0.5
    
    def get_statistics(self) -> Dict[str, any]:
        """Get index statistics for debugging and monitoring."""
        stats = {
            "total_spans": self.get_total_span_count(),
            "page_count": self.get_page_count(),
            "spans_per_page": {},
            "source_distribution": {"span": 0, "line": 0, "block": 0}
        }
        
        for page_index, spans in self._spans_by_page.items():
            stats["spans_per_page"][page_index] = len(spans)
            
            # Count by source type
            for span in spans:
                stats["source_distribution"][span.source] += 1
        
        return stats