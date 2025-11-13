MOBIUS — Rendering Consistency Standards Pack
Status: ACTIVE
Owner: Director (GENESIS Codex)
Applies To: All platforms (Windows, macOS, Linux), all render modes, all CI Golden Tests
Purpose: Guarantee identical visual and audio characteristics across OS runners, preventing drift and enabling stable golden testing, predictable loudness, and reproducible exports.

1. Overview

This document defines the authoritative cross-platform rendering contract for the MOBIUS tutorial generator.
It governs:

Video encoding parameters

Frame extraction consistency

Audio normalization (LUFS + True Peak)

Golden baseline validation rules

CI triage artifacts

Accept/reject thresholds

FFmpeg version locking

Allowed deviations per OS (strict)

All pipeline stages (rendering, extraction, validation, golden comparison) MUST comply with this document.

2. Video Rendering Specification (Authoritative)

These settings MUST be used for every MP4 export unless explicitly overridden by a versioned RFC.

2.1 Encoding Targets
Parameter	Required Value
Codec	H.264 (libx264)
Container	MP4
Resolution	1920×1080
FPS	30 exact (30/1 or ffmpeg 30000/1001 accepted, but forced output is 30/1)
Pixel format	yuv420p
SAR (Sample Aspect Ratio)	1:1
Color Space	BT.709, limited range
Bitrate Mode	VBR
Bitrate Target	8 Mbps (min 6, max 12), deterministic
2.2 Required FFmpeg Output Construction

The rendering engine MUST generate commands equivalent to:

ffmpeg -y \
  -r 30 \
  -i <slideshow-or-scene-input> \
  -i <mixed-audio> \
  -c:v libx264 -preset medium \
  -pix_fmt yuv420p \
  -colorspace bt709 -color_range tv \
  -b:v 8000k -maxrate 12000k -bufsize 16000k \
  -c:a aac -ar 48000 -ac 2 \
  "<output>.mp4"


No platform may substitute encoders, pixel formats, or range settings.

3. Audio Normalization Requirements

The CI audio metrics contract allows exactly two fields, no more:

{
  "integrated_lufs": -16.0,
  "true_peak_dbfs": <float>
}

3.1 Targets
Metric	Required Target
Integrated Loudness	–16.0 LUFS ± 0.5
True Peak Ceiling	–1.0 dBTP (never exceed –0.8)
Sample Rate	48 kHz
Channels	Stereo
3.2 Mandatory FFmpeg Probe

All CI probes use:

ffmpeg -nostats -hide_banner -i "<video>" -filter_complex ebur128 -f null -


CI schema validation halts summary generation if either field is missing or extra.

4. Frame Extraction Specification (Golden Tests)

Cross-OS golden tests depend on strict frame extraction determinism.

4.1 Extraction Contract

Every extract script MUST echo:

[extract] resolved_paths: <absolute paths>
[extract] fps: <numeric fps>
[extract] pix_fmt: <format>
[extract] sar: <value>
[extract] duration: <seconds>

4.2 Extraction FFmpeg Command

Used for macOS, Windows, Linux:

ffmpeg -i "<video>" \
  -vf fps=30 \
  "frames/%05d.png"

4.3 Expected Frame Counts
Segment	Expected Frame Count
5s preview	150
10s segment	300
20s segment	600

Accepted drift: ±1 frame, but only when platform timebase rounding is confirmed identical.

5. Golden Baseline Determinism Rules

These rules determine acceptance vs rejection for visual regression tests.

5.1 SSIM Threshold

Pass: SSIM ≥ 0.95

Soft Pass (auto-promotable): 0.92 ≤ SSIM < 0.95 if frames appear visually equivalent and OS update occurred.

Fail: SSIM < 0.92

Hard failures require operator intervention.

5.2 Placeholder / Corrupt Frame Detection

Golden frames MUST be > 200 bytes and valid PNGs.

CI checks:

file exists

file size > 200 bytes

ffprobe recognizes width/height

If any fail → reject entire golden test.

5.3 Baseline Promotion Flow

For a game <slug> and platform <os>:

node scripts/promote_baselines.cjs --game <slug> --platform <os>


This:

Copies extracted frames into tests/golden/<slug>/<os>/frames/

Updates manifest hashes

Regenerates JUnit

Revalidates SSIM

Promotion MUST only occur after human review.

6. Required FFmpeg + System Version Pinning
6.1 FFmpeg

Pinned version: 6.0 or 6.1 (CI-controlled)

All runners MUST install the same major/minor version.

6.2 Node

Node: 20.x

npm: 10.x

6.3 OS

Windows: windows-latest

macOS: macos-latest

Ubuntu: ubuntu-latest

CI must log OS version + FFmpeg version in every job header.

7. Required CI Artifacts Per Platform

Every run MUST upload:

Artifact	Description
ffprobe.json	Width, height, avg_frame_rate, r_frame_rate, pix_fmt, SAR
container.json	Env + tool versions
frames/	Extracted PNGs
junit.xml	Machine-readable results
ssim.log	SSIM diagnostics
raw_metrics.json	(Optional) internal counters

Missing artifacts → hard CI failure.

8. Triage / Debugging Checklist
8.1 First-line Checks

Compare extracted FPS vs expected

Compare pix_fmt vs yuv420p

Check SAR = 1:1

Confirm frame count within ±1

Confirm loudness metrics exist and are numeric

Review SSIM logs for per-frame failure patterns

8.2 Remediation Steps

If visuals appear correct but SSIM is low:

Re-run extraction locally

If drift is systematic, promote baselines

If drift is random, investigate FPS/pix_fmt/SAR mismatch

If drift is partial (only certain frames), regenerate those frames and inspect compression artifacts

9. Acceptance Criteria (Authoritative)

A render passes CI only when:

Video has correct resolution, FPS, pixel format, SAR

Audio meets LUFS + true peak contract

Extraction files produce correct metadata

SSIM ≥ 0.95 (or qualifies for soft-pass promotion)

All required artifacts uploaded

container.json matches runner characteristics

No placeholder golden frames detected

No schema violations in audio metrics JSON

If ANY of the above fail → reject.

10. Operator Summary

This document defines all rules that CI enforces for stable cross-platform rendering.

It MUST be updated via RFC if any setting here changes.

All future tests, scripts, and baselines depend on this contract for determinism.

11. Change Log
Version	Date	Change
v1.0	2025-11-13	Initial release. Aligned with audio metrics gate + golden test system.
✔ Deliverable Complete

