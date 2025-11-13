# Authoritative Rendering Contract — Semantic Ruleset (ARC v1.0.1)

This document defines the semantic invariants that must always hold for any
render produced by the MOBIUS rendering pipeline. Structural validation ensures
shape correctness; semantic validation ensures **meaningful** correctness.

These rules are enforced by:
- scripts/validate_arc.mjs  (structural)
- scripts/validate_arc_semantic.mjs (semantic contract)
- scripts/rendering_consistency.mjs (runtime validation)
- CI workflows under .github/workflows/

## 1. Video Invariants

### 1.1 Resolution
- Width and height MUST match `ARC.video.resolution.width/height` exactly.
- No upscaling or downscaling is permitted during FFmpeg processing.
- `ffprobe` width/height MUST match ARC values.

### 1.2 Frame Rate
- `avg_frame_rate` MUST equal `ARC.video.fps` OR a rational equivalent (e.g., `30/1` vs `30000/1001`).
- `r_frame_rate` MUST equal `avg_frame_rate` to prevent FFmpeg filtergraph drift.

### 1.3 Pixel Format
- `pix_fmt` MUST equal `ARC.video.pixFmt`.
- Currently required: `yuv420p`.

### 1.4 Sample Aspect Ratio
- SAR MUST equal `ARC.video.sar` (usually `1:1`).
- No implicit SAR adjustments are permitted.

## 2. Audio Invariants

### 2.1 Sample Rate
- MUST be 48 kHz, matching `ARC.audio.sampleRate`.

### 2.2 Channels
- MUST be stereo (2 channels) unless ARC explicitly changes it.

### 2.3 Loudness
- Integrated loudness MUST be within ±0.5 LUFS of `ARC.audio.target_lufs`.
- True peak MUST be <= `ARC.audio.true_peak_ceiling`.

## 3. Frame Extraction Invariants

### 3.1 FPS Alignment
- Extraction FPS MUST equal video FPS.
- Extraction MUST use the `ARC.extraction.method` ("exact" by default).

### 3.2 Frame Count
- Frame count MUST be within `ARC.extraction.frameCountTolerancePct` of the theoretical frame count.

## 4. SSIM / Golden Baseline Invariants

### 4.1 SSIM Minimum
- SSIM MUST be >= `ARC.validation.ssim.min` for ALL required frames.
- Frames below the threshold MUST block merge unless explicitly promoted.

### 4.2 Mask Handling
- If `ARC.validation.masks` exists, masks MUST be applied prior to SSIM evaluation.

## 5. CI Artifact Invariants

All CI steps MUST upload:

- `ffprobe.json`
- `frames/` directory
- `ssim.log`
- `junit.xml`
- `container.json` (for baseline promotions)

Failure to upload any required artifact blocks merge.

## 6. Platform Invariants

### 6.1 Windows
- Must render using hardware acceleration disabled to match Linux/macOS pixel math.
- Ensure newline normalization when packaging artifacts to prevent ZIP checksum drift.

### 6.2 macOS
- MUST run with the Homebrew ffmpeg build pinned in `package.json` toolchain docs.
- Gatekeeper prompts MUST be bypassed in CI via notarized runner images.

### 6.3 Linux
- MUST use the Docker image specified in `docs/ops/rendering_consistency_standards.md`.
- Ensure locale is set to `C.UTF-8` to avoid decimal separator drift.

## 7. Governance Invariants

### 7.1 ARC Versioning
- Backwards-incompatible changes REQUIRE an RFC.
- Compatible additions REQUIRE a minor version bump.
- Patch releases cover spelling, formatting, and comment normalization only.

### 7.2 Golden Updates
- New baselines REQUIRE explicit approval and label: `rendering-baseline-update`.
- Promotion MUST follow the Golden Baseline Promotion Protocol.

### 7.3 Mandatory Checks
- `validate-arc.yml` MUST pass.
- `validate-arc-semantic.yml` MUST pass.
- `rendering-consistency.yml` MUST pass on all matrices.

