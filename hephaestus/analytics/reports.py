"""
Phase 7 Evidence-Linked Markdown Report Generator

Generates human-readable reports from corpus analytics with complete evidence traceability.
All metrics link back to source artifacts and specific data points.

Report Types:
- analytics_overview.md: High-level corpus summary
- extraction_failures.md: Detailed failure analysis
- classification_analysis.md: Classification patterns and anomalies
- deduplication_report.md: Deduplication effectiveness analysis
- text_extraction_report.md: Text extraction coverage and quality
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any
from .schema import CorpusAnalytics, RulebookAnalytics


class AnalyticsReportGenerator:
    """Generate evidence-linked Markdown reports from corpus analytics."""
    
    def __init__(self, analytics: CorpusAnalytics, output_dir: Path):
        self.analytics = analytics
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_all_reports(self) -> List[Path]:
        """Generate all standard reports and return list of created files."""
        report_files = []
        
        # Generate each report type
        report_files.append(self.generate_analytics_overview())
        report_files.append(self.generate_extraction_failures_report())
        report_files.append(self.generate_classification_analysis())
        report_files.append(self.generate_deduplication_report())
        report_files.append(self.generate_text_extraction_report())
        
        return report_files
    
    def generate_analytics_overview(self) -> Path:
        """Generate high-level corpus analytics overview."""
        report_path = self.output_dir / "analytics_overview.md"
        
        content = f"""# Corpus Analytics Overview

**Analysis Timestamp:** {self.analytics.analysis_timestamp}  
**Schema Version:** {self.analytics.schema_version}  
**Source Directory:** `{self.analytics.input_directory}`

## Executive Summary

- **Total Rulebooks:** {self.analytics.corpus_aggregates.total_rulebooks}
- **Total Pages:** {self.analytics.corpus_aggregates.total_pages}
- **Total Images Processed:** {self.analytics.corpus_aggregates.total_images_attempted:,}
- **Overall Success Rate:** {self.analytics.corpus_aggregates.corpus_success_rate:.2%}
- **Total Failures:** {self.analytics.corpus_aggregates.total_conversion_failures:,}

## Rulebook Performance Summary

| Rulebook | Pages | Images | Success Rate | Failures | Text Coverage |
|----------|-------|--------|--------------|----------|---------------|
"""
        
        for rb in self.analytics.rulebook_analytics:
            content += f"| {rb.identity.rulebook_id} | {rb.pdf_characteristics.page_count} | {rb.extraction_outcome.images_attempted:,} | {rb.extraction_outcome.success_rate:.2%} | {rb.extraction_outcome.conversion_failures} | {rb.pdf_characteristics.text_coverage_ratio:.1%} |\n"
        
        content += f"""
## Success Rate Distribution

{self._format_distribution_table(self.analytics.corpus_aggregates.success_rate_distribution, "Success Rate Range", "Rulebook Count")}

## Common Failure Patterns

{self._format_failure_reasons_table()}

## Classification Distribution

{self._format_classification_distribution_table()}

## Evidence Traceability

All metrics in this report are derived from the following artifacts:
- **Source Analytics:** `{self.output_dir.parent / 'corpus_analytics.json'}`
- **Per-Rulebook Manifests:** `{{rulebook_dir}}/manifest.json`
- **Extraction Logs:** `{{rulebook_dir}}/extraction_log.jsonl`
- **Text Artifacts:** `{{rulebook_dir}}/page_text.jsonl` (where available)

## Anomalous Rulebooks

### High Failure Rate (>20%)
{self._format_anomalous_rulebooks(self.analytics.corpus_aggregates.high_failure_rulebooks, "extraction failures")}

### Low Text Coverage (<50%)
{self._format_anomalous_rulebooks(self.analytics.corpus_aggregates.low_text_coverage_rulebooks, "text coverage")}

### Unusual Classification Patterns
{self._format_anomalous_rulebooks(self.analytics.corpus_aggregates.anomalous_classification_rulebooks, "classification anomalies")}

---
*Report generated from corpus analytics schema v{self.analytics.schema_version}*
"""
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return report_path
    
    def generate_extraction_failures_report(self) -> Path:
        """Generate detailed extraction failures analysis."""
        report_path = self.output_dir / "extraction_failures.md"
        
        content = f"""# Extraction Failures Analysis

**Analysis Timestamp:** {self.analytics.analysis_timestamp}

## Corpus-Wide Failure Summary

- **Total Images Attempted:** {self.analytics.corpus_aggregates.total_images_attempted:,}
- **Total Failures:** {self.analytics.corpus_aggregates.total_conversion_failures:,}
- **Corpus Failure Rate:** {self.analytics.corpus_aggregates.corpus_failure_rate:.4%}

## Failure Reasons Distribution

{self._format_failure_reasons_table()}

## Per-Rulebook Failure Analysis

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.extraction_outcome.conversion_failures > 0:
                content += f"""### {rb.identity.rulebook_id}

**Source PDF:** `{rb.identity.source_pdf_path}`  
**Extraction Timestamp:** {rb.identity.extraction_timestamp}

- **Images Attempted:** {rb.extraction_outcome.images_attempted:,}
- **Failures:** {rb.extraction_outcome.conversion_failures}
- **Failure Rate:** {rb.extraction_outcome.failure_rate:.2%}

#### Failed Image IDs
{self._format_failed_image_ids(rb.extraction_outcome.failed_image_ids)}

#### Failure Patterns
{self._format_failure_patterns(rb.extraction_outcome.failure_patterns)}

#### Failures by Dimension

**By Colorspace:**
{self._format_dict_table(rb.extraction_outcome.failures_by_colorspace, "Colorspace", "Failure Count")}

**By Size Range:**
{self._format_dict_table(rb.extraction_outcome.failures_by_size_range, "Size Range", "Failure Count")}

**By Page Bucket:**
{self._format_dict_table(rb.extraction_outcome.failures_by_page_bucket, "Page Bucket", "Failure Count")}

#### Failure Severity Distribution
{self._format_dict_table(rb.extraction_outcome.failure_severity_distribution, "Severity", "Count")}

#### Zero Silent Drops Verification
{self._format_silent_drops_proof(rb.extraction_outcome.silent_drops_proof)}

---

"""
        
        if self.analytics.corpus_aggregates.total_conversion_failures == 0:
            content += """## ✅ No Extraction Failures Detected

All images in the corpus were successfully extracted and persisted.

"""
        
        content += f"""## Evidence Sources

All failure data is traceable to:
- **Extraction Logs:** `{{rulebook_dir}}/extraction_log.jsonl`
- **Manifest Health Metrics:** `{{rulebook_dir}}/manifest.json` → `extraction_health`
- **Analytics Source:** `{self.output_dir.parent / 'corpus_analytics.json'}`

Each failed image ID can be cross-referenced with its extraction log entry for complete failure context.

---
*Generated from {len(self.analytics.rulebook_analytics)} rulebook analytics*
"""
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return report_path
    
    def generate_classification_analysis(self) -> Path:
        """Generate classification patterns and anomalies report."""
        report_path = self.output_dir / "classification_analysis.md"
        
        content = f"""# Classification Analysis Report

**Analysis Timestamp:** {self.analytics.analysis_timestamp}

## Corpus-Wide Classification Summary

{self._format_classification_distribution_table()}

## Confidence Analysis

### Corpus Confidence Statistics

"""
        
        # Calculate corpus-wide confidence stats
        all_confidences = []
        for rb in self.analytics.rulebook_analytics:
            if rb.classification_outcome.confidence_stats['mean'] > 0:
                all_confidences.append(rb.classification_outcome.confidence_stats['mean'])
        
        if all_confidences:
            import statistics
            corpus_mean = statistics.mean(all_confidences)
            corpus_std = statistics.stdev(all_confidences) if len(all_confidences) > 1 else 0
            
            content += f"""- **Corpus Mean Confidence:** {corpus_mean:.3f}
- **Corpus Std Deviation:** {corpus_std:.3f}
- **Low Confidence Threshold:** 0.6
- **High Confidence Threshold:** 0.8

"""
        
        content += """### Per-Rulebook Confidence Analysis

| Rulebook | Mean Confidence | Low Confidence Count | High Confidence Count | Unknown Count |
|----------|-----------------|---------------------|----------------------|---------------|
"""
        
        for rb in self.analytics.rulebook_analytics:
            co = rb.classification_outcome
            content += f"| {rb.identity.rulebook_id} | {co.confidence_stats['mean']:.3f} | {co.low_confidence_count} | {co.high_confidence_count} | {co.unknown_classification_count} |\n"
        
        content += """
## Confidence Histogram Analysis

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.classification_outcome.low_confidence_count > 0:
                content += f"""### {rb.identity.rulebook_id}

**Confidence Distribution:**
{self._format_dict_table(rb.classification_outcome.confidence_histogram, "Confidence Range", "Component Count")}

"""
        
        content += """## Low Confidence Components

Components with confidence below 0.6 threshold:

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.classification_outcome.low_confidence_components:
                content += f"""### {rb.identity.rulebook_id}

| Image ID | Page | Classification | Confidence | File Path |
|----------|------|----------------|------------|-----------|
"""
                for comp in rb.classification_outcome.low_confidence_components[:10]:  # Limit to first 10
                    content += f"| {comp['image_id']} | {comp['page_index']} | {comp['classification']} | {comp['confidence']:.3f} | `{comp['file_path']}` |\n"
                
                if len(rb.classification_outcome.low_confidence_components) > 10:
                    content += f"\n*... and {len(rb.classification_outcome.low_confidence_components) - 10} more components*\n"
                
                content += "\n"
        
        content += """## Anomaly Detection

Rulebooks with classification patterns deviating >2σ from corpus mean:

"""
        
        anomalous_found = False
        for rb in self.analytics.rulebook_analytics:
            if rb.classification_outcome.is_anomalous:
                anomalous_found = True
                content += f"""### {rb.identity.rulebook_id} ⚠️

**Anomaly Details:**
{self._format_dict_as_list(rb.classification_outcome.anomaly_details)}

"""
        
        if not anomalous_found:
            content += "✅ No classification anomalies detected.\n\n"
        
        content += f"""## Evidence Sources

- **Component Classifications:** `{{rulebook_dir}}/manifest.json` → `items[].classification`
- **Confidence Scores:** `{{rulebook_dir}}/manifest.json` → `items[].classification_confidence`
- **Analytics Source:** `{self.output_dir.parent / 'corpus_analytics.json'}`

All low-confidence components can be inspected using their file paths and cross-referenced with manifest entries.

---
*Analysis covers {sum(rb.classification_outcome.total_components for rb in self.analytics.rulebook_analytics):,} total components*
"""
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return report_path
    
    def generate_deduplication_report(self) -> Path:
        """Generate deduplication effectiveness analysis."""
        report_path = self.output_dir / "deduplication_report.md"
        
        content = f"""# Deduplication Analysis Report

**Analysis Timestamp:** {self.analytics.analysis_timestamp}

## Corpus-Wide Deduplication Summary

"""
        
        total_images = sum(rb.deduplication_outcome.total_images for rb in self.analytics.rulebook_analytics)
        total_canonical = sum(rb.deduplication_outcome.canonical_images for rb in self.analytics.rulebook_analytics)
        total_duplicates = sum(rb.deduplication_outcome.duplicate_images for rb in self.analytics.rulebook_analytics)
        corpus_dedup_ratio = total_duplicates / total_images if total_images > 0 else 0
        
        content += f"""- **Total Images:** {total_images:,}
- **Canonical Images:** {total_canonical:,}
- **Duplicate Images:** {total_duplicates:,}
- **Corpus Deduplication Ratio:** {corpus_dedup_ratio:.2%}

## Per-Rulebook Deduplication Analysis

| Rulebook | Total Images | Canonical | Duplicates | Dedup Ratio | Groups | Avg Group Size | Max Group Size |
|----------|--------------|-----------|------------|-------------|--------|----------------|----------------|
"""
        
        for rb in self.analytics.rulebook_analytics:
            do = rb.deduplication_outcome
            content += f"| {rb.identity.rulebook_id} | {do.total_images:,} | {do.canonical_images:,} | {do.duplicate_images:,} | {do.duplicate_ratio:.2%} | {do.dedup_groups_count} | {do.avg_group_size:.1f} | {do.max_group_size} |\n"
        
        content += """
## Deduplication by Component Type

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.deduplication_outcome.duplicate_images > 0:
                content += f"""### {rb.identity.rulebook_id}

| Component Type | Canonical | Duplicates | Dedup Ratio |
|----------------|-----------|------------|-------------|
"""
                for comp_type, counts in rb.deduplication_outcome.dedup_by_type.items():
                    canonical = counts['canonical']
                    duplicates = counts['duplicate']
                    total_type = canonical + duplicates
                    type_ratio = duplicates / total_type if total_type > 0 else 0
                    content += f"| {comp_type} | {canonical} | {duplicates} | {type_ratio:.2%} |\n"
                
                content += "\n"
        
        content += """## Group Size Distribution Analysis

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.deduplication_outcome.dedup_groups_count > 0:
                content += f"""### {rb.identity.rulebook_id}

{self._format_dict_table(rb.deduplication_outcome.group_size_distribution, "Group Size", "Group Count")}

"""
        
        content += """## Quality Analysis

### Over-Splitting Indicators

Potential cases where similar components were not grouped together:

"""
        
        over_splitting_found = False
        for rb in self.analytics.rulebook_analytics:
            if rb.deduplication_outcome.over_splitting_indicators:
                over_splitting_found = True
                content += f"""#### {rb.identity.rulebook_id}

"""
                for indicator in rb.deduplication_outcome.over_splitting_indicators:
                    content += f"- **{indicator['classification']}:** {indicator['singleton_count']} singleton groups (potential over-splitting)\n"
                
                content += "\n"
        
        if not over_splitting_found:
            content += "✅ No over-splitting indicators detected.\n\n"
        
        content += """### Under-Merging Indicators

Potential cases where different components were incorrectly grouped:

"""
        
        under_merging_found = False
        for rb in self.analytics.rulebook_analytics:
            if rb.deduplication_outcome.under_merging_indicators:
                under_merging_found = True
                content += f"""#### {rb.identity.rulebook_id}

"""
                for indicator in rb.deduplication_outcome.under_merging_indicators:
                    content += f"- **Group {indicator['group_id']}:** {indicator['group_size']} components with {indicator['classification_count']} different classifications ({', '.join(indicator['classifications'])})\n"
                
                content += "\n"
        
        if not under_merging_found:
            content += "✅ No under-merging indicators detected.\n\n"
        
        content += f"""## Evidence Sources

- **Deduplication Groups:** `{{rulebook_dir}}/manifest.json` → `items[].dedup_group_id`
- **Canonical Flags:** `{{rulebook_dir}}/manifest.json` → `items[].is_duplicate`
- **Canonical References:** `{{rulebook_dir}}/manifest.json` → `items[].canonical_image_id`
- **Analytics Source:** `{self.output_dir.parent / 'corpus_analytics.json'}`

Each deduplication group can be inspected by filtering manifest items by `dedup_group_id`.

---
*Analysis covers {len(self.analytics.rulebook_analytics)} rulebooks with {total_images:,} total images*
"""
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return report_path
    
    def generate_text_extraction_report(self) -> Path:
        """Generate text extraction coverage and quality report."""
        report_path = self.output_dir / "text_extraction_report.md"
        
        content = f"""# Text Extraction Analysis Report

**Analysis Timestamp:** {self.analytics.analysis_timestamp}

## Corpus-Wide Text Extraction Summary

"""
        
        total_pages = sum(rb.pdf_characteristics.page_count for rb in self.analytics.rulebook_analytics)
        total_text_pages = sum(rb.text_extraction_outcome.pages_with_text for rb in self.analytics.rulebook_analytics)
        total_error_pages = sum(rb.text_extraction_outcome.pages_with_errors for rb in self.analytics.rulebook_analytics)
        total_text_blocks = sum(rb.text_extraction_outcome.total_text_blocks for rb in self.analytics.rulebook_analytics)
        
        content += f"""- **Total Pages:** {total_pages:,}
- **Pages with Text:** {total_text_pages:,}
- **Pages with Errors:** {total_error_pages:,}
- **Total Text Blocks:** {total_text_blocks:,}
- **Corpus Text Coverage:** {total_text_pages / total_pages * 100 if total_pages > 0 else 0:.1f}%

## Per-Rulebook Text Analysis

| Rulebook | Has Artifacts | Pages with Text | Error Pages | Text Blocks | Avg Blocks/Page | Text Coverage |
|----------|---------------|-----------------|-------------|-------------|-----------------|---------------|
"""
        
        for rb in self.analytics.rulebook_analytics:
            pc = rb.pdf_characteristics
            te = rb.text_extraction_outcome
            content += f"| {rb.identity.rulebook_id} | {'✅' if pc.has_text_artifacts else '❌'} | {te.pages_with_text} | {te.pages_with_errors} | {te.total_text_blocks:,} | {te.avg_blocks_per_page:.1f} | {pc.text_coverage_ratio:.1%} |\n"
        
        content += """
## Text Density Distribution

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.pdf_characteristics.has_text_artifacts:
                content += f"""### {rb.identity.rulebook_id}

**Block Count Distribution:**
{self._format_dict_table(rb.text_extraction_outcome.pages_by_block_count, "Block Count Range", "Page Count")}

**Text Density Distribution:**
{self._format_dict_table(rb.text_extraction_outcome.text_density_distribution, "Density Level", "Page Count")}

"""
        
        content += """## Component-Text Intersection Analysis

Analysis of spatial text intersection with component bounding boxes:

| Rulebook | Components with Text | Components without Text | Intersection Ratio |
|----------|---------------------|------------------------|-------------------|
"""
        
        for rb in self.analytics.rulebook_analytics:
            te = rb.text_extraction_outcome
            content += f"| {rb.identity.rulebook_id} | {te.components_with_text:,} | {te.components_without_text:,} | {te.text_intersection_ratio:.2%} |\n"
        
        content += """
## Text-Classification Confidence Correlation

Analysis of how text presence correlates with classification confidence:

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.pdf_characteristics.has_text_artifacts:
                content += f"""### {rb.identity.rulebook_id}

**Components WITH Text:**
{self._format_dict_table(rb.text_extraction_outcome.text_confidence_correlation.get('with_text', {}), "Confidence Range", "Component Count")}

**Components WITHOUT Text:**
{self._format_dict_table(rb.text_extraction_outcome.text_confidence_correlation.get('without_text', {}), "Confidence Range", "Component Count")}

"""
        
        content += """## Intersection Quality Metrics

"""
        
        for rb in self.analytics.rulebook_analytics:
            if rb.pdf_characteristics.has_text_artifacts:
                metrics = rb.text_extraction_outcome.intersection_quality_metrics
                content += f"""### {rb.identity.rulebook_id}

- **Average Intersection Area:** {metrics.get('avg_intersection_area', 0):.1f} sq pts
- **Intersection Coverage:** {metrics.get('intersection_coverage', 0):.2%}
- **Text Density Score:** {metrics.get('text_density_score', 0):.1f} blocks/page

"""
        
        content += """## Text Extraction Errors

Detailed analysis of text extraction failures:

"""
        
        errors_found = False
        for rb in self.analytics.rulebook_analytics:
            if rb.text_extraction_outcome.error_page_details:
                errors_found = True
                content += f"""### {rb.identity.rulebook_id}

**Error Types Distribution:**
{self._format_dict_table(rb.text_extraction_outcome.error_types, "Error Type", "Occurrence Count")}

**Pages with Errors:**

| Page Index | Error Count | Block Count | Errors |
|------------|-------------|-------------|--------|
"""
                for error_detail in rb.text_extraction_outcome.error_page_details[:10]:  # Limit to first 10
                    errors_str = "; ".join(error_detail['errors'][:2])  # First 2 errors
                    if len(error_detail['errors']) > 2:
                        errors_str += f" ... (+{len(error_detail['errors']) - 2} more)"
                    content += f"| {error_detail['page_index']} | {error_detail['error_count']} | {error_detail['block_count']} | {errors_str} |\n"
                
                if len(rb.text_extraction_outcome.error_page_details) > 10:
                    content += f"\n*... and {len(rb.text_extraction_outcome.error_page_details) - 10} more error pages*\n"
                
                content += "\n"
        
        if not errors_found:
            content += "✅ No text extraction errors detected.\n\n"
        
        content += f"""## Evidence Sources

- **Text Artifacts:** `{{rulebook_dir}}/page_text.jsonl` (where available)
- **Manifest References:** `{{rulebook_dir}}/manifest.json` → `text_artifacts`
- **Component Bboxes:** `{{rulebook_dir}}/manifest.json` → `items[].bbox`
- **Analytics Source:** `{self.output_dir.parent / 'corpus_analytics.json'}`

### Text Artifact Availability

"""
        
        for rb in self.analytics.rulebook_analytics:
            status = "✅ Available" if rb.pdf_characteristics.has_text_artifacts else "❌ Not Available"
            content += f"- **{rb.identity.rulebook_id}:** {status}\n"
        
        content += f"""
All text intersection analysis uses strict AABB (Axis-Aligned Bounding Box) intersection between component bboxes and text block bboxes from page_text.jsonl artifacts.

---
*Analysis covers {len(self.analytics.rulebook_analytics)} rulebooks with {total_pages:,} total pages*
"""
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return report_path
    
    # Helper methods for formatting
    
    def _format_distribution_table(self, distribution: Dict[str, int], key_header: str, value_header: str) -> str:
        """Format a distribution dictionary as a markdown table."""
        if not distribution:
            return "No data available.\n"
        
        content = f"| {key_header} | {value_header} |\n|---|---|\n"
        for key, value in distribution.items():
            content += f"| {key} | {value} |\n"
        return content
    
    def _format_dict_table(self, data: Dict[str, Any], key_header: str, value_header: str) -> str:
        """Format a dictionary as a markdown table."""
        if not data:
            return "No data available.\n"
        
        content = f"| {key_header} | {value_header} |\n|---|---|\n"
        for key, value in data.items():
            content += f"| {key} | {value} |\n"
        return content
    
    def _format_failure_reasons_table(self) -> str:
        """Format failure reasons distribution table."""
        return self._format_dict_table(
            self.analytics.corpus_aggregates.common_failure_reasons,
            "Failure Reason",
            "Total Count"
        )
    
    def _format_classification_distribution_table(self) -> str:
        """Format classification distribution table."""
        return self._format_dict_table(
            self.analytics.corpus_aggregates.classification_type_totals,
            "Classification Type",
            "Total Count"
        )
    
    def _format_anomalous_rulebooks(self, rulebook_ids: List[str], issue_type: str) -> str:
        """Format list of anomalous rulebooks."""
        if not rulebook_ids:
            return f"✅ No rulebooks with {issue_type} detected.\n"
        
        content = ""
        for rb_id in rulebook_ids:
            rb = next((rb for rb in self.analytics.rulebook_analytics if rb.identity.rulebook_id == rb_id), None)
            if rb:
                content += f"- **{rb_id}** (`{rb.identity.pdf_filename}`)\n"
        
        return content
    
    def _format_failed_image_ids(self, failed_ids: List[str]) -> str:
        """Format list of failed image IDs."""
        if not failed_ids:
            return "✅ No failed images.\n"
        
        if len(failed_ids) <= 10:
            return "- " + "\n- ".join(failed_ids) + "\n"
        else:
            content = "- " + "\n- ".join(failed_ids[:10]) + "\n"
            content += f"- *... and {len(failed_ids) - 10} more failed images*\n"
            return content
    
    def _format_failure_patterns(self, patterns: Dict[str, Any]) -> str:
        """Format failure patterns analysis."""
        if not patterns:
            return "No specific failure patterns detected.\n"
        
        content = ""
        for pattern_type, pattern_data in patterns.items():
            content += f"**{pattern_type.replace('_', ' ').title()}:**\n"
            if isinstance(pattern_data, dict):
                for key, value in pattern_data.items():
                    content += f"- {key}: {value}\n"
            else:
                content += f"- {pattern_data}\n"
            content += "\n"
        
        return content
    
    def _format_silent_drops_proof(self, proof: Dict[str, Any]) -> str:
        """Format silent drops verification data."""
        content = "**Zero Silent Drops Verification:**\n"
        for key, value in proof.items():
            formatted_key = key.replace('_', ' ').title()
            if isinstance(value, bool):
                value_str = "✅ Verified" if value else "❌ Failed"
            else:
                value_str = str(value)
            content += f"- {formatted_key}: {value_str}\n"
        
        return content
    
    def _format_dict_as_list(self, data: Dict[str, Any]) -> str:
        """Format dictionary as a bulleted list."""
        content = ""
        for key, value in data.items():
            formatted_key = key.replace('_', ' ').title()
            content += f"- **{formatted_key}:** {value}\n"
        return content


def generate_corpus_reports(analytics: CorpusAnalytics, output_dir: Path) -> List[Path]:
    """
    Generate all corpus analytics reports.
    
    Args:
        analytics: Complete corpus analytics data
        output_dir: Directory to write reports to
    
    Returns:
        List of generated report file paths
    """
    generator = AnalyticsReportGenerator(analytics, output_dir)
    return generator.generate_all_reports()
