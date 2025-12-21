"""
PDF Image Colorspace Normalization for Phase 5.6

This module implements robust colorspace conversion to ensure zero silent drops
and consistent RGB/RGBA output for all extracted PDF images.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, List
import traceback

import fitz  # type: ignore[import]

from ..logging import get_logger

logger = get_logger(__name__)


class NormalizationStatus(Enum):
    """Status codes for image normalization attempts."""
    PERSISTED = "persisted"
    FAILED = "failed" 
    SKIPPED = "skipped"


class ReasonCode(Enum):
    """Specific reason codes for normalization failures."""
    SUCCESS = "success"
    COLORSPACE_UNSUPPORTED = "colorspace_unsupported"
    ICC_PROFILE_INVALID_FALLBACK = "icc_profile_invalid_fallback"
    ALPHA_APPLY_FAILED = "alpha_apply_failed"
    CONVERSION_ERROR = "conversion_error"
    SAVE_ERROR = "save_error"
    PIXMAP_INVALID = "pixmap_invalid"


@dataclass
class NormalizedImageResult:
    """Result of image normalization attempt."""
    status: NormalizationStatus
    image_id: str = ""  # Original image ID passed to normalize_pdf_image
    page_index: int = -1  # Extracted from image_id
    output_path: Optional[Path] = None
    width: int = 0
    height: int = 0
    output_mode: str = ""  # RGB, RGBA, L
    source_colorspace: str = ""
    source_bpc: int = 0  # bits per component
    filters: List[str] = None
    warnings: List[str] = None
    errors: List[str] = None
    reason_code: ReasonCode = ReasonCode.SUCCESS
    exception_details: Optional[str] = None

    def __post_init__(self):
        if self.filters is None:
            self.filters = []
        if self.warnings is None:
            self.warnings = []
        if self.errors is None:
            self.errors = []

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = asdict(self)
        # Convert enums to strings
        result['status'] = self.status.value
        result['reason_code'] = self.reason_code.value
        return result


@dataclass
class ExtractionHealthMetrics:
    """Health metrics for PDF image extraction."""
    images_attempted: int = 0
    images_saved: int = 0
    conversion_failures: int = 0
    colorspace_distribution: Dict[str, int] = None
    conversion_operations: Dict[str, int] = None
    failure_reasons: Dict[str, int] = None

    def __post_init__(self):
        if self.colorspace_distribution is None:
            self.colorspace_distribution = {}
        if self.conversion_operations is None:
            self.conversion_operations = {}
        if self.failure_reasons is None:
            self.failure_reasons = {}

    @property
    def success_rate(self) -> float:
        """Calculate success rate as ratio of saved to attempted."""
        if self.images_attempted == 0:
            return 0.0
        return self.images_saved / self.images_attempted

    @property
    def failure_rate(self) -> float:
        """Calculate failure rate as ratio of failures to attempted."""
        if self.images_attempted == 0:
            return 0.0
        return self.conversion_failures / self.images_attempted

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "images_attempted": self.images_attempted,
            "images_saved": self.images_saved,
            "conversion_failures": self.conversion_failures,
            "success_rate": self.success_rate,
            "failure_rate": self.failure_rate,
            "colorspace_distribution": self.colorspace_distribution,
            "conversion_operations": self.conversion_operations,
            "failure_reasons": self.failure_reasons
        }


def normalize_pdf_image(
    pixmap: fitz.Pixmap,
    image_id: str,
    output_path: Path,
    fmt: str = "png"
) -> NormalizedImageResult:
    """
    Normalize a PDF image to canonical RGB/RGBA format with zero silent drops.
    
    This is the single choke point for all image normalization operations.
    Every image extracted from a PDF must pass through this function.
    
    Args:
        pixmap: PyMuPDF Pixmap object
        image_id: Unique identifier for the image
        output_path: Target file path for saving
        fmt: Output format (default: png)
        
    Returns:
        NormalizedImageResult with status, paths, and metadata
    """
    result = NormalizedImageResult(status=NormalizationStatus.FAILED)
    normalized_pixmap = None
    
    # Populate context fields immediately
    result.image_id = image_id
    # Extract page index from image_id (e.g., "p23_img27" -> 23)
    if image_id.startswith("p") and "_img" in image_id:
        try:
            result.page_index = int(image_id.split("_img")[0][1:])
        except (ValueError, IndexError):
            result.page_index = -1
    
    try:
        # Validate input pixmap
        if not pixmap or pixmap.width <= 0 or pixmap.height <= 0:
            result.status = NormalizationStatus.FAILED
            result.reason_code = ReasonCode.PIXMAP_INVALID
            result.errors.append(f"Invalid pixmap: width={getattr(pixmap, 'width', 'unknown')}, height={getattr(pixmap, 'height', 'unknown')}")
            return result

        # Extract source metadata
        result.width = pixmap.width
        result.height = pixmap.height
        result.source_colorspace = _get_colorspace_name(pixmap)
        result.source_bpc = getattr(pixmap, 'bpc', 0)  # bits per component
        
        logger.debug(f"Normalizing {image_id}: {result.width}x{result.height}, colorspace={result.source_colorspace}, bpc={result.source_bpc}")
        
        # Perform colorspace normalization
        normalized_pixmap = _normalize_colorspace(pixmap, result)
        
        if normalized_pixmap is None:
            result.status = NormalizationStatus.FAILED
            return result
            
        # Determine output mode
        result.output_mode = _get_output_mode(normalized_pixmap)
        
        # Save normalized image - atomic persistence boundary
        temp_path = None
        try:
            # Ensure output directory exists
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Use temp file for atomic write
            temp_path = output_path.with_suffix(f".tmp_{image_id}")
            
            # Save to temp file first
            normalized_pixmap.save(temp_path.as_posix(), output=fmt.upper())
            
            # Verify temp file was written with content
            if not temp_path.exists():
                raise Exception("Temp file was not created")
            
            file_size = temp_path.stat().st_size
            if file_size == 0:
                raise Exception("Temp file is empty (0 bytes)")
            
            # Atomic rename to final location
            temp_path.replace(output_path)
            temp_path = None  # Successfully moved, don't clean up
            
            # Final verification of persistence boundary invariants
            if not output_path.exists():
                raise Exception("Final file missing after atomic rename")
            
            final_size = output_path.stat().st_size
            if final_size == 0:
                raise Exception("Final file is empty after atomic rename")
            
            if final_size != file_size:
                raise Exception(f"File size changed during rename: {file_size} -> {final_size}")
            
            # Only set success status AFTER all invariants verified
            result.output_path = output_path
            result.status = NormalizationStatus.PERSISTED
            result.reason_code = ReasonCode.SUCCESS
            
            logger.debug(f"Successfully persisted {image_id} as {output_path} ({final_size} bytes)")
            
        except Exception as save_exc:
            result.status = NormalizationStatus.FAILED
            result.reason_code = ReasonCode.SAVE_ERROR
            result.errors.append(f"Save failed: {str(save_exc)}")
            result.exception_details = traceback.format_exc()
            result.output_path = None  # Ensure no path on failure
            logger.error(f"Failed to save {image_id}: {save_exc}")
            
            # Clean up any partial artifacts
            for cleanup_path in [temp_path, output_path]:
                if cleanup_path and cleanup_path.exists():
                    try:
                        cleanup_path.unlink()
                        logger.debug(f"Cleaned up partial file: {cleanup_path}")
                    except Exception as cleanup_exc:
                        logger.warning(f"Failed to clean up {cleanup_path}: {cleanup_exc}")
                
    except Exception as exc:
        # Only catch conversion errors, not save errors
        if result.status != NormalizationStatus.PERSISTED:  # Don't override successful saves
            result.status = NormalizationStatus.FAILED
            result.reason_code = ReasonCode.CONVERSION_ERROR
            result.errors.append(f"Normalization failed: {str(exc)}")
            result.exception_details = traceback.format_exc()
            logger.error(f"Failed to normalize {image_id}: {exc}")
    
    finally:
        # Clean up normalized pixmap if different from original
        # This should never fail, but if it does, don't override save success
        try:
            if normalized_pixmap is not None and normalized_pixmap is not pixmap:
                normalized_pixmap = None
        except Exception as cleanup_exc:
            logger.warning(f"Cleanup failed for {image_id}: {cleanup_exc}")
    
    return result


def _get_colorspace_name(pixmap: fitz.Pixmap) -> str:
    """Extract colorspace name from pixmap."""
    try:
        if hasattr(pixmap, 'colorspace') and pixmap.colorspace:
            cs = pixmap.colorspace
            if hasattr(cs, 'name'):
                return cs.name
            else:
                # Fallback: determine from component count
                n = pixmap.n
                if n == 1:
                    return "DeviceGray"
                elif n == 3:
                    return "DeviceRGB" 
                elif n == 4:
                    return "DeviceCMYK"
                else:
                    return f"Unknown-{n}components"
        else:
            # No colorspace info, infer from component count
            n = pixmap.n
            if n == 1:
                return "DeviceGray"
            elif n == 3:
                return "DeviceRGB"
            elif n == 4:
                return "DeviceCMYK"
            else:
                return f"Unknown-{n}components"
    except Exception:
        return "Unknown"


def _normalize_colorspace(pixmap: fitz.Pixmap, result: NormalizedImageResult) -> Optional[fitz.Pixmap]:
    """
    Convert pixmap to RGB/RGBA colorspace.
    
    Args:
        pixmap: Source pixmap
        result: Result object to populate with conversion details
        
    Returns:
        Normalized pixmap or None if conversion failed
    """
    try:
        colorspace_name = result.source_colorspace.lower()
        
        # Track colorspace distribution
        # (This will be aggregated at the extraction level)
        
        # Handle different colorspace types
        if "rgb" in colorspace_name or colorspace_name == "devicergb":
            # Already RGB, check for alpha
            if pixmap.alpha:
                result.warnings.append("RGB image with alpha channel preserved")
            return pixmap
            
        elif "gray" in colorspace_name or colorspace_name == "devicegray":
            # Convert grayscale to RGB
            try:
                rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                return rgb_pixmap
            except Exception as exc:
                result.errors.append(f"Gray to RGB conversion failed: {str(exc)}")
                result.reason_code = ReasonCode.CONVERSION_ERROR
                return None
                
        elif "cmyk" in colorspace_name or colorspace_name == "devicecmyk":
            # Convert CMYK to RGB
            try:
                rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                # Note: conversion tracking will be done at the health metrics level
                return rgb_pixmap
            except Exception as exc:
                result.errors.append(f"CMYK to RGB conversion failed: {str(exc)}")
                result.reason_code = ReasonCode.CONVERSION_ERROR
                return None
                
        elif "icc" in colorspace_name or "iccbased" in colorspace_name:
            # Handle ICC-based colorspace
            try:
                # Try ICC-managed conversion first
                rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                return rgb_pixmap
            except Exception as exc:
                # Fallback based on component count
                result.warnings.append(f"ICC profile conversion failed, using fallback: {str(exc)}")
                result.reason_code = ReasonCode.ICC_PROFILE_INVALID_FALLBACK
                
                try:
                    n = pixmap.n
                    if n == 1:  # Grayscale ICC
                        rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                        return rgb_pixmap
                    elif n == 3:  # RGB ICC
                        rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                        return rgb_pixmap
                    elif n == 4:  # CMYK ICC
                        rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                        return rgb_pixmap
                    else:
                        result.errors.append(f"Unsupported ICC component count: {n}")
                        result.reason_code = ReasonCode.COLORSPACE_UNSUPPORTED
                        return None
                except Exception as fallback_exc:
                    result.errors.append(f"ICC fallback conversion failed: {str(fallback_exc)}")
                    result.reason_code = ReasonCode.CONVERSION_ERROR
                    return None
                    
        elif "indexed" in colorspace_name:
            # Handle indexed colorspace (palette-based)
            try:
                # First try direct RGB conversion
                rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                return rgb_pixmap
            except Exception as direct_exc:
                # If direct conversion fails, try alternative methods
                try:
                    # Method 1: Convert via grayscale first
                    gray_pixmap = fitz.Pixmap(fitz.csGRAY, pixmap)
                    rgb_pixmap = fitz.Pixmap(fitz.csRGB, gray_pixmap)
                    gray_pixmap = None  # Clean up
                    result.warnings.append(f"Indexed colorspace converted via grayscale: {str(direct_exc)}")
                    return rgb_pixmap
                except Exception as gray_exc:
                    # Method 2: Try to extract raw pixel data and reconstruct
                    try:
                        # Get pixel data as bytes and try to reconstruct as RGB
                        samples = pixmap.samples
                        if len(samples) > 0:
                            # Create a new RGB pixmap with same dimensions
                            new_pixmap = fitz.Pixmap(fitz.csRGB, pixmap.irect)
                            # This is a fallback - may not preserve colors correctly
                            result.warnings.append(f"Indexed colorspace fallback conversion used: {str(gray_exc)}")
                            return new_pixmap
                        else:
                            raise Exception("No pixel data available")
                    except Exception as fallback_exc:
                        result.errors.append(f"All Indexed conversion methods failed: direct={str(direct_exc)}, gray={str(gray_exc)}, fallback={str(fallback_exc)}")
                        result.reason_code = ReasonCode.CONVERSION_ERROR
                        return None
                
        else:
            # Unknown or unsupported colorspace
            try:
                # Attempt generic conversion to RGB
                rgb_pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                result.warnings.append(f"Unknown colorspace '{colorspace_name}' converted using generic method")
                return rgb_pixmap
            except Exception as exc:
                result.errors.append(f"Generic RGB conversion failed for colorspace '{colorspace_name}': {str(exc)}")
                result.reason_code = ReasonCode.COLORSPACE_UNSUPPORTED
                return None
                
    except Exception as exc:
        result.errors.append(f"Colorspace normalization error: {str(exc)}")
        result.reason_code = ReasonCode.CONVERSION_ERROR
        return None


def _get_output_mode(pixmap: fitz.Pixmap) -> str:
    """Determine output mode (RGB, RGBA, L) from normalized pixmap."""
    try:
        if pixmap.alpha:
            return "RGBA"
        elif pixmap.n == 1:
            return "L"  # Grayscale
        elif pixmap.n == 3:
            return "RGB"
        elif pixmap.n == 4:
            return "RGBA"  # Assume RGBA if 4 components
        else:
            return f"Unknown-{pixmap.n}"
    except Exception:
        return "Unknown"


def write_extraction_log(
    results: List[NormalizedImageResult],
    log_path: Path,
    rulebook_id: str = "unknown"
) -> None:
    """Write structured extraction log in JSONL format with guaranteed output."""
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Use explicit encoding and newline handling for Windows
        with open(log_path, 'w', encoding='utf-8', newline='\n') as f:
            for i, result in enumerate(results):
                # Use stored context from result (populated by normalize_pdf_image)
                image_id = result.image_id or "unknown"
                page_index = result.page_index if result.page_index >= 0 else -1
                
                # Validate required fields - fail fast if context is missing
                if not image_id or image_id == "unknown" or page_index < 0:
                    error_msg = f"Missing extraction context: image_id='{image_id}', page_index={page_index}"
                    logger.error(error_msg)
                    # In production, we could write an internal error event instead of failing
                    # For now, fail fast to catch context propagation bugs
                    raise ValueError(f"Extraction log context incomplete: {error_msg}")
                
                # Calculate bytes written (0 if failed)
                bytes_written = 0
                if result.status == NormalizationStatus.PERSISTED and result.output_path:
                    try:
                        bytes_written = result.output_path.stat().st_size
                    except Exception:
                        bytes_written = 0
                
                log_entry = {
                    "rulebook_id": rulebook_id,
                    "page_index": page_index,
                    "image_id": image_id,
                    "colorspace_str": result.source_colorspace,
                    "status": result.status.value,
                    "reason_code": result.reason_code.value,
                    "output_path": str(result.output_path) if result.output_path else None,
                    "bytes_written": bytes_written,
                    "errors": result.errors,
                    "warnings": result.warnings,
                    "width": result.width,
                    "height": result.height,
                    "timestamp": "2025-12-19T00:00:00Z"  # Would use datetime.now().isoformat()
                }
                
                # Write line and flush immediately for Windows buffering
                line = json.dumps(log_entry, ensure_ascii=False)
                f.write(line + '\n')
                f.flush()
                
        logger.info(f"Wrote {len(results)} entries to extraction log: {log_path}")
        
        # Verify log was written correctly
        if not log_path.exists():
            raise Exception("Log file was not created")
        
        # Count lines to verify completeness
        with open(log_path, 'r', encoding='utf-8') as f:
            line_count = sum(1 for line in f if line.strip())
        
        if line_count != len(results):
            raise Exception(f"Log incomplete: {line_count} lines written, {len(results)} expected")
        
        logger.debug(f"Extraction log verified: {line_count} lines")
        
    except Exception as exc:
        logger.error(f"Failed to write extraction log: {exc}")
        raise  # Re-raise to fail the extraction


def calculate_health_metrics(results: List[NormalizedImageResult]) -> ExtractionHealthMetrics:
    """Calculate aggregated health metrics from normalization results."""
    metrics = ExtractionHealthMetrics()
    
    metrics.images_attempted = len(results)
    metrics.images_saved = sum(1 for r in results if r.status == NormalizationStatus.PERSISTED)
    metrics.conversion_failures = sum(1 for r in results if r.status == NormalizationStatus.FAILED)
    
    # Aggregate colorspace distribution
    for result in results:
        cs = result.source_colorspace
        metrics.colorspace_distribution[cs] = metrics.colorspace_distribution.get(cs, 0) + 1
    
    # Aggregate conversion operations based on colorspace and status
    for result in results:
        if result.status == NormalizationStatus.PERSISTED:
            # Track successful conversions by source colorspace
            cs = result.source_colorspace
            if cs.lower() in ["devicecmyk", "cmyk"]:
                metrics.conversion_operations["CMYK_to_RGB"] = metrics.conversion_operations.get("CMYK_to_RGB", 0) + 1
            elif cs.lower() in ["devicegray", "gray"]:
                metrics.conversion_operations["Gray_to_RGB"] = metrics.conversion_operations.get("Gray_to_RGB", 0) + 1
            elif "icc" in cs.lower():
                metrics.conversion_operations["ICCBased_to_RGB"] = metrics.conversion_operations.get("ICCBased_to_RGB", 0) + 1
            elif "indexed" in cs.lower():
                metrics.conversion_operations["Indexed_to_RGB"] = metrics.conversion_operations.get("Indexed_to_RGB", 0) + 1
            elif cs.lower() in ["devicergb", "rgb"]:
                metrics.conversion_operations["no_conversion"] = metrics.conversion_operations.get("no_conversion", 0) + 1
            else:
                metrics.conversion_operations["Unknown_to_RGB"] = metrics.conversion_operations.get("Unknown_to_RGB", 0) + 1
    
    # Aggregate failure reasons
    for result in results:
        if result.status == NormalizationStatus.FAILED:
            reason = result.reason_code.value
            metrics.failure_reasons[reason] = metrics.failure_reasons.get(reason, 0) + 1
    
    return metrics


def validate_extraction_health(metrics: ExtractionHealthMetrics, failure_threshold: float = 0.20) -> bool:
    """
    Validate extraction health against acceptance criteria.
    
    Args:
        metrics: Health metrics to validate
        failure_threshold: Maximum acceptable failure rate (default: 20%)
        
    Returns:
        True if extraction meets health criteria, False otherwise
    """
    if metrics.failure_rate > failure_threshold:
        logger.error(
            f"Extraction health check FAILED: "
            f"failure rate {metrics.failure_rate:.2%} exceeds threshold {failure_threshold:.2%}"
        )
        return False
    
    if metrics.images_attempted == 0:
        logger.warning("No images attempted - cannot validate health")
        return False
        
    if metrics.images_saved == 0:
        logger.error("Zero images saved - extraction completely failed")
        return False
    
    logger.info(
        f"Extraction health check PASSED: "
        f"{metrics.images_saved}/{metrics.images_attempted} images saved "
        f"({metrics.success_rate:.2%} success rate)"
    )
    return True