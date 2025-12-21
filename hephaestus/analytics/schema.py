"""
Phase 7 Canonical Corpus Analytics Schema

This module defines the normalized schema for corpus-level analytics.
All analytics are DERIVED from artifacts, never authoritative.

Schema Version: 1.0.0
"""

from dataclasses import dataclass, asdict, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class RulebookIdentity:
    """Canonical identification of a rulebook in the corpus."""
    rulebook_id: str                    # From manifest or PDF filename
    source_pdf_path: str               # Original PDF path
    pdf_filename: str                  # Just the filename for display
    extraction_timestamp: str          # When this rulebook was processed
    manifest_version: str              # Manifest format version


@dataclass(frozen=True)
class PdfCharacteristics:
    """PDF-level characteristics derived from artifacts."""
    page_count: int                    # Total pages in PDF
    total_images_found: int           # Images discovered during extraction
    has_text_artifacts: bool          # Whether page_text.jsonl exists
    text_pages_count: int             # Pages with extractable text
    image_only_pages_count: int       # Pages with no extractable text
    text_coverage_ratio: float        # text_pages / total_pages
    avg_images_per_page: float        # total_images / page_count


@dataclass(frozen=True)
class ExtractionOutcome:
    """Image extraction results for a single rulebook."""
    images_attempted: int             # From extraction_health.images_attempted
    images_saved: int                # From extraction_health.images_saved
    conversion_failures: int         # From extraction_health.conversion_failures
    success_rate: float              # images_saved / images_attempted
    failure_rate: float              # conversion_failures / images_attempted
    colorspace_distribution: Dict[str, int]  # From extraction_health
    failure_reasons: Dict[str, int]   # From extraction_health
    # Failure analysis by dimension
    failures_by_page: Dict[int, int]  # page_index -> failure_count
    failures_by_colorspace: Dict[str, int]  # colorspace -> failure_count
    failures_by_size_range: Dict[str, int]  # size_range -> failure_count
    failures_by_page_bucket: Dict[str, int] = field(default_factory=dict)  # early/middle/late -> failure_count
    # Zero silent drops proof
    silent_drops_proof: Dict[str, Any] = field(default_factory=dict)  # Invariant validation data
    # Failure drill-down identifiers
    failed_image_ids: List[str] = field(default_factory=list)       # Exact image IDs that failed
    # Enhanced failure analysis
    failure_patterns: Dict[str, Any] = field(default_factory=dict)  # Pattern analysis across dimensions
    failure_severity_distribution: Dict[str, int] = field(default_factory=dict)  # severity -> count


@dataclass(frozen=True)
class ClassificationOutcome:
    """Classification results for a single rulebook."""
    total_components: int             # Components classified
    classification_distribution: Dict[str, int]  # classification -> count
    confidence_stats: Dict[str, float]  # min, max, mean, median, std
    low_confidence_count: int         # Components below threshold (e.g., 0.6)
    high_confidence_count: int        # Components above threshold (e.g., 0.8)
    unknown_classification_count: int  # Components classified as "unknown"
    # Confidence distribution by classification type
    confidence_by_type: Dict[str, Dict[str, float]] = field(default_factory=dict)  # type -> {min, max, mean, etc.}
    # Fixed-bin confidence histogram
    confidence_histogram: Dict[str, int] = field(default_factory=dict)  # bin_range -> count (e.g., "0.0-0.2" -> 15)
    # Low-confidence clusters with exact IDs
    low_confidence_components: List[Dict[str, Any]] = field(default_factory=list)  # Component details below threshold
    # Anomaly detection
    is_anomalous: bool = False               # Deviates >2σ from corpus mean
    anomaly_details: Dict[str, Any] = field(default_factory=dict)  # Specific anomaly metrics


@dataclass(frozen=True)
class DeduplicationOutcome:
    """Deduplication results for a single rulebook."""
    total_images: int                 # Total images processed
    canonical_images: int            # Images marked as canonical
    duplicate_images: int            # Images marked as duplicates
    dedup_groups_count: int          # Number of deduplication groups
    duplicate_ratio: float           # duplicate_images / total_images
    avg_group_size: float            # total_images / dedup_groups_count
    max_group_size: int              # Largest deduplication group
    # Group size distribution
    group_size_distribution: Dict[int, int]  # group_size -> count
    # Deduplication by component type
    dedup_by_type: Dict[str, Dict[str, int]]  # type -> {canonical, duplicate}
    # Cross-rulebook potential analysis (flags only)
    potential_cross_duplicates: List[Dict[str, Any]] = field(default_factory=list)  # Flagged potential duplicates
    # Over/under-merging indicators
    over_splitting_indicators: List[Dict[str, Any]] = field(default_factory=list)  # Many singletons of same type
    under_merging_indicators: List[Dict[str, Any]] = field(default_factory=list)   # Very large groups with details


@dataclass(frozen=True)
class TextExtractionOutcome:
    """Text extraction results for a single rulebook."""
    pages_with_text: int             # Pages with extractable text
    pages_with_errors: int           # Pages with extraction errors
    total_text_blocks: int           # Sum of blocks across all pages
    avg_blocks_per_page: float       # total_blocks / pages_with_text
    components_with_text: int        # Components with intersecting text
    components_without_text: int     # Components with no intersecting text
    text_intersection_ratio: float   # components_with_text / total_components
    # Error analysis
    error_types: Dict[str, int] = field(default_factory=dict)      # error_type -> count
    pages_by_block_count: Dict[str, int] = field(default_factory=dict)  # block_count_range -> page_count
    # Text-classification correlation with strict AABB intersection
    text_confidence_correlation: Dict[str, Dict[str, int]] = field(default_factory=dict)  # text_presence -> confidence_bin -> count
    # Pages with errors (explicit visibility)
    error_page_details: List[Dict[str, Any]] = field(default_factory=list)  # Page-level error information
    # Enhanced text analysis
    text_density_distribution: Dict[str, int] = field(default_factory=dict)  # density_range -> page_count
    intersection_quality_metrics: Dict[str, float] = field(default_factory=dict)  # Quality metrics for bbox intersections


@dataclass(frozen=True)
class FailureTaxonomy:
    """Structured failure analysis for a single rulebook."""
    extraction_failures: List[Dict[str, Any]]  # Failed extractions with context
    classification_anomalies: List[Dict[str, Any]]  # Low confidence classifications
    text_extraction_errors: List[Dict[str, Any]]  # Text extraction failures
    coverage_violations: List[Dict[str, Any]]  # Missing expected artifacts
    # Each failure record includes:
    # - failure_type: str
    # - page_index: int
    # - image_id: str (if applicable)
    # - error_details: str
    # - artifact_source: str (which file/line)


@dataclass(frozen=True)
class RulebookAnalytics:
    """Complete analytics for a single rulebook."""
    identity: RulebookIdentity
    pdf_characteristics: PdfCharacteristics
    extraction_outcome: ExtractionOutcome
    classification_outcome: ClassificationOutcome
    deduplication_outcome: DeduplicationOutcome
    text_extraction_outcome: TextExtractionOutcome
    failure_taxonomy: FailureTaxonomy
    analysis_timestamp: str          # When this analysis was performed
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass(frozen=True)
class CorpusAggregates:
    """Corpus-wide aggregated metrics."""
    total_rulebooks: int
    total_pages: int
    total_images_attempted: int
    total_images_saved: int
    total_conversion_failures: int
    corpus_success_rate: float
    corpus_failure_rate: float
    
    # Distribution across rulebooks
    success_rate_distribution: Dict[str, int]  # rate_range -> rulebook_count
    failure_rate_distribution: Dict[str, int]  # rate_range -> rulebook_count
    
    # Cross-rulebook patterns
    common_failure_reasons: Dict[str, int]     # reason -> total_count
    common_colorspaces: Dict[str, int]         # colorspace -> total_count
    classification_type_totals: Dict[str, int] # type -> total_count
    
    # Outlier identification
    high_failure_rulebooks: List[str]         # rulebook_ids with >20% failure
    low_text_coverage_rulebooks: List[str]    # rulebook_ids with <50% text coverage
    anomalous_classification_rulebooks: List[str]  # unusual classification patterns


@dataclass(frozen=True)
class CorpusAnalytics:
    """Complete corpus-level analytics."""
    schema_version: str              # Analytics schema version
    analysis_timestamp: str         # When corpus analysis was performed
    input_directory: str            # Source directory analyzed
    rulebook_analytics: List[RulebookAnalytics]  # Per-rulebook results
    corpus_aggregates: CorpusAggregates         # Cross-rulebook aggregates
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)
    
    def get_rulebook_by_id(self, rulebook_id: str) -> Optional[RulebookAnalytics]:
        """Get analytics for a specific rulebook."""
        for rb in self.rulebook_analytics:
            if rb.identity.rulebook_id == rulebook_id:
                return rb
        return None


# Schema validation helpers
def validate_corpus_analytics(analytics: CorpusAnalytics) -> List[str]:
    """
    Validate corpus analytics for consistency and completeness.
    
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    
    # Aggregate consistency checks
    total_attempted = sum(rb.extraction_outcome.images_attempted 
                         for rb in analytics.rulebook_analytics)
    if analytics.corpus_aggregates.total_images_attempted != total_attempted:
        errors.append(f"Aggregate attempted mismatch: {analytics.corpus_aggregates.total_images_attempted} != {total_attempted}")
    
    total_saved = sum(rb.extraction_outcome.images_saved 
                     for rb in analytics.rulebook_analytics)
    if analytics.corpus_aggregates.total_images_saved != total_saved:
        errors.append(f"Aggregate saved mismatch: {analytics.corpus_aggregates.total_images_saved} != {total_saved}")
    
    # Per-rulebook validation
    for rb in analytics.rulebook_analytics:
        rb_errors = _validate_rulebook_analytics(rb)
        errors.extend([f"{rb.identity.rulebook_id}: {err}" for err in rb_errors])
    
    return errors


def _validate_rulebook_analytics(rb: RulebookAnalytics) -> List[str]:
    """Validate a single rulebook's analytics."""
    errors = []
    
    # Extraction outcome consistency
    attempted = rb.extraction_outcome.images_attempted
    saved = rb.extraction_outcome.images_saved
    failed = rb.extraction_outcome.conversion_failures
    
    if attempted != saved + failed:
        errors.append(f"Extraction identity violation: {attempted} != {saved} + {failed}")
    
    if attempted > 0:
        expected_success_rate = saved / attempted
        if abs(rb.extraction_outcome.success_rate - expected_success_rate) > 0.001:
            errors.append(f"Success rate mismatch: {rb.extraction_outcome.success_rate} != {expected_success_rate}")
    
    # Classification outcome consistency
    total_classified = sum(rb.classification_outcome.classification_distribution.values())
    if total_classified != rb.classification_outcome.total_components:
        errors.append(f"Classification count mismatch: {total_classified} != {rb.classification_outcome.total_components}")
    
    return errors


# Constants for analytics
SCHEMA_VERSION = "1.0.0"
CONFIDENCE_THRESHOLDS = {
    "low": 0.6,      # Explicit threshold for low confidence
    "high": 0.8      # Explicit threshold for high confidence
}
SIZE_RANGES = {
    "small": (0, 100),      # 0-100 pixels
    "medium": (100, 500),   # 100-500 pixels  
    "large": (500, 2000),   # 500-2000 pixels
    "xlarge": (2000, float('inf'))  # >2000 pixels
}
PAGE_BUCKETS = {
    "early": (0, 0.33),     # First third of pages
    "middle": (0.33, 0.67), # Middle third of pages
    "late": (0.67, 1.0)     # Last third of pages
}
CONFIDENCE_BINS = [
    "0.0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"
]
ANOMALY_SIGMA_THRESHOLD = 2.0  # Standard deviations for anomaly detection