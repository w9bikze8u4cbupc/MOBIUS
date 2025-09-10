# PR Summary: Unified Spec Implementation and Cross-OS Validation

## Overview
This PR implements the unified spec for the Mobius Tutorial Generator, setting up cross-OS validation for Windows, macOS, and Linux. Key changes include:

1. Reverting test-only tweaks and locking defaults
2. Adding package.json scripts for consistent cross-platform execution
3. Setting up GitHub Actions workflow for 3-OS matrix validation
4. Improving error handling and validation in scripts

## Changes Made

### 1. Script Improvements (`scripts/check_golden.cjs`)

- **SSIM Threshold**: Reverted to 0.95 (unified spec default) with env override support via `SSIM_MIN`
- **Auto-detection**: `--perOs` now defaults to true when OS subdirs exist
- **Error Handling**: Added validation for missing `media.video` and frames directory
- **Path Normalization**: Using `path.join` for consistent cross-platform paths

### 2. Package.json Scripts

Added new cross-platform scripts using `cross-env`:

```json
"gen:container": "cross-env node scripts/generate_container_json.cjs",
"golden:check:new": "cross-env node scripts/check_golden.cjs --perOs",
"checklist:new": "cross-env node scripts/ci/validate_mobius_checklist.cjs",
"sushi:win": "cross-env GAME=sushi-go PLATFORM=windows npm-run-all gen:container golden:check:new checklist:new",
"sushi:mac": "cross-env GAME=sushi-go PLATFORM=macos npm-run-all gen:container golden:check:new checklist:new",
"sushi:linux": "cross-env GAME=sushi-go PLATFORM=linux npm-run-all gen:container golden:check:new checklist:new"
```

### 3. GitHub Actions Workflow (`.github/workflows/golden-and-checklist.yml`)

Created a 3-OS matrix workflow that:
- Installs ffmpeg on each platform
- Generates container.json
- Extracts frames
- Runs golden check with SSIM=0.95
- Validates checklist
- Uploads JUnit reports and artifacts

### 4. Environment Variable Support

Updated scripts to support both `RUNNER_OS` (for CI) and `PLATFORM` (for local dev):
- `scripts/generate_container_json.cjs`

### 5. Baseline Promotion Script

Added new script `scripts/promote_baselines.cjs` for promoting actual frames to baseline with confirmation prompt.

## Testing

Verified on Windows with sushi-go:
- Golden check passes with SSIM=0.95
- Checklist validation passes
- JUnit reports generated correctly
- Artifacts uploaded successfully

## Ready for Review

This implementation is ready for cross-OS validation on macOS and Linux. The unified spec is fully implemented with proper defaults and override capabilities.