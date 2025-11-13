# ARC Semantic Ruleset (Authoritative Rendering Contract)

Status: ACTIVE  
Applies to: All MOBIUS rendering workflows and CI checks  
Owned by: Rendering Governance Group (RGG)

This document defines the **semantic** invariants required for any render
governed by the Authoritative Rendering Contract (ARC). It complements the
structural contract in:

- `docs/spec/authoritative_rendering_contract.json`

and is enforced automatically by:

- `scripts/validate_arc_semantic.mjs`
- `.github/workflows/validate-arc-semantic.yml`

---

## 1. Video Invariants

### 1.1 Resolution

- `video.width` and `video.height` MUST be positive integers ≥ 16.
- ARC MUST describe the **final output resolution**; FFmpeg pipelines MUST NOT
  upscale/downscale relative to these values without an ARC change.

### 1.2 Frame Rate

- `video.fps` MUST be a finite number in the range `[1, 120]`.
- Frame rate MUST be treated as authoritative:
  - `avg_frame_rate` SHOULD equal `video.fps`.
  - `r_frame_rate` SHOULD equal `avg_frame_rate`.

### 1.3 Pixel Format

- `video.pixFmt` MUST be a non-empty string.
- Current requirement: `yuv420p` for broad YouTube compatibility.
- Any change in pixFmt MUST go through the rendering governance process.

### 1.4 Sample Aspect Ratio (SAR)

- If present, `video.sar` MUST be a string in `"num:den"` format.
- `num > 0` and `den > 0`.
- If not present, the pipeline SHOULD default to `1:1` via FFmpeg filters.

---

## 2. Audio Invariants

### 2.1 Sample Rate

- `audio.sampleRate` MUST be finite and ≥ 8000 Hz.
- Recommended: `48000` Hz for YouTube-ready exports.
- The semantic validator will emit a **warning** if the value is not `48000`.

### 2.2 Channels

- `audio.channels` MUST be a finite number ≥ 1.
- Recommended: `2` (stereo).
- Non-stereo configurations will emit a **warning**, not a hard failure.

### 2.3 Loudness

- `audio.targetLufs` MUST be between `-40` and `-5` LUFS.
- `audio.truePeakCeiling` MUST be between `-10` and `-0.1` dBTP.
- `audio.targetLufs` MUST be more negative than `audio.truePeakCeiling`.
  - Example: `targetLufs = -16`, `truePeakCeiling = -1.0`.

Misconfigured loudness targets will cause the semantic validator to fail.

---

## 3. Frame Extraction Invariants

### 3.1 Method

- `extraction.method` MUST be a non-empty string.
- Supported values:
  - `"exact"` — frame count must match theory within tolerance.
  - `"nearest"` — frame count may differ slightly based on container timebase.

Unknown methods will not fail CI but will emit a **warning**.

### 3.2 Frame Count Tolerance

- `extraction.frameCountTolerancePct` MUST be a finite number in `[0, 10]`.
- This describes the maximum allowed percentage deviation between:
  - theoretical frame count (duration × fps) and
  - observed extracted frame count.

Values > 10% are considered misconfigurations and will fail CI.

---

## 4. SSIM / Golden Validation Invariants

### 4.1 Minimum SSIM

- `validation.ssim.min` MUST be within `[0.0, 1.0]`.
- Recommended minimum: `≥ 0.8`.

Values < 0.8 will not automatically fail semantic validation but will emit a
**warning**; maintainers SHOULD treat such values as suspect and review.

### 4.2 Governance Coupling

- Any change to `validation.ssim.min` MUST be explained in the PR description.
- When lowering `validation.ssim.min`, maintainers MUST:
  - confirm that differences are due to intentional visual changes, and
  - consider whether a golden baseline promotion is more appropriate.

---

## 5. Governance Considerations

- The semantic rules in this document are **normative** for ARC versions that
  include the corresponding keys.
- Backwards-incompatible changes (e.g., relaxing numeric bounds) MUST go through
  the rendering governance RFC process.
- The semantic validator MAY emit warnings (non-fatal) to guide contributors
  toward best practices without forcing a breaking change.

---

## 6. Relationship to Structural Validation

- Structural validation (shape, presence of keys, basic typing) is handled by:
  - `scripts/validate_arc.*`
  - `.github/workflows/validate-arc.yml`
- Semantic validation (reasonable numeric ranges, internal consistency) is
  handled by:
  - `scripts/validate_arc_semantic.mjs`
  - `.github/workflows/validate-arc-semantic.yml`

Both workflows MUST pass before a PR impacting ARC can be merged.
