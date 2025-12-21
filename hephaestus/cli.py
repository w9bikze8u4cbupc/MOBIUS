from pathlib import Path
import sys
import os

import typer

# Ensure UTF-8 encoding for Windows compatibility
if sys.platform == "win32":
    # Set console output to UTF-8 on Windows
    os.environ["PYTHONIOENCODING"] = "utf-8"
    # Try to set console code page to UTF-8
    try:
        import subprocess
        subprocess.run(["chcp", "65001"], shell=True, capture_output=True)
    except Exception:
        pass  # Ignore if chcp fails

from .config import Settings
from .logging import get_logger
from .pdf.ingestion import EncryptedPdfError, PdfDocument, PdfOpenError
from .pdf.images import extract_embedded_images, save_images_flat
from .classifier.model import HybridClassifier
from .text.spatial import extract_spatial_text
from .text.index import SpatialTextIndex
from .text.page_text import extract_page_text_artifacts
from .metadata.annotator import annotate_components
from .dedup.model import deduplicate_images
from .output.manifest import build_manifest, write_manifest_json
from .output.package import package_exports

app = typer.Typer(help="HEPHAESTUS – board-game component extractor", no_args_is_help=True)

# Add analytics subcommand
from .analytics.corpus import app as analytics_app
app.add_typer(analytics_app, name="analytics", help="Corpus-level analytics commands")

# Phase 7: Add analytics subcommand
analytics_app = typer.Typer(help="Corpus-level analytics commands")
app.add_typer(analytics_app, name="analytics")


def safe_echo(message: str) -> None:
    """Echo message with Unicode fallback for Windows compatibility."""
    try:
        typer.echo(message)
    except UnicodeEncodeError:
        # Fallback: replace Unicode characters with ASCII equivalents
        fallback_message = (
            message.replace("✅", "[OK]")
            .replace("📄", "[PDF]")
            .replace("🖼️", "[IMG]")
            .replace("🎯", "[COMP]")
            .replace("🎨", "[ART]")
            .replace("🏷️", "[LBL]")
            .replace("🔢", "[QTY]")
            .replace("✨", "[META]")
            .replace("🔄", "[DUP]")
            .replace("📋", "[LIST]")
            .replace("📦", "[PKG]")
            .replace("📁", "[DIR]")
            .replace("🔍", "[FILT]")
            .replace("📊", "[STATS]")
        )
        try:
            typer.echo(fallback_message)
        except UnicodeEncodeError:
            # Ultimate fallback: print to stdout with error handling
            try:
                print(fallback_message)
            except UnicodeEncodeError:
                print("Output contains unsupported characters")


@app.command()
def extract(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, help="Path to the PDF file to process"),
    out: Path = typer.Option(Path("output"), "--out", "-o", help="Output directory for extracted images"),
    min_width: int = typer.Option(50, help="Minimum image width in pixels"),
    min_height: int = typer.Option(50, help="Minimum image height in pixels"),
    text_expand: float = typer.Option(24.0, help="Text proximity expansion distance in points"),
    write_manifest: bool = typer.Option(True, "--write-manifest/--no-write-manifest", help="Write JSON manifest file"),
    dedup: bool = typer.Option(True, "--dedup/--no-dedup", help="Enable perceptual deduplication"),
    dedup_threshold: int = typer.Option(8, help="Perceptual hash distance threshold for deduplication"),
    package: bool = typer.Option(True, "--package/--no-package", help="Enable structured output packaging"),
    export_mode: str = typer.Option("all", help="Export mode: 'all' or 'canonicals-only'"),
    include_non_components: bool = typer.Option(False, help="Include non-components in structured folders"),
) -> None:
    """
    Extract embedded images from a PDF and save them as PNG files.
    
    This command processes the specified PDF file, extracts all embedded raster images,
    applies size-based filtering, and saves the results to the output directory.
    """
    logger = get_logger(__name__)

    try:
        logger.info(f"Opening PDF: {pdf_path}")
        with PdfDocument(pdf_path) as doc:
            logger.info(f"Successfully opened PDF with {doc.page_count} pages")
            
            logger.info("Extracting embedded images...")
            images = extract_embedded_images(doc, min_width=min_width, min_height=min_height)
            
            if not images:
                logger.warning("No images found matching the specified criteria")
                logger.info("Try reducing --min-width and --min-height if you expected to find images")
                return

            # Phase 2: Add classification (non-destructive)
            logger.info("Classifying extracted images...")
            classifier = HybridClassifier(enable_vision=False)  # Vision disabled for Phase 2
            classification_results = classifier.classify_batch(images)
            
            # Create classification mapping for easier access
            classification_map = {result.signals["image_id"]: result for result in classification_results}
            
            # Log classification summary
            summary = classifier.get_classification_summary(classification_results)
            logger.info(f"Classification complete: {summary['components']}/{summary['total']} identified as components")
            
            # Phase 3: Add spatial text extraction and metadata annotation
            logger.info("Extracting spatial text...")
            text_spans = extract_spatial_text(doc)
            
            logger.info("Building spatial text index...")
            text_index = SpatialTextIndex(text_spans)
            
            logger.info("Annotating components with metadata...")
            metadata_list = annotate_components(images, classification_map, text_index, expand=text_expand)
            
            # Phase 6.2: Extract page text artifacts for Inspector UI
            logger.info("Extracting page text artifacts...")
            rulebook_id = pdf_path.stem if pdf_path else "unknown"
            page_text_path = extract_page_text_artifacts(doc, rulebook_id, out)
            logger.info(f"Page text artifacts written to: {page_text_path}")
            
            logger.info(f"Saving {len(images)} images to {out}")
            try:
                # Extract rulebook ID from PDF path for logging
                rulebook_id = pdf_path.stem if pdf_path else "unknown"
                path_mapping, health_metrics = save_images_flat(images, out, rulebook_id=rulebook_id)
                paths = list(path_mapping.values())  # Convert to list for backward compatibility
                logger.info(f"Successfully saved {len(paths)} images")
                
                # Log health metrics for Phase 5.6 visibility
                logger.info(f"Extraction health: {health_metrics.success_rate:.2%} success rate")
                if health_metrics.failure_rate > 0:
                    logger.warning(f"Conversion failures: {health_metrics.conversion_failures}/{health_metrics.images_attempted}")
                    logger.info(f"Colorspace distribution: {health_metrics.colorspace_distribution}")
                    logger.info(f"Failure reasons: {health_metrics.failure_reasons}")
                
                # Hard fail if extraction health is unacceptable (>20% failure rate)
                if health_metrics.failure_rate > 0.20:
                    logger.error(f"CRITICAL: Extraction failure rate {health_metrics.failure_rate:.2%} exceeds 20% threshold")
                    logger.error("This indicates a systemic colorspace handling issue")
                    raise typer.Exit(1)
                
                # Phase 4: Deduplicate images
                dedup_groups = {}
                if dedup:
                    logger.info("Deduplicating images...")
                    # Create temporary manifest items for deduplication
                    temp_manifest_items = []
                    for i, image in enumerate(images):
                        if i < len(paths):
                            from .output.manifest import ManifestItem
                            temp_item = ManifestItem(
                                image_id=image.id,
                                file_name=paths[i].name,
                                page_index=image.page_index,
                                classification="temp",
                                classification_confidence=0.0,
                                label=None,
                                quantity=None,
                                metadata_confidence=0.0,
                                dimensions={"width": image.width, "height": image.height},
                                bbox=None,
                                dedup_group_id=None,
                                is_duplicate=False,
                                canonical_image_id=image.id,
                                file_path=str(paths[i])
                            )
                            temp_manifest_items.append(temp_item)
                    
                    dedup_groups = deduplicate_images(images, temp_manifest_items, threshold=dedup_threshold)
                    
                    duplicate_count = sum(1 for group in dedup_groups.values() if len(group.image_ids) > 1)
                    logger.info(f"Deduplication complete: found {duplicate_count} duplicate groups")
                
                # Phase 3: Generate and write manifest
                manifest = None
                if write_manifest:
                    logger.info("Generating component manifest...")
                    manifest = build_manifest(pdf_path, images, classification_map, metadata_list, path_mapping, dedup_groups, health_metrics, page_text_path)
                    
                    # Phase 5: Structured output packaging
                    if package:
                        logger.info("Packaging structured output...")
                        # Validate export mode
                        if export_mode not in ["all", "canonicals-only"]:
                            logger.error(f"Invalid export mode: {export_mode}. Must be 'all' or 'canonicals-only'")
                            raise typer.Exit(code=1)
                        
                        updated_manifest_items, package_result = package_exports(
                            out, manifest.items, export_mode, include_non_components
                        )
                        
                        # Update manifest with new items that have path information
                        from dataclasses import replace
                        manifest = replace(manifest, items=updated_manifest_items)
                        
                        logger.info(f"Structured packaging complete: {package_result.exported_primary} canonicals, {package_result.exported_duplicates} duplicates")
                    
                    manifest_path = write_manifest_json(manifest, out)
                    logger.info(f"Wrote manifest to {manifest_path}")
                
                # Display enhanced summary with metadata
                metadata_with_labels = sum(1 for m in metadata_list if m.has_label())
                metadata_with_quantities = sum(1 for m in metadata_list if m.has_quantity())
                metadata_complete = sum(1 for m in metadata_list if m.is_complete())
                
                # Deduplication summary
                duplicate_groups = len(set(group.group_id for group in dedup_groups.values() if len(group.image_ids) > 1))
                total_duplicates = sum(len(group.image_ids) - 1 for group in dedup_groups.values() if len(group.image_ids) > 1)
                
                safe_echo(f"\n✅ Extraction complete!")
                safe_echo(f"📄 Processed: {pdf_path}")
                safe_echo(f"🖼️  Images extracted: {len(images)}")
                safe_echo(f"🎯 Components identified: {summary['components']}")
                safe_echo(f"🎨 Non-components: {summary['non_components']}")
                safe_echo(f"🏷️  With labels: {metadata_with_labels}")
                safe_echo(f"🔢 With quantities: {metadata_with_quantities}")
                safe_echo(f"✨ Complete metadata: {metadata_complete}")
                if dedup:
                    safe_echo(f"🔄 Duplicate groups: {duplicate_groups}")
                    safe_echo(f"📋 Total duplicates: {total_duplicates}")
                
                # Phase 5: Show packaging information
                if package and write_manifest and manifest:
                    # Count items with structured paths
                    canonicals_exported = sum(1 for item in manifest.items if item.path_primary is not None)
                    duplicates_exported = sum(1 for item in manifest.items if item.path_duplicate is not None)
                    safe_echo(f"📦 Structured export ({export_mode}): {canonicals_exported} canonicals, {duplicates_exported} duplicates")
                
                safe_echo(f"📁 Output directory: {out}")
                safe_echo(f"🔍 Filter criteria: {min_width}x{min_height} pixels minimum")
                
                if write_manifest and manifest:
                    safe_echo(f"📋 Manifest: manifest.json")
                
                # Show classification breakdown
                if summary['labels']:
                    safe_echo(f"📊 Classification breakdown:")
                    for label, count in summary['labels'].items():
                        safe_echo(f"   {label}: {count}")
                
            except Exception as exc:
                logger.error(f"Failed to save images: {exc}")
                raise typer.Exit(code=1) from exc
                
    except EncryptedPdfError as exc:
        logger.error(f"Cannot process encrypted PDF: {exc}")
        raise typer.Exit(code=2) from exc
    except PdfOpenError as exc:
        logger.error(f"Failed to open PDF: {exc}")
        raise typer.Exit(code=1) from exc


def main() -> None:
    app()


if __name__ == "__main__":
    main()


@analytics_app.command("corpus")
def analytics_corpus(
    input_dir: Path = typer.Argument(..., exists=True, help="Directory containing rulebook exports"),
    out: Path = typer.Option(Path("analytics"), "--out", "-o", help="Output directory for analytics"),
) -> None:
    """
    Run corpus-level analytics across multiple rulebook exports.
    
    Analyzes extraction patterns, classification behavior, and failure modes
    across an entire corpus of rulebooks.
    """
    from .analytics.corpus import CorpusAnalyzer
    
    logger = get_logger(__name__)
    
    try:
        logger.info(f"Starting corpus analytics: {input_dir} -> {out}")
        
        analyzer = CorpusAnalyzer(input_dir, out)
        analytics = analyzer.analyze_corpus()
        output_path = analyzer.save_analytics(analytics)
        
        # Display summary
        safe_echo("✅ Corpus analysis complete!")
        safe_echo(f"📊 Analyzed {analytics.corpus_aggregates.total_rulebooks} rulebooks")
        safe_echo(f"📄 Total pages: {analytics.corpus_aggregates.total_pages}")
        safe_echo(f"🖼️  Total images: {analytics.corpus_aggregates.total_images_attempted}")
        safe_echo(f"💾 Success rate: {analytics.corpus_aggregates.corpus_success_rate:.2%}")
        safe_echo(f"📁 Output: {output_path}")
        
        # Highlight key findings
        if analytics.corpus_aggregates.high_failure_rulebooks:
            safe_echo(f"⚠️  High failure rulebooks: {len(analytics.corpus_aggregates.high_failure_rulebooks)}")
        
        if analytics.corpus_aggregates.low_text_coverage_rulebooks:
            safe_echo(f"📝 Low text coverage: {len(analytics.corpus_aggregates.low_text_coverage_rulebooks)}")
        
    except Exception as exc:
        logger.error(f"Corpus analytics failed: {exc}")
        safe_echo(f"❌ Corpus analytics failed: {exc}")
        raise typer.Exit(1)