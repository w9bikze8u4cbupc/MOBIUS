"""
Phase 7 Corpus Analytics Runner

Deterministic analysis tool for multi-rulebook corpus analysis.
Ingests multiple export directories and produces structured analytics.

Usage:
    python -m hephaestus.analytics.corpus --input-dir eval/ --out analytics/phase_7/
"""

import json
import argparse
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import statistics

from .schema import (
    CorpusAnalytics, RulebookAnalytics, CorpusAggregates,
    RulebookIdentity, PdfCharacteristics, ExtractionOutcome,
    ClassificationOutcome, DeduplicationOutcome, TextExtractionOutcome,
    FailureTaxonomy, validate_corpus_analytics, SCHEMA_VERSION,
    CONFIDENCE_THRESHOLDS, SIZE_RANGES, CONFIDENCE_BINS, ANOMALY_SIGMA_THRESHOLD
)
from ..logging import get_logger

logger = get_logger(__name__)


class CorpusAnalyzer:
    """Deterministic corpus-level analytics engine."""
    
    def __init__(self, input_dir: Path, output_dir: Path):
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def analyze_corpus(self) -> CorpusAnalytics:
        """
        Analyze entire corpus and return structured analytics.
        
        Returns:
            Complete corpus analytics with per-rulebook and aggregate data
        """
        logger.info(f"Starting corpus analysis of {self.input_dir}")
        
        # Discover all rulebook export directories
        rulebook_dirs = self._discover_rulebook_directories()
        logger.info(f"Found {len(rulebook_dirs)} rulebook directories")
        
        # Analyze each rulebook
        rulebook_analytics = []
        for rb_dir in rulebook_dirs:
            try:
                rb_analytics = self._analyze_single_rulebook(rb_dir)
                rulebook_analytics.append(rb_analytics)
                logger.info(f"Analyzed {rb_analytics.identity.rulebook_id}")
            except Exception as exc:
                logger.error(f"Failed to analyze {rb_dir.name}: {exc}")
                continue
        
        # Compute corpus-wide aggregates
        corpus_aggregates = self._compute_corpus_aggregates(rulebook_analytics)
        
        # Create complete corpus analytics
        corpus_analytics = CorpusAnalytics(
            schema_version=SCHEMA_VERSION,
            analysis_timestamp=datetime.now(timezone.utc).isoformat(),
            input_directory=str(self.input_dir),
            rulebook_analytics=rulebook_analytics,
            corpus_aggregates=corpus_aggregates
        )
        
        # Validate analytics consistency
        validation_errors = validate_corpus_analytics(corpus_analytics)
        if validation_errors:
            logger.error(f"Analytics validation failed: {validation_errors}")
            raise ValueError(f"Analytics validation failed: {validation_errors}")
        
        logger.info(f"Corpus analysis complete: {len(rulebook_analytics)} rulebooks analyzed")
        return corpus_analytics
    
    def _discover_rulebook_directories(self) -> List[Path]:
        """Discover all valid rulebook export directories."""
        rulebook_dirs = []
        
        for item in self.input_dir.iterdir():
            if item.is_dir():
                # Check for required artifacts
                manifest_path = item / "manifest.json"
                log_path = item / "extraction_log.jsonl"
                
                if manifest_path.exists() and log_path.exists():
                    rulebook_dirs.append(item)
                else:
                    logger.debug(f"Skipping {item.name}: missing required artifacts")
        
        # Sort for deterministic ordering
        return sorted(rulebook_dirs, key=lambda p: p.name)

    
    def _analyze_single_rulebook(self, rulebook_dir: Path) -> RulebookAnalytics:
        """Analyze a single rulebook export directory."""
        # Load artifacts
        manifest = self._load_manifest(rulebook_dir)
        extraction_log = self._load_extraction_log(rulebook_dir)
        page_text_records = self._load_page_text(rulebook_dir)
        
        # Extract identity
        identity = self._extract_identity(manifest, rulebook_dir)
        
        # Analyze PDF characteristics
        pdf_chars = self._analyze_pdf_characteristics(manifest, page_text_records)
        
        # Analyze extraction outcome
        extraction_outcome = self._analyze_extraction(manifest, extraction_log)
        
        # Analyze classification
        classification_outcome = self._analyze_classification(manifest)
        
        # Analyze deduplication
        dedup_outcome = self._analyze_deduplication(manifest)
        
        # Analyze text extraction
        text_outcome = self._analyze_text_extraction(manifest, page_text_records)
        
        # Build failure taxonomy
        failure_taxonomy = self._build_failure_taxonomy(
            manifest, extraction_log, page_text_records
        )
        
        return RulebookAnalytics(
            identity=identity,
            pdf_characteristics=pdf_chars,
            extraction_outcome=extraction_outcome,
            classification_outcome=classification_outcome,
            deduplication_outcome=dedup_outcome,
            text_extraction_outcome=text_outcome,
            failure_taxonomy=failure_taxonomy,
            analysis_timestamp=datetime.now(timezone.utc).isoformat()
        )
    
    def _load_manifest(self, rulebook_dir: Path) -> Dict[str, Any]:
        """Load manifest.json from rulebook directory."""
        manifest_path = rulebook_dir / "manifest.json"
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _load_extraction_log(self, rulebook_dir: Path) -> List[Dict[str, Any]]:
        """Load extraction_log.jsonl from rulebook directory."""
        log_path = rulebook_dir / "extraction_log.jsonl"
        log_entries = []
        
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    log_entries.append(json.loads(line))
        
        return log_entries
    
    def _load_page_text(self, rulebook_dir: Path) -> Optional[List[Dict[str, Any]]]:
        """Load page_text.jsonl if it exists."""
        page_text_path = rulebook_dir / "page_text.jsonl"
        
        if not page_text_path.exists():
            return None
        
        records = []
        with open(page_text_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        
        return records
    
    def _extract_identity(self, manifest: Dict, rulebook_dir: Path) -> RulebookIdentity:
        """Extract rulebook identity from manifest."""
        source_pdf = manifest.get("source_pdf", "unknown")
        pdf_filename = Path(source_pdf).name if source_pdf != "unknown" else rulebook_dir.name
        
        return RulebookIdentity(
            rulebook_id=rulebook_dir.name,
            source_pdf_path=source_pdf,
            pdf_filename=pdf_filename,
            extraction_timestamp=manifest.get("extraction_timestamp", "unknown"),
            manifest_version=manifest.get("version", "unknown")
        )
    
    def _analyze_pdf_characteristics(
        self, manifest: Dict, page_text_records: Optional[List[Dict]]
    ) -> PdfCharacteristics:
        """Analyze PDF-level characteristics."""
        # Get page count from manifest summary
        page_distribution = manifest.get("summary", {}).get("distributions", {}).get("pages", {})
        page_count = len(page_distribution) if page_distribution else 0
        
        # Get total images
        total_images = manifest.get("total_items", 0)
        
        # Analyze text coverage
        has_text_artifacts = page_text_records is not None
        text_pages_count = 0
        image_only_pages_count = 0
        
        if page_text_records:
            for record in page_text_records:
                if len(record.get("blocks", [])) > 0:
                    text_pages_count += 1
                else:
                    image_only_pages_count += 1
        
        text_coverage_ratio = text_pages_count / page_count if page_count > 0 else 0.0
        avg_images_per_page = total_images / page_count if page_count > 0 else 0.0
        
        return PdfCharacteristics(
            page_count=page_count,
            total_images_found=total_images,
            has_text_artifacts=has_text_artifacts,
            text_pages_count=text_pages_count,
            image_only_pages_count=image_only_pages_count,
            text_coverage_ratio=text_coverage_ratio,
            avg_images_per_page=avg_images_per_page
        )
    
    def _analyze_extraction(
        self, manifest: Dict, extraction_log: List[Dict]
    ) -> ExtractionOutcome:
        """Analyze extraction outcomes with enhanced analytics."""
        health = manifest.get("extraction_health", {})
        
        # Basic metrics from health
        images_attempted = health.get("images_attempted", 0)
        images_saved = health.get("images_saved", 0)
        conversion_failures = health.get("conversion_failures", 0)
        success_rate = health.get("success_rate", 0.0)
        failure_rate = health.get("failure_rate", 0.0)
        colorspace_dist = health.get("colorspace_distribution", {})
        failure_reasons = health.get("failure_reasons", {})
        
        # Analyze failures by dimension
        failures_by_page = {}
        failures_by_colorspace = {}
        failures_by_size_range = {}
        failures_by_page_bucket = {"early": 0, "middle": 0, "late": 0}
        failed_image_ids = []
        
        # Get total pages for page bucket calculation
        page_distribution = manifest.get("summary", {}).get("distributions", {}).get("pages", {})
        total_pages = len(page_distribution) if page_distribution else 1
        
        for entry in extraction_log:
            if entry.get("status") == "failed":
                # Collect failed image IDs
                failed_image_ids.append(entry.get("image_id", "unknown"))
                
                # By page
                page_idx = entry.get("page_index", -1)
                failures_by_page[page_idx] = failures_by_page.get(page_idx, 0) + 1
                
                # By page bucket (early/middle/late)
                if page_idx >= 0:
                    page_ratio = page_idx / total_pages
                    if page_ratio < 0.33:
                        failures_by_page_bucket["early"] += 1
                    elif page_ratio < 0.67:
                        failures_by_page_bucket["middle"] += 1
                    else:
                        failures_by_page_bucket["late"] += 1
                
                # By colorspace
                colorspace = entry.get("colorspace_str", "unknown")
                failures_by_colorspace[colorspace] = failures_by_colorspace.get(colorspace, 0) + 1
                
                # By size range
                width = entry.get("width", 0)
                height = entry.get("height", 0)
                size = max(width, height)
                size_range = self._get_size_range(size)
                failures_by_size_range[size_range] = failures_by_size_range.get(size_range, 0) + 1
        
        # Zero silent drops proof
        silent_drops_proof = {
            "total_log_entries": len(extraction_log),
            "persisted_entries": sum(1 for e in extraction_log if e.get("status") == "persisted"),
            "failed_entries": sum(1 for e in extraction_log if e.get("status") == "failed"),
            "manifest_items": len(manifest.get("items", [])),
            "health_images_saved": images_saved,
            "health_conversion_failures": conversion_failures,
            "identity_verified": len(extraction_log) == images_attempted
        }
        
        # Enhanced failure analysis - pattern detection
        failure_patterns = {}
        if failed_image_ids:
            # Colorspace failure concentration
            total_failures = len(failed_image_ids)
            colorspace_concentration = {}
            for colorspace, count in failures_by_colorspace.items():
                concentration = count / total_failures if total_failures > 0 else 0
                if concentration > 0.5:  # More than 50% of failures
                    colorspace_concentration[colorspace] = concentration
            
            failure_patterns["colorspace_concentration"] = colorspace_concentration
            
            # Page clustering - detect if failures cluster in specific page ranges
            if failures_by_page:
                page_indices = list(failures_by_page.keys())
                if len(page_indices) > 1:
                    page_range = max(page_indices) - min(page_indices)
                    page_span_ratio = page_range / total_pages if total_pages > 0 else 0
                    failure_patterns["page_clustering"] = {
                        "span_ratio": page_span_ratio,
                        "is_clustered": page_span_ratio < 0.3 and len(page_indices) > 2
                    }
        
        # Failure severity distribution
        failure_severity_distribution = {"critical": 0, "moderate": 0, "minor": 0}
        for entry in extraction_log:
            if entry.get("status") == "failed":
                reason = entry.get("reason_code", "unknown")
                # Classify severity based on reason
                if reason in ["save_error", "conversion_error"]:
                    failure_severity_distribution["critical"] += 1
                elif reason in ["colorspace_error", "format_error"]:
                    failure_severity_distribution["moderate"] += 1
                else:
                    failure_severity_distribution["minor"] += 1
        
        return ExtractionOutcome(
            images_attempted=images_attempted,
            images_saved=images_saved,
            conversion_failures=conversion_failures,
            success_rate=success_rate,
            failure_rate=failure_rate,
            colorspace_distribution=colorspace_dist,
            failure_reasons=failure_reasons,
            failures_by_page=failures_by_page,
            failures_by_colorspace=failures_by_colorspace,
            failures_by_size_range=failures_by_size_range,
            failures_by_page_bucket=failures_by_page_bucket,
            silent_drops_proof=silent_drops_proof,
            failed_image_ids=failed_image_ids,
            failure_patterns=failure_patterns,
            failure_severity_distribution=failure_severity_distribution
        )
    
    def _analyze_classification(self, manifest: Dict, corpus_mean_confidence: float = None) -> ClassificationOutcome:
        """Analyze classification outcomes with enhanced analytics."""
        items = manifest.get("items", [])
        total_components = len(items)
        
        # Classification distribution
        classification_dist = {}
        confidences = []
        
        for item in items:
            classification = item.get("classification", "unknown")
            confidence = item.get("classification_confidence", 0.0)
            
            classification_dist[classification] = classification_dist.get(classification, 0) + 1
            confidences.append(confidence)
        
        # Confidence statistics
        if confidences:
            confidence_stats = {
                "min": min(confidences),
                "max": max(confidences),
                "mean": statistics.mean(confidences),
                "median": statistics.median(confidences),
                "std": statistics.stdev(confidences) if len(confidences) > 1 else 0.0
            }
        else:
            confidence_stats = {"min": 0, "max": 0, "mean": 0, "median": 0, "std": 0}
        
        # Confidence thresholds
        low_confidence_count = sum(1 for c in confidences if c < CONFIDENCE_THRESHOLDS["low"])
        high_confidence_count = sum(1 for c in confidences if c >= CONFIDENCE_THRESHOLDS["high"])
        unknown_count = classification_dist.get("unknown", 0)
        
        # Confidence by type
        confidence_by_type = {}
        for classification in classification_dist:
            type_confidences = [
                item.get("classification_confidence", 0.0)
                for item in items
                if item.get("classification") == classification
            ]
            if type_confidences:
                confidence_by_type[classification] = {
                    "min": min(type_confidences),
                    "max": max(type_confidences),
                    "mean": statistics.mean(type_confidences),
                    "count": len(type_confidences)
                }
        
        # Fixed-bin confidence histogram
        confidence_histogram = {}
        for bin_range in CONFIDENCE_BINS:
            confidence_histogram[bin_range] = 0
        
        for confidence in confidences:
            if confidence < 0.2:
                confidence_histogram["0.0-0.2"] += 1
            elif confidence < 0.4:
                confidence_histogram["0.2-0.4"] += 1
            elif confidence < 0.6:
                confidence_histogram["0.4-0.6"] += 1
            elif confidence < 0.8:
                confidence_histogram["0.6-0.8"] += 1
            else:
                confidence_histogram["0.8-1.0"] += 1
        
        # Low-confidence components with exact IDs
        low_confidence_components = []
        for item in items:
            confidence = item.get("classification_confidence", 0.0)
            if confidence < CONFIDENCE_THRESHOLDS["low"]:
                low_confidence_components.append({
                    "image_id": item.get("image_id", "unknown"),
                    "page_index": item.get("page_index", -1),
                    "classification": item.get("classification", "unknown"),
                    "confidence": confidence,
                    "bbox": item.get("bbox"),
                    "file_path": item.get("file_path", "unknown")
                })
        
        # Anomaly detection (if corpus mean is provided)
        is_anomalous = False
        anomaly_details = {}
        
        if corpus_mean_confidence is not None and len(confidences) > 0:
            mean_confidence = confidence_stats["mean"]
            deviation = abs(mean_confidence - corpus_mean_confidence)
            
            # Use 2σ threshold for anomaly detection
            if deviation > ANOMALY_SIGMA_THRESHOLD * confidence_stats["std"]:
                is_anomalous = True
                anomaly_details = {
                    "deviation_from_corpus_mean": deviation,
                    "corpus_mean_confidence": corpus_mean_confidence,
                    "rulebook_mean_confidence": mean_confidence,
                    "sigma_threshold": ANOMALY_SIGMA_THRESHOLD,
                    "anomaly_type": "confidence_deviation"
                }
        
        return ClassificationOutcome(
            total_components=total_components,
            classification_distribution=classification_dist,
            confidence_stats=confidence_stats,
            low_confidence_count=low_confidence_count,
            high_confidence_count=high_confidence_count,
            unknown_classification_count=unknown_count,
            confidence_by_type=confidence_by_type,
            confidence_histogram=confidence_histogram,
            low_confidence_components=low_confidence_components,
            is_anomalous=is_anomalous,
            anomaly_details=anomaly_details
        )
    
    def _analyze_deduplication(self, manifest: Dict) -> DeduplicationOutcome:
        """Analyze deduplication outcomes with enhanced analytics."""
        items = manifest.get("items", [])
        total_images = len(items)
        
        # Count canonicals and duplicates
        canonical_images = sum(1 for item in items if not item.get("is_duplicate", False))
        duplicate_images = sum(1 for item in items if item.get("is_duplicate", False))
        
        # Group analysis
        groups = {}
        for item in items:
            group_id = item.get("dedup_group_id")
            if group_id:
                if group_id not in groups:
                    groups[group_id] = []
                groups[group_id].append(item)
        
        dedup_groups_count = len(groups)
        duplicate_ratio = duplicate_images / total_images if total_images > 0 else 0.0
        avg_group_size = total_images / dedup_groups_count if dedup_groups_count > 0 else 0.0
        max_group_size = max(len(group) for group in groups.values()) if groups else 0
        
        # Group size distribution
        group_size_dist = {}
        for group in groups.values():
            size = len(group)
            group_size_dist[size] = group_size_dist.get(size, 0) + 1
        
        # Deduplication by component type
        dedup_by_type = {}
        for item in items:
            classification = item.get("classification", "unknown")
            if classification not in dedup_by_type:
                dedup_by_type[classification] = {"canonical": 0, "duplicate": 0}
            
            if item.get("is_duplicate", False):
                dedup_by_type[classification]["duplicate"] += 1
            else:
                dedup_by_type[classification]["canonical"] += 1
        
        # Cross-rulebook potential analysis (placeholder - would need corpus context)
        potential_cross_duplicates = []
        
        # Over/under-merging indicators
        over_splitting_indicators = []
        under_merging_indicators = []
        
        # Detect over-splitting: many singleton groups of same classification
        classification_singletons = {}
        for group in groups.values():
            if len(group) == 1:
                classification = group[0].get("classification", "unknown")
                classification_singletons[classification] = classification_singletons.get(classification, 0) + 1
        
        for classification, singleton_count in classification_singletons.items():
            if singleton_count > 5:  # Threshold for potential over-splitting
                over_splitting_indicators.append({
                    "classification": classification,
                    "singleton_count": singleton_count,
                    "potential_issue": "many_singletons_same_type"
                })
        
        # Detect under-merging: very large groups with mixed classifications
        for group_id, group in groups.items():
            if len(group) > 10:  # Threshold for large groups
                classifications = set(item.get("classification", "unknown") for item in group)
                if len(classifications) > 2:  # Mixed classifications in large group
                    under_merging_indicators.append({
                        "group_id": group_id,
                        "group_size": len(group),
                        "classification_count": len(classifications),
                        "classifications": list(classifications),
                        "potential_issue": "mixed_classifications_large_group"
                    })
        
        return DeduplicationOutcome(
            total_images=total_images,
            canonical_images=canonical_images,
            duplicate_images=duplicate_images,
            dedup_groups_count=dedup_groups_count,
            duplicate_ratio=duplicate_ratio,
            avg_group_size=avg_group_size,
            max_group_size=max_group_size,
            group_size_distribution=group_size_dist,
            dedup_by_type=dedup_by_type,
            potential_cross_duplicates=potential_cross_duplicates,
            over_splitting_indicators=over_splitting_indicators,
            under_merging_indicators=under_merging_indicators
        )
    
    def _analyze_text_extraction(
        self, manifest: Dict, page_text_records: Optional[List[Dict]]
    ) -> TextExtractionOutcome:
        """Analyze text extraction outcomes with enhanced analytics."""
        if not page_text_records:
            return TextExtractionOutcome(
                pages_with_text=0,
                pages_with_errors=0,
                total_text_blocks=0,
                avg_blocks_per_page=0.0,
                components_with_text=0,
                components_without_text=0,
                text_intersection_ratio=0.0,
                error_types={},
                pages_by_block_count={},
                text_confidence_correlation={},
                error_page_details=[],
                text_density_distribution={},
                intersection_quality_metrics={}
            )
        
        # Analyze page text records
        pages_with_text = 0
        pages_with_errors = 0
        total_text_blocks = 0
        error_types = {}
        pages_by_block_count = {"0": 0, "1-5": 0, "6-20": 0, "21+": 0}
        error_page_details = []
        text_density_distribution = {"low": 0, "medium": 0, "high": 0, "very_high": 0}
        
        for record in page_text_records:
            blocks = record.get("blocks", [])
            errors = record.get("errors", [])
            page_index = record.get("page_index", -1)
            
            if blocks:
                pages_with_text += 1
                total_text_blocks += len(blocks)
                
                # Categorize by block count
                block_count = len(blocks)
                if block_count == 0:
                    pages_by_block_count["0"] += 1
                elif block_count <= 5:
                    pages_by_block_count["1-5"] += 1
                    text_density_distribution["low"] += 1
                elif block_count <= 20:
                    pages_by_block_count["6-20"] += 1
                    text_density_distribution["medium"] += 1
                elif block_count <= 50:
                    pages_by_block_count["21+"] += 1
                    text_density_distribution["high"] += 1
                else:
                    pages_by_block_count["21+"] += 1
                    text_density_distribution["very_high"] += 1
            else:
                pages_by_block_count["0"] += 1
                text_density_distribution["low"] += 1
            
            if errors:
                pages_with_errors += 1
                error_page_details.append({
                    "page_index": page_index,
                    "error_count": len(errors),
                    "errors": errors,
                    "block_count": len(blocks)
                })
                
                for error in errors:
                    # Extract error type from error message
                    error_type = self._extract_error_type(error)
                    error_types[error_type] = error_types.get(error_type, 0) + 1
        
        avg_blocks_per_page = total_text_blocks / pages_with_text if pages_with_text > 0 else 0.0
        
        # Analyze component-text intersections with strict AABB intersection
        items = manifest.get("items", [])
        components_with_text = 0
        components_without_text = 0
        intersection_count = 0
        total_intersection_area = 0.0
        
        # Text-confidence correlation analysis
        text_confidence_correlation = {
            "with_text": {"0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0},
            "without_text": {"0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0}
        }
        
        for item in items:
            page_idx = item.get("page_index", -1)
            page_record = next((r for r in page_text_records if r.get("page_index") == page_idx), None)
            confidence = item.get("classification_confidence", 0.0)
            
            # Determine confidence bin
            if confidence < 0.2:
                conf_bin = "0.0-0.2"
            elif confidence < 0.4:
                conf_bin = "0.2-0.4"
            elif confidence < 0.6:
                conf_bin = "0.4-0.6"
            elif confidence < 0.8:
                conf_bin = "0.6-0.8"
            else:
                conf_bin = "0.8-1.0"
            
            # Check for text intersection using strict AABB
            has_text_intersection = False
            if page_record and page_record.get("blocks") and item.get("bbox"):
                component_bbox = item["bbox"]
                cx0, cy0, cx1, cy1 = component_bbox["x0"], component_bbox["y0"], component_bbox["x1"], component_bbox["y1"]
                
                for block in page_record["blocks"]:
                    tx0, ty0, tx1, ty1 = block["bbox"]
                    # Strict AABB intersection
                    if cx0 < tx1 and cx1 > tx0 and cy0 < ty1 and cy1 > ty0:
                        has_text_intersection = True
                        intersection_count += 1
                        # Calculate intersection area for quality metrics
                        ix0, iy0 = max(cx0, tx0), max(cy0, ty0)
                        ix1, iy1 = min(cx1, tx1), min(cy1, ty1)
                        intersection_area = (ix1 - ix0) * (iy1 - iy0)
                        total_intersection_area += intersection_area
                        break
            
            if has_text_intersection:
                components_with_text += 1
                text_confidence_correlation["with_text"][conf_bin] += 1
            else:
                components_without_text += 1
                text_confidence_correlation["without_text"][conf_bin] += 1
        
        total_components = len(items)
        text_intersection_ratio = components_with_text / total_components if total_components > 0 else 0.0
        
        # Intersection quality metrics
        intersection_quality_metrics = {
            "avg_intersection_area": total_intersection_area / intersection_count if intersection_count > 0 else 0.0,
            "intersection_coverage": intersection_count / total_components if total_components > 0 else 0.0,
            "text_density_score": total_text_blocks / len(page_text_records) if page_text_records else 0.0
        }
        
        return TextExtractionOutcome(
            pages_with_text=pages_with_text,
            pages_with_errors=pages_with_errors,
            total_text_blocks=total_text_blocks,
            avg_blocks_per_page=avg_blocks_per_page,
            components_with_text=components_with_text,
            components_without_text=components_without_text,
            text_intersection_ratio=text_intersection_ratio,
            error_types=error_types,
            pages_by_block_count=pages_by_block_count,
            text_confidence_correlation=text_confidence_correlation,
            error_page_details=error_page_details,
            text_density_distribution=text_density_distribution,
            intersection_quality_metrics=intersection_quality_metrics
        )
    
    def _build_failure_taxonomy(
        self, manifest: Dict, extraction_log: List[Dict], page_text_records: Optional[List[Dict]]
    ) -> FailureTaxonomy:
        """Build structured failure taxonomy."""
        extraction_failures = []
        classification_anomalies = []
        text_extraction_errors = []
        coverage_violations = []
        
        # Extraction failures from log
        for entry in extraction_log:
            if entry.get("status") == "failed":
                extraction_failures.append({
                    "failure_type": "extraction_failure",
                    "page_index": entry.get("page_index", -1),
                    "image_id": entry.get("image_id", "unknown"),
                    "error_details": entry.get("reason_code", "unknown"),
                    "artifact_source": "extraction_log.jsonl",
                    "colorspace": entry.get("colorspace_str", "unknown"),
                    "size": f"{entry.get('width', 0)}x{entry.get('height', 0)}"
                })
        
        # Classification anomalies
        items = manifest.get("items", [])
        for item in items:
            confidence = item.get("classification_confidence", 0.0)
            if confidence < CONFIDENCE_THRESHOLDS["low"]:
                classification_anomalies.append({
                    "failure_type": "low_confidence_classification",
                    "page_index": item.get("page_index", -1),
                    "image_id": item.get("image_id", "unknown"),
                    "error_details": f"Confidence {confidence:.3f} below threshold {CONFIDENCE_THRESHOLDS['low']}",
                    "artifact_source": "manifest.json",
                    "classification": item.get("classification", "unknown")
                })
        
        # Text extraction errors
        if page_text_records:
            for record in page_text_records:
                errors = record.get("errors", [])
                if errors:
                    for error in errors:
                        text_extraction_errors.append({
                            "failure_type": "text_extraction_error",
                            "page_index": record.get("page_index", -1),
                            "image_id": None,
                            "error_details": error,
                            "artifact_source": "page_text.jsonl"
                        })
        
        # Coverage violations (missing expected artifacts)
        text_artifacts = manifest.get("text_artifacts")
        if text_artifacts and text_artifacts.get("page_text_jsonl_path") and not page_text_records:
            coverage_violations.append({
                "failure_type": "missing_text_artifact",
                "page_index": -1,
                "image_id": None,
                "error_details": f"Manifest references {text_artifacts.get('page_text_jsonl_path')} but file not found",
                "artifact_source": "manifest.json"
            })
        
        return FailureTaxonomy(
            extraction_failures=extraction_failures,
            classification_anomalies=classification_anomalies,
            text_extraction_errors=text_extraction_errors,
            coverage_violations=coverage_violations
        )
    
    def _compute_corpus_aggregates(self, rulebook_analytics: List[RulebookAnalytics]) -> CorpusAggregates:
        """Compute corpus-wide aggregate metrics."""
        if not rulebook_analytics:
            return CorpusAggregates(
                total_rulebooks=0,
                total_pages=0,
                total_images_attempted=0,
                total_images_saved=0,
                total_conversion_failures=0,
                corpus_success_rate=0.0,
                corpus_failure_rate=0.0,
                success_rate_distribution={},
                failure_rate_distribution={},
                common_failure_reasons={},
                common_colorspaces={},
                classification_type_totals={},
                high_failure_rulebooks=[],
                low_text_coverage_rulebooks=[],
                anomalous_classification_rulebooks=[]
            )
        
        # Basic aggregates
        total_rulebooks = len(rulebook_analytics)
        total_pages = sum(rb.pdf_characteristics.page_count for rb in rulebook_analytics)
        total_images_attempted = sum(rb.extraction_outcome.images_attempted for rb in rulebook_analytics)
        total_images_saved = sum(rb.extraction_outcome.images_saved for rb in rulebook_analytics)
        total_conversion_failures = sum(rb.extraction_outcome.conversion_failures for rb in rulebook_analytics)
        
        corpus_success_rate = total_images_saved / total_images_attempted if total_images_attempted > 0 else 0.0
        corpus_failure_rate = total_conversion_failures / total_images_attempted if total_images_attempted > 0 else 0.0
        
        # Success/failure rate distributions
        success_rate_dist = {"0-20%": 0, "20-50%": 0, "50-80%": 0, "80-95%": 0, "95-100%": 0}
        failure_rate_dist = {"0-5%": 0, "5-20%": 0, "20-50%": 0, "50%+": 0}
        
        for rb in rulebook_analytics:
            success_rate = rb.extraction_outcome.success_rate
            failure_rate = rb.extraction_outcome.failure_rate
            
            # Categorize success rate
            if success_rate < 0.2:
                success_rate_dist["0-20%"] += 1
            elif success_rate < 0.5:
                success_rate_dist["20-50%"] += 1
            elif success_rate < 0.8:
                success_rate_dist["50-80%"] += 1
            elif success_rate < 0.95:
                success_rate_dist["80-95%"] += 1
            else:
                success_rate_dist["95-100%"] += 1
            
            # Categorize failure rate
            if failure_rate < 0.05:
                failure_rate_dist["0-5%"] += 1
            elif failure_rate < 0.2:
                failure_rate_dist["5-20%"] += 1
            elif failure_rate < 0.5:
                failure_rate_dist["20-50%"] += 1
            else:
                failure_rate_dist["50%+"] += 1
        
        # Common patterns across rulebooks
        common_failure_reasons = {}
        common_colorspaces = {}
        classification_type_totals = {}
        
        for rb in rulebook_analytics:
            # Aggregate failure reasons
            for reason, count in rb.extraction_outcome.failure_reasons.items():
                common_failure_reasons[reason] = common_failure_reasons.get(reason, 0) + count
            
            # Aggregate colorspaces
            for colorspace, count in rb.extraction_outcome.colorspace_distribution.items():
                common_colorspaces[colorspace] = common_colorspaces.get(colorspace, 0) + count
            
            # Aggregate classification types
            for classification, count in rb.classification_outcome.classification_distribution.items():
                classification_type_totals[classification] = classification_type_totals.get(classification, 0) + count
        
        # Identify outliers
        high_failure_rulebooks = [
            rb.identity.rulebook_id for rb in rulebook_analytics
            if rb.extraction_outcome.failure_rate > 0.2
        ]
        
        low_text_coverage_rulebooks = [
            rb.identity.rulebook_id for rb in rulebook_analytics
            if rb.pdf_characteristics.text_coverage_ratio < 0.5
        ]
        
        anomalous_classification_rulebooks = [
            rb.identity.rulebook_id for rb in rulebook_analytics
            if rb.classification_outcome.unknown_classification_count / rb.classification_outcome.total_components > 0.3
        ]
        
        return CorpusAggregates(
            total_rulebooks=total_rulebooks,
            total_pages=total_pages,
            total_images_attempted=total_images_attempted,
            total_images_saved=total_images_saved,
            total_conversion_failures=total_conversion_failures,
            corpus_success_rate=corpus_success_rate,
            corpus_failure_rate=corpus_failure_rate,
            success_rate_distribution=success_rate_dist,
            failure_rate_distribution=failure_rate_dist,
            common_failure_reasons=common_failure_reasons,
            common_colorspaces=common_colorspaces,
            classification_type_totals=classification_type_totals,
            high_failure_rulebooks=high_failure_rulebooks,
            low_text_coverage_rulebooks=low_text_coverage_rulebooks,
            anomalous_classification_rulebooks=anomalous_classification_rulebooks
        )
    
    def _get_size_range(self, size: int) -> str:
        """Categorize image size into range."""
        for range_name, (min_size, max_size) in SIZE_RANGES.items():
            if min_size <= size < max_size:
                return range_name
        return "unknown"
    
    def _extract_error_type(self, error_message: str) -> str:
        """Extract error type from error message."""
        error_lower = error_message.lower()
        if "no extractable text" in error_lower:
            return "no_extractable_text"
        elif "extraction error" in error_lower:
            return "extraction_error"
        elif "out of bounds" in error_lower:
            return "bbox_out_of_bounds"
        else:
            return "other"
    
    def save_analytics(self, analytics: CorpusAnalytics) -> Path:
        """Save corpus analytics to JSON file."""
        output_path = self.output_dir / "corpus_analytics.json"
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(analytics.to_dict(), f, indent=2, ensure_ascii=False)
        
        logger.info(f"Corpus analytics saved to {output_path}")
        return output_path
    
    def generate_reports(self, analytics: CorpusAnalytics) -> List[Path]:
        """Generate all analytics reports."""
        from .reports import generate_corpus_reports
        return generate_corpus_reports(analytics, self.output_dir)


def main():
    """CLI entry point for corpus analytics."""
    parser = argparse.ArgumentParser(description="HEPHAESTUS Corpus Analytics")
    parser.add_argument("--input-dir", type=Path, required=True,
                       help="Directory containing rulebook exports")
    parser.add_argument("--out", type=Path, required=True,
                       help="Output directory for analytics")
    parser.add_argument("--reports", action="store_true",
                       help="Generate markdown reports")
    
    args = parser.parse_args()
    
    # Run corpus analysis
    analyzer = CorpusAnalyzer(args.input_dir, args.out)
    analytics = analyzer.analyze_corpus()
    output_path = analyzer.save_analytics(analytics)
    
    # Generate reports if requested
    report_files = []
    if args.reports:
        report_files = analyzer.generate_reports(analytics)
        print(f"📋 Generated {len(report_files)} reports")
    
    print(f"✅ Corpus analysis complete!")
    print(f"📊 Analyzed {analytics.corpus_aggregates.total_rulebooks} rulebooks")
    print(f"📄 Total pages: {analytics.corpus_aggregates.total_pages}")
    print(f"🖼️  Total images: {analytics.corpus_aggregates.total_images_attempted}")
    print(f"💾 Success rate: {analytics.corpus_aggregates.corpus_success_rate:.2%}")
    print(f"📁 Output: {output_path}")
    if report_files:
        print(f"📋 Reports: {', '.join(f.name for f in report_files)}")


if __name__ == "__main__":
    main()
"""
Phase 7 Corpus Analytics Runner

Deterministic analysis tool for multi-rulebook corpus analysis.
Ingests multiple rulebook export directories and produces structured analytics.

Usage:
    python -m hephaestus.analytics.corpus --input-dir eval/ --out analytics/phase_7/
"""

import json
import statistics
from collections import defaultdict, Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

import typer

from .schema import (
    CorpusAnalytics, RulebookAnalytics, RulebookIdentity, PdfCharacteristics,
    ExtractionOutcome, ClassificationOutcome, DeduplicationOutcome,
    TextExtractionOutcome, FailureTaxonomy, CorpusAggregates,
    SCHEMA_VERSION, CONFIDENCE_THRESHOLDS, SIZE_RANGES, PAGE_BUCKETS,
    CONFIDENCE_BINS, ANOMALY_SIGMA_THRESHOLD,
    validate_corpus_analytics
)
from ..logging import get_logger

logger = get_logger(__name__)

app = typer.Typer(help="HEPHAESTUS Corpus Analytics", no_args_is_help=True)


@app.command()
def main(
    input_dir: Path = typer.Option(..., "--input-dir", help="Directory containing rulebook exports"),
    out: Path = typer.Option(..., "--out", help="Output directory for analytics"),
    reports: bool = typer.Option(False, "--reports", help="Generate markdown reports"),
    min_rulebooks: int = typer.Option(1, help="Minimum number of rulebooks required"),
) -> None:
    """
    Analyze corpus of rulebook extractions and generate analytics.
    
    Expected input structure:
    input_dir/
    ├── rulebook1/
    │   ├── manifest.json
    │   ├── extraction_log.jsonl
    │   └── page_text.jsonl (optional)
    ├── rulebook2/
    │   ├── manifest.json
    │   ├── extraction_log.jsonl
    │   └── page_text.jsonl (optional)
    └── ...
    """
    logger.info(f"Starting corpus analysis: {input_dir}")
    
    # Discover rulebook directories
    rulebook_dirs = discover_rulebook_directories(input_dir)
    
    if len(rulebook_dirs) < min_rulebooks:
        logger.error(f"Found {len(rulebook_dirs)} rulebooks, minimum required: {min_rulebooks}")
        raise typer.Exit(1)
    
    logger.info(f"Discovered {len(rulebook_dirs)} rulebook directories")
    
    # Analyze each rulebook
    rulebook_analytics = []
    for rulebook_dir in rulebook_dirs:
        try:
            logger.info(f"Analyzing rulebook: {rulebook_dir.name}")
            analytics = analyze_single_rulebook(rulebook_dir)
            rulebook_analytics.append(analytics)
            logger.info(f"Completed analysis: {analytics.identity.rulebook_id}")
        except Exception as exc:
            logger.error(f"Failed to analyze {rulebook_dir.name}: {exc}")
            continue
    
    if not rulebook_analytics:
        logger.error("No rulebooks successfully analyzed")
        raise typer.Exit(1)
    
    # Generate corpus-wide aggregates
    logger.info("Computing corpus aggregates")
    corpus_aggregates = compute_corpus_aggregates(rulebook_analytics)
    
    # Create corpus analytics
    corpus_analytics = CorpusAnalytics(
        schema_version=SCHEMA_VERSION,
        analysis_timestamp=datetime.now(timezone.utc).isoformat(),
        input_directory=str(input_dir),
        rulebook_analytics=rulebook_analytics,
        corpus_aggregates=corpus_aggregates
    )
    
    # Validate analytics
    logger.info("Validating corpus analytics")
    validation_errors = validate_corpus_analytics(corpus_analytics)
    if validation_errors:
        logger.error("Analytics validation failed:")
        for error in validation_errors:
            logger.error(f"  - {error}")
        raise typer.Exit(1)
    
    # Write analytics artifacts
    logger.info(f"Writing analytics to {out}")
    write_analytics_artifacts(corpus_analytics, out)
    
    # Generate reports if requested and analysis was successful
    if reports and len(rulebook_analytics) > 0:
        logger.info("Generating markdown reports")
        from .reports import generate_corpus_reports
        report_files = generate_corpus_reports(corpus_analytics, out)
        logger.info(f"Generated {len(report_files)} reports: {', '.join(f.name for f in report_files)}")
    elif reports:
        logger.warning("Reports requested but no rulebooks successfully analyzed - skipping report generation")
    
    logger.info("Corpus analysis complete")
    logger.info(f"Analyzed {len(rulebook_analytics)} rulebooks")
    logger.info(f"Total images: {corpus_aggregates.total_images_attempted}")
    logger.info(f"Success rate: {corpus_aggregates.corpus_success_rate:.2%}")


def discover_rulebook_directories(input_dir: Path) -> List[Path]:
    """
    Discover directories containing rulebook artifacts.
    
    A valid rulebook directory must contain:
    - manifest.json
    - extraction_log.jsonl
    """
    if not input_dir.exists():
        raise ValueError(f"Input directory does not exist: {input_dir}")
    
    rulebook_dirs = []
    for candidate in input_dir.iterdir():
        if not candidate.is_dir():
            continue
        
        manifest_path = candidate / "manifest.json"
        log_path = candidate / "extraction_log.jsonl"
        
        if manifest_path.exists() and log_path.exists():
            rulebook_dirs.append(candidate)
            logger.debug(f"Found valid rulebook directory: {candidate.name}")
        else:
            logger.debug(f"Skipping invalid directory: {candidate.name}")
    
    return sorted(rulebook_dirs)


def analyze_single_rulebook(rulebook_dir: Path) -> RulebookAnalytics:
    """Analyze a single rulebook directory and return structured analytics."""
    
    # Load artifacts
    manifest = load_manifest(rulebook_dir / "manifest.json")
    extraction_log = load_extraction_log(rulebook_dir / "extraction_log.jsonl")
    page_text_records = load_page_text_records(rulebook_dir / "page_text.jsonl")
    
    # Extract identity
    identity = extract_rulebook_identity(manifest, rulebook_dir)
    
    # Analyze PDF characteristics
    pdf_characteristics = analyze_pdf_characteristics(manifest, page_text_records)
    
    # Analyze extraction outcomes
    extraction_outcome = analyze_extraction_outcome(manifest, extraction_log)
    
    # Analyze classification outcomes
    classification_outcome = analyze_classification_outcome(manifest)
    
    # Analyze deduplication outcomes
    deduplication_outcome = analyze_deduplication_outcome(manifest)
    
    # Analyze text extraction outcomes
    text_extraction_outcome = analyze_text_extraction_outcome(manifest, page_text_records)
    
    # Build failure taxonomy
    failure_taxonomy = build_failure_taxonomy(manifest, extraction_log, page_text_records)
    
    return RulebookAnalytics(
        identity=identity,
        pdf_characteristics=pdf_characteristics,
        extraction_outcome=extraction_outcome,
        classification_outcome=classification_outcome,
        deduplication_outcome=deduplication_outcome,
        text_extraction_outcome=text_extraction_outcome,
        failure_taxonomy=failure_taxonomy,
        analysis_timestamp=datetime.now(timezone.utc).isoformat()
    )


def load_manifest(manifest_path: Path) -> Dict[str, Any]:
    """Load and parse manifest.json."""
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")
    
    with open(manifest_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_extraction_log(log_path: Path) -> List[Dict[str, Any]]:
    """Load and parse extraction_log.jsonl."""
    if not log_path.exists():
        raise FileNotFoundError(f"Extraction log not found: {log_path}")
    
    entries = []
    with open(log_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                entries.append(entry)
            except json.JSONDecodeError as exc:
                logger.warning(f"Invalid JSON on line {line_num} in {log_path}: {exc}")
    
    return entries


def load_page_text_records(page_text_path: Path) -> Dict[int, Dict[str, Any]]:
    """Load and parse page_text.jsonl if it exists."""
    if not page_text_path.exists():
        logger.debug(f"Page text file not found: {page_text_path}")
        return {}
    
    records = {}
    with open(page_text_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                page_index = record.get("page_index")
                if page_index is not None:
                    records[page_index] = record
            except json.JSONDecodeError as exc:
                logger.warning(f"Invalid JSON on line {line_num} in {page_text_path}: {exc}")
    
    return records


def extract_rulebook_identity(manifest: Dict[str, Any], rulebook_dir: Path) -> RulebookIdentity:
    """Extract rulebook identity from manifest."""
    source_pdf = manifest.get("source_pdf", "unknown")
    pdf_filename = Path(source_pdf).name if source_pdf != "unknown" else rulebook_dir.name
    
    # Use directory name as rulebook_id for traceability
    rulebook_id = rulebook_dir.name
    
    return RulebookIdentity(
        rulebook_id=rulebook_id,
        source_pdf_path=source_pdf,
        pdf_filename=pdf_filename,
        extraction_timestamp=manifest.get("extraction_timestamp", "unknown"),
        manifest_version=manifest.get("version", "unknown")
    )


def analyze_pdf_characteristics(manifest: Dict[str, Any], page_text_records: Dict[int, Dict[str, Any]]) -> PdfCharacteristics:
    """Analyze PDF-level characteristics."""
    items = manifest.get("items", [])
    total_images_found = len(items)
    
    # Calculate page count from items
    page_indices = set()
    for item in items:
        page_index = item.get("page_index")
        if page_index is not None:
            page_indices.add(page_index)
    
    page_count = len(page_indices) if page_indices else 1
    
    # Text coverage analysis
    has_text_artifacts = len(page_text_records) > 0
    text_pages_count = 0
    image_only_pages_count = 0
    
    if has_text_artifacts:
        for record in page_text_records.values():
            blocks = record.get("blocks", [])
            errors = record.get("errors", [])
            
            if blocks or not errors:  # Has text blocks OR no extraction errors
                text_pages_count += 1
            else:
                image_only_pages_count += 1
        
        # Account for pages not in text records
        missing_pages = page_count - len(page_text_records)
        image_only_pages_count += missing_pages
    else:
        # No text artifacts - assume all pages are image-only
        image_only_pages_count = page_count
    
    text_coverage_ratio = text_pages_count / page_count if page_count > 0 else 0.0
    avg_images_per_page = total_images_found / page_count if page_count > 0 else 0.0
    
    return PdfCharacteristics(
        page_count=page_count,
        total_images_found=total_images_found,
        has_text_artifacts=has_text_artifacts,
        text_pages_count=text_pages_count,
        image_only_pages_count=image_only_pages_count,
        text_coverage_ratio=text_coverage_ratio,
        avg_images_per_page=avg_images_per_page
    )


def analyze_extraction_outcome(manifest: Dict[str, Any], extraction_log: List[Dict[str, Any]]) -> ExtractionOutcome:
    """Analyze image extraction outcomes with enhanced failure analysis."""
    health = manifest.get("extraction_health", {})
    
    images_attempted = health.get("images_attempted", 0)
    images_saved = health.get("images_saved", 0)
    conversion_failures = health.get("conversion_failures", 0)
    
    success_rate = images_saved / images_attempted if images_attempted > 0 else 0.0
    failure_rate = conversion_failures / images_attempted if images_attempted > 0 else 0.0
    
    colorspace_distribution = health.get("colorspace_distribution", {})
    failure_reasons = health.get("failure_reasons", {})
    
    # Analyze failures by dimension
    failures_by_page = defaultdict(int)
    failures_by_colorspace = defaultdict(int)
    failures_by_size_range = defaultdict(int)
    failures_by_page_bucket = defaultdict(int)
    failed_image_ids = []
    
    # Calculate page buckets for this rulebook
    total_pages = len(set(entry.get("page_index", 0) for entry in extraction_log))
    
    for entry in extraction_log:
        if entry.get("status") == "failed":
            page_index = entry.get("page_index", -1)
            colorspace = entry.get("colorspace_str", "unknown")
            width = entry.get("width", 0)
            height = entry.get("height", 0)
            image_id = entry.get("image_id", "unknown")
            
            failures_by_page[page_index] += 1
            failures_by_colorspace[colorspace] += 1
            failed_image_ids.append(image_id)
            
            # Categorize by size
            max_dimension = max(width, height)
            size_range = "unknown"
            for range_name, (min_size, max_size) in SIZE_RANGES.items():
                if min_size <= max_dimension < max_size:
                    size_range = range_name
                    break
            failures_by_size_range[size_range] += 1
            
            # Categorize by page bucket (early/middle/late)
            if total_pages > 0:
                page_ratio = page_index / total_pages
                for bucket_name, (min_ratio, max_ratio) in PAGE_BUCKETS.items():
                    if min_ratio <= page_ratio < max_ratio:
                        failures_by_page_bucket[bucket_name] += 1
                        break
    
    # Zero silent drops proof
    silent_drops_proof = {
        "attempted": images_attempted,
        "saved": images_saved,
        "failed": conversion_failures,
        "identity_holds": images_attempted == images_saved + conversion_failures,
        "log_entries_count": len(extraction_log),
        "log_failed_count": len([e for e in extraction_log if e.get("status") == "failed"]),
        "log_saved_count": len([e for e in extraction_log if e.get("status") == "persisted"])
    }
    
    return ExtractionOutcome(
        images_attempted=images_attempted,
        images_saved=images_saved,
        conversion_failures=conversion_failures,
        success_rate=success_rate,
        failure_rate=failure_rate,
        colorspace_distribution=colorspace_distribution,
        failure_reasons=failure_reasons,
        failures_by_page=dict(failures_by_page),
        failures_by_colorspace=dict(failures_by_colorspace),
        failures_by_size_range=dict(failures_by_size_range),
        failures_by_page_bucket=dict(failures_by_page_bucket),
        silent_drops_proof=silent_drops_proof,
        failed_image_ids=failed_image_ids
    )

def analyze_classification_outcome(manifest: Dict[str, Any]) -> ClassificationOutcome:
    """Analyze classification outcomes."""
    items = manifest.get("items", [])
    total_components = len(items)
    
    if total_components == 0:
        return ClassificationOutcome(
            total_components=0,
            classification_distribution={},
            confidence_stats={},
            low_confidence_count=0,
            high_confidence_count=0,
            unknown_classification_count=0,
            confidence_by_type={}
        )
    
    # Classification distribution
    classification_distribution = Counter()
    confidences = []
    confidence_by_type = defaultdict(list)
    
    low_confidence_count = 0
    high_confidence_count = 0
    unknown_classification_count = 0
    
    for item in items:
        classification = item.get("classification", "unknown")
        confidence = item.get("classification_confidence", 0.0)
        
        classification_distribution[classification] += 1
        confidences.append(confidence)
        confidence_by_type[classification].append(confidence)
        
        if confidence < CONFIDENCE_THRESHOLDS["low"]:
            low_confidence_count += 1
        elif confidence > CONFIDENCE_THRESHOLDS["high"]:
            high_confidence_count += 1
        
        if classification == "unknown":
            unknown_classification_count += 1
    
    # Compute confidence statistics
    confidence_stats = {}
    if confidences:
        confidence_stats = {
            "min": min(confidences),
            "max": max(confidences),
            "mean": statistics.mean(confidences),
            "median": statistics.median(confidences),
            "std": statistics.stdev(confidences) if len(confidences) > 1 else 0.0
        }
    
    # Compute confidence stats by type
    confidence_by_type_stats = {}
    for classification, type_confidences in confidence_by_type.items():
        if type_confidences:
            confidence_by_type_stats[classification] = {
                "min": min(type_confidences),
                "max": max(type_confidences),
                "mean": statistics.mean(type_confidences),
                "median": statistics.median(type_confidences),
                "std": statistics.stdev(type_confidences) if len(type_confidences) > 1 else 0.0,
                "count": len(type_confidences)
            }
    
    return ClassificationOutcome(
        total_components=total_components,
        classification_distribution=dict(classification_distribution),
        confidence_stats=confidence_stats,
        low_confidence_count=low_confidence_count,
        high_confidence_count=high_confidence_count,
        unknown_classification_count=unknown_classification_count,
        confidence_by_type=confidence_by_type_stats
    )


def analyze_deduplication_outcome(manifest: Dict[str, Any]) -> DeduplicationOutcome:
    """Analyze deduplication outcomes."""
    items = manifest.get("items", [])
    total_images = len(items)
    
    if total_images == 0:
        return DeduplicationOutcome(
            total_images=0,
            canonical_images=0,
            duplicate_images=0,
            dedup_groups_count=0,
            duplicate_ratio=0.0,
            avg_group_size=0.0,
            max_group_size=0,
            group_size_distribution={},
            dedup_by_type={}
        )
    
    canonical_images = 0
    duplicate_images = 0
    group_sizes = defaultdict(int)
    dedup_by_type = defaultdict(lambda: {"canonical": 0, "duplicate": 0})
    
    # Group items by dedup_group_id
    groups = defaultdict(list)
    for item in items:
        is_duplicate = item.get("is_duplicate", False)
        classification = item.get("classification", "unknown")
        group_id = item.get("dedup_group_id")
        
        if is_duplicate:
            duplicate_images += 1
            dedup_by_type[classification]["duplicate"] += 1
        else:
            canonical_images += 1
            dedup_by_type[classification]["canonical"] += 1
        
        if group_id:
            groups[group_id].append(item)
    
    # Analyze group sizes
    group_size_distribution = defaultdict(int)
    max_group_size = 0
    
    for group_items in groups.values():
        size = len(group_items)
        group_size_distribution[size] += 1
        max_group_size = max(max_group_size, size)
    
    dedup_groups_count = len(groups)
    duplicate_ratio = duplicate_images / total_images if total_images > 0 else 0.0
    avg_group_size = total_images / dedup_groups_count if dedup_groups_count > 0 else 0.0
    
    return DeduplicationOutcome(
        total_images=total_images,
        canonical_images=canonical_images,
        duplicate_images=duplicate_images,
        dedup_groups_count=dedup_groups_count,
        duplicate_ratio=duplicate_ratio,
        avg_group_size=avg_group_size,
        max_group_size=max_group_size,
        group_size_distribution=dict(group_size_distribution),
        dedup_by_type={k: dict(v) for k, v in dedup_by_type.items()}
    )


def analyze_text_extraction_outcome(manifest: Dict[str, Any], page_text_records: Dict[int, Dict[str, Any]]) -> TextExtractionOutcome:
    """Analyze text extraction outcomes."""
    items = manifest.get("items", [])
    total_components = len(items)
    
    if not page_text_records:
        return TextExtractionOutcome(
            pages_with_text=0,
            pages_with_errors=0,
            total_text_blocks=0,
            avg_blocks_per_page=0.0,
            components_with_text=0,
            components_without_text=total_components,
            text_intersection_ratio=0.0,
            error_types={},
            pages_by_block_count={}
        )
    
    pages_with_text = 0
    pages_with_errors = 0
    total_text_blocks = 0
    error_types = defaultdict(int)
    pages_by_block_count = defaultdict(int)
    
    # Analyze page text records
    for record in page_text_records.values():
        blocks = record.get("blocks", [])
        errors = record.get("errors", [])
        
        block_count = len(blocks)
        total_text_blocks += block_count
        
        if blocks:
            pages_with_text += 1
        
        if errors:
            pages_with_errors += 1
            for error in errors:
                # Extract error type from error message
                error_type = "extraction_error"  # Default
                if "no extractable text" in error.lower():
                    error_type = "no_text_found"
                elif "out of bounds" in error.lower():
                    error_type = "bbox_out_of_bounds"
                error_types[error_type] += 1
        
        # Categorize by block count
        if block_count == 0:
            block_range = "no_blocks"
        elif block_count <= 10:
            block_range = "1-10_blocks"
        elif block_count <= 50:
            block_range = "11-50_blocks"
        else:
            block_range = "50+_blocks"
        
        pages_by_block_count[block_range] += 1
    
    avg_blocks_per_page = total_text_blocks / len(page_text_records) if page_text_records else 0.0
    
    # Analyze component-text intersections (simplified - would need actual intersection logic)
    components_with_text = 0
    components_without_text = 0
    
    # For now, estimate based on page coverage
    # In a full implementation, this would use the actual intersection logic from the UI
    for item in items:
        page_index = item.get("page_index")
        if page_index in page_text_records:
            record = page_text_records[page_index]
            if record.get("blocks"):
                components_with_text += 1
            else:
                components_without_text += 1
        else:
            components_without_text += 1
    
    text_intersection_ratio = components_with_text / total_components if total_components > 0 else 0.0
    
    return TextExtractionOutcome(
        pages_with_text=pages_with_text,
        pages_with_errors=pages_with_errors,
        total_text_blocks=total_text_blocks,
        avg_blocks_per_page=avg_blocks_per_page,
        components_with_text=components_with_text,
        components_without_text=components_without_text,
        text_intersection_ratio=text_intersection_ratio,
        error_types=dict(error_types),
        pages_by_block_count=dict(pages_by_block_count)
    )
def build_failure_taxonomy(manifest: Dict[str, Any], extraction_log: List[Dict[str, Any]], page_text_records: Dict[int, Dict[str, Any]]) -> FailureTaxonomy:
    """Build structured failure taxonomy."""
    extraction_failures = []
    classification_anomalies = []
    text_extraction_errors = []
    coverage_violations = []
    
    # Extraction failures from log
    for entry in extraction_log:
        if entry.get("status") == "failed":
            extraction_failures.append({
                "failure_type": "extraction_failure",
                "page_index": entry.get("page_index", -1),
                "image_id": entry.get("image_id", "unknown"),
                "error_details": entry.get("reason_code", "unknown"),
                "artifact_source": "extraction_log.jsonl",
                "colorspace": entry.get("colorspace_str", "unknown"),
                "dimensions": f"{entry.get('width', 0)}x{entry.get('height', 0)}"
            })
    
    # Classification anomalies
    items = manifest.get("items", [])
    for item in items:
        confidence = item.get("classification_confidence", 0.0)
        classification = item.get("classification", "unknown")
        
        if confidence < CONFIDENCE_THRESHOLDS["low"] or classification == "unknown":
            classification_anomalies.append({
                "failure_type": "low_confidence_classification",
                "page_index": item.get("page_index", -1),
                "image_id": item.get("image_id", "unknown"),
                "error_details": f"Classification: {classification}, Confidence: {confidence:.3f}",
                "artifact_source": "manifest.json",
                "classification": classification,
                "confidence": confidence
            })
    
    # Text extraction errors
    for page_index, record in page_text_records.items():
        errors = record.get("errors", [])
        for error in errors:
            text_extraction_errors.append({
                "failure_type": "text_extraction_error",
                "page_index": page_index,
                "image_id": None,
                "error_details": error,
                "artifact_source": "page_text.jsonl",
                "blocks_count": len(record.get("blocks", []))
            })
    
    # Coverage violations (expected artifacts missing)
    text_artifacts = manifest.get("text_artifacts")
    if text_artifacts and text_artifacts.get("page_text_jsonl_path"):
        # Text artifacts are expected but check for missing pages
        expected_pages = set()
        for item in items:
            expected_pages.add(item.get("page_index"))
        
        missing_pages = expected_pages - set(page_text_records.keys())
        for page_index in missing_pages:
            coverage_violations.append({
                "failure_type": "missing_page_text_record",
                "page_index": page_index,
                "image_id": None,
                "error_details": f"No page text record found for page {page_index}",
                "artifact_source": "page_text.jsonl",
                "expected_artifact": text_artifacts.get("page_text_jsonl_path")
            })
    
    return FailureTaxonomy(
        extraction_failures=extraction_failures,
        classification_anomalies=classification_anomalies,
        text_extraction_errors=text_extraction_errors,
        coverage_violations=coverage_violations
    )


def compute_corpus_aggregates(rulebook_analytics: List[RulebookAnalytics]) -> CorpusAggregates:
    """Compute corpus-wide aggregated metrics."""
    total_rulebooks = len(rulebook_analytics)
    total_pages = sum(rb.pdf_characteristics.page_count for rb in rulebook_analytics)
    total_images_attempted = sum(rb.extraction_outcome.images_attempted for rb in rulebook_analytics)
    total_images_saved = sum(rb.extraction_outcome.images_saved for rb in rulebook_analytics)
    total_conversion_failures = sum(rb.extraction_outcome.conversion_failures for rb in rulebook_analytics)
    
    corpus_success_rate = total_images_saved / total_images_attempted if total_images_attempted > 0 else 0.0
    corpus_failure_rate = total_conversion_failures / total_images_attempted if total_images_attempted > 0 else 0.0
    
    # Distribution analysis
    success_rate_distribution = defaultdict(int)
    failure_rate_distribution = defaultdict(int)
    
    for rb in rulebook_analytics:
        success_rate = rb.extraction_outcome.success_rate
        failure_rate = rb.extraction_outcome.failure_rate
        
        # Categorize success rates
        if success_rate >= 0.95:
            success_range = "95-100%"
        elif success_rate >= 0.80:
            success_range = "80-95%"
        elif success_rate >= 0.50:
            success_range = "50-80%"
        else:
            success_range = "<50%"
        success_rate_distribution[success_range] += 1
        
        # Categorize failure rates
        if failure_rate == 0:
            failure_range = "0%"
        elif failure_rate <= 0.05:
            failure_range = "0-5%"
        elif failure_rate <= 0.20:
            failure_range = "5-20%"
        else:
            failure_range = ">20%"
        failure_rate_distribution[failure_range] += 1
    
    # Cross-rulebook patterns
    common_failure_reasons = defaultdict(int)
    common_colorspaces = defaultdict(int)
    classification_type_totals = defaultdict(int)
    
    for rb in rulebook_analytics:
        # Aggregate failure reasons
        for reason, count in rb.extraction_outcome.failure_reasons.items():
            common_failure_reasons[reason] += count
        
        # Aggregate colorspaces
        for colorspace, count in rb.extraction_outcome.colorspace_distribution.items():
            common_colorspaces[colorspace] += count
        
        # Aggregate classification types
        for classification, count in rb.classification_outcome.classification_distribution.items():
            classification_type_totals[classification] += count
    
    # Identify outliers
    high_failure_rulebooks = []
    low_text_coverage_rulebooks = []
    anomalous_classification_rulebooks = []
    
    for rb in rulebook_analytics:
        if rb.extraction_outcome.failure_rate > 0.20:
            high_failure_rulebooks.append(rb.identity.rulebook_id)
        
        if rb.pdf_characteristics.text_coverage_ratio < 0.50:
            low_text_coverage_rulebooks.append(rb.identity.rulebook_id)
        
        # Anomalous classification: >50% unknown or very low average confidence
        unknown_ratio = rb.classification_outcome.unknown_classification_count / rb.classification_outcome.total_components if rb.classification_outcome.total_components > 0 else 0
        avg_confidence = rb.classification_outcome.confidence_stats.get("mean", 0.0)
        
        if unknown_ratio > 0.50 or avg_confidence < 0.30:
            anomalous_classification_rulebooks.append(rb.identity.rulebook_id)
    
    return CorpusAggregates(
        total_rulebooks=total_rulebooks,
        total_pages=total_pages,
        total_images_attempted=total_images_attempted,
        total_images_saved=total_images_saved,
        total_conversion_failures=total_conversion_failures,
        corpus_success_rate=corpus_success_rate,
        corpus_failure_rate=corpus_failure_rate,
        success_rate_distribution=dict(success_rate_distribution),
        failure_rate_distribution=dict(failure_rate_distribution),
        common_failure_reasons=dict(common_failure_reasons),
        common_colorspaces=dict(common_colorspaces),
        classification_type_totals=dict(classification_type_totals),
        high_failure_rulebooks=high_failure_rulebooks,
        low_text_coverage_rulebooks=low_text_coverage_rulebooks,
        anomalous_classification_rulebooks=anomalous_classification_rulebooks
    )


def write_analytics_artifacts(corpus_analytics: CorpusAnalytics, output_dir: Path) -> None:
    """Write analytics artifacts to output directory."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Write main corpus analytics JSON
    corpus_json_path = output_dir / "corpus_analytics.json"
    with open(corpus_json_path, 'w', encoding='utf-8') as f:
        json.dump(corpus_analytics.to_dict(), f, indent=2, ensure_ascii=False)
    
    logger.info(f"Wrote corpus analytics: {corpus_json_path}")
    
    # Write individual rulebook analytics
    rulebooks_dir = output_dir / "rulebooks"
    rulebooks_dir.mkdir(exist_ok=True)
    
    for rb in corpus_analytics.rulebook_analytics:
        rb_json_path = rulebooks_dir / f"{rb.identity.rulebook_id}.json"
        with open(rb_json_path, 'w', encoding='utf-8') as f:
            json.dump(rb.to_dict(), f, indent=2, ensure_ascii=False)
    
    logger.info(f"Wrote {len(corpus_analytics.rulebook_analytics)} individual rulebook analytics")


if __name__ == "__main__":
    app()