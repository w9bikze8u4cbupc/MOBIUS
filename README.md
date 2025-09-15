# Mobius Games Tutorial Generator

[![CI (3-OS)](https://img.shields.io/github/actions/workflow/status/OWNER/REPO/your-workflow.yml?label=CI%203-OS)](#)
[![SSIM ≥ 0.95](https://img.shields.io/badge/SSIM-%E2%89%A5%200.95-brightgreen)](#)

This project generates video tutorials for board games using FFmpeg and Lottie animations.

## Golden Preview Harness

We've implemented a deterministic visual/audio regression testing system to catch unintended changes in our tutorial outputs. See [docs/ci-golden-harness.md](docs/ci-golden-harness.md) for detailed documentation on:

- Visual regression testing using SSIM at fixed timestamps
- Audio compliance checking with EBU R128 loudness standards
- Container format verification
- Cross-platform CI integration with JUnit reporting
- Per-OS baseline management

## Sushi Go! Package

The Sushi Go! package is now available in the [games/sushi-go](games/sushi-go) directory, containing:

- `asset_manifest.csv` - Lists all game assets
- `gig.json` - Game Instruction Graph defining the tutorial structure
- `contradictions.csv` - Component relationship definitions
- `narration.ssml` - SSML markup for text-to-speech narration
- `theme.json` - Theme configuration for visual styling
- `verification_config.json` - Configuration for verification checks

## Icons

The application now features a green Japanese dragon icon. See [ICONS-README.md](ICONS-README.md) for details on the icon assets and how to update them.

## Quality Assurance Scripts

This project includes several scripts for ensuring consistent output quality across platforms:

### Provenance Capture

Captures system and toolchain information for reproducibility:

- `scripts/capture_provenance.sh` - Bash script for Unix systems
- `scripts/capture_provenance.ps1` - PowerShell script for Windows
- `scripts/capture_provenance.bat` - Batch script for Windows

### Audio Compliance

Checks that audio levels meet broadcast standards:

- `scripts/check_audio_compliance.py` - Python script for Unix systems
- `scripts/check_audio_compliance.ps1` - PowerShell script for Windows

### Container Verification

Ensures video container specifications are correct:

- `scripts/check_container.sh` - Bash script for Unix systems
- `scripts/check_container.ps1` - PowerShell script for Windows
- `scripts/check_container.bat` - Batch script for Windows

### Mobius Per-OS Video Validation — Quick Start

- Environment
  - GAME: e.g. sushi-go
  - PLATFORM: macos | windows | linux (preferred override for local runs)
  - SSIM_MIN: default 0.95 (enforced in CI). Lower only locally (e.g. 0.90) for triage.

- Per-OS goldens
  - Default: tests/golden/{GAME}/{PLATFORM}/
  - Legacy root only via --perOs=false

- Deterministic extraction
  - Use explicit fps=30 and sar=1:1; expect pix_fmt=yuv420p
  - Scripts:
    - Frames: `cross-env GAME=$GAME PLATFORM=$PLATFORM node scripts/extract_frames.cjs --fps 30 --sar 1:1`
    - Container: `cross-env GAME=$GAME PLATFORM=$PLATFORM node scripts/generate_container_json.cjs`

- Validation
  - Ajv JSON Schema for dist/{GAME}/{PLATFORM}/container.json
  - ffprobe vs container.json: `node scripts/compare_ffprobe_vs_container.cjs artifacts/{GAME}-{PLATFORM}-ffprobe.json dist/{GAME}/{PLATFORM}/container.json`
  - Golden check (SSIM >= 0.95): `cross-env GAME=$GAME PLATFORM=$PLATFORM node scripts/check_golden.cjs`

- Performance Budget
  - Frame extraction speed: `cross-env GAME=$GAME PLATFORM=$PLATFORM npm run frames:perf`
  - Default budget: 5 fps (configurable via BUDGET_FPS environment variable)

- CI (3-OS matrix)
  - Runners: windows-2022, macos-14, ubuntu-22.04
  - Pinned: Node 20.14.0; FFmpeg 8.0 (Windows via choco); HOMEBREW_NO_AUTO_UPDATE=1 on macOS
  - Concurrency to cancel superseded runs; always upload JUnit/artifacts with matrix-specific names

- Triage capture (paste for review)
  1) "Resolved paths" + "SSIM" from golden:check logs
  2) Frame count line
  3) First ~40 lines of JUnit XML (or artifact link)
  4) If failing: ffprobe JSON + dist/.../container.json

## Quick Smoke Test

For a quick validation of the entire pipeline, you can run the smoke test script:

```bash
# Windows example
cross-env GAME=sushi-go PLATFORM=windows npm run smoke
# macOS example
cross-env GAME=sushi-go PLATFORM=macos npm run smoke
# Linux example
cross-env GAME=sushi-go PLATFORM=linux npm run smoke
# Then paste Resolved paths + SSIM, frame count, JUnit head for triage.
```

This runs container generation, frame extraction, golden check, and ffprobe comparison in sequence.

## Script Parameters and Environment Variables

### Core Scripts

#### `scripts/generate_container_json.cjs`
- **Environment Variables:**
  - `GAME` - Game identifier (default: "space-invaders")
  - `PLATFORM` - Target platform (windows, macos, linux)
  - `RUNNER_OS` - CI runner OS (used for platform detection)
- **Output:** Generates `dist/{GAME}/{PLATFORM}/container.json` with media metadata and tool versions

#### `scripts/extract_frames.cjs`
- **Environment Variables:**
  - `GAME` - Game identifier
  - `PLATFORM` - Target platform
- **Parameters:**
  - `--fps` - Frames per second for extraction (default: 1)
  - `--sar` - Sample aspect ratio (default: 1:1)
- **Output:** Extracts frames to `tests/golden/{GAME}/{PLATFORM}/frames/`

#### `scripts/check_golden.cjs`
- **Environment Variables:**
  - `GAME` - Game identifier
  - `PLATFORM` - Target platform
  - `SSIM_MIN` - Minimum SSIM threshold (default: 0.95)
- **Parameters:**
  - `--perOs` - Enable per-OS baseline comparison
  - `--frames` - Comma-separated list of frame timestamps to check
- **Output:** JUnit report in `tests/golden/reports/`

#### `scripts/validate_frame_count.cjs`
- **Environment Variables:**
  - `GAME` - Game identifier
  - `PLATFORM` - Target platform
- **Output:** Validates frame count matches expected based on video duration and FPS

#### `scripts/validate_frame_perf.cjs`
- **Environment Variables:**
  - `GAME` - Game identifier
  - `PLATFORM` - Target platform
  - `BUDGET_FPS` - Performance budget in FPS (default: 5)
  - `PERF_WARN_ONLY` - Enable warn-only mode (default: false)
- **Output:** Performance metrics in `reports/perf/` and JUnit report in `reports/junit/`

#### `scripts/compare_perf_to_baseline.cjs`
- **Environment Variables:**
  - `PERF_TOLERANCE` - Performance tolerance (default: 0.05)
  - `PERF_WARN_ONLY` - Enable warn-only mode
  - `PERF_REQUIRE_BASELINE_ON_MAIN` - Require baseline on main branch
- **Output:** Compares current performance to baseline and generates JUnit report

#### `scripts/promote_baselines.cjs`
- **Environment Variables:**
  - `DRY_RUN` - Enable dry-run mode
  - `ALLOW_REGRESSION` - Allow performance regression
  - `ALLOW_REGRESSION_REASON` - Reason for allowing regression
- **Parameters:**
  - `--allow-regression` - Allow performance regression
  - `--dry-run` - Enable dry-run mode
- **Output:** Promotes baselines and updates performance baseline

### Utility Scripts

#### `scripts/make_slim_artifacts.cjs`
- **Output:** Creates slim frame artifacts with checksums for CI debugging

#### `scripts/aggregate_perf_summary.cjs`
- **Output:** Aggregates performance reports into a summary

## Troubleshooting

### Common Issues and Solutions

#### 1. "Input video not found" Error
**Problem:** Scripts can't find the input video file.
**Solution:** Ensure the video file exists at `dist/{GAME}/{PLATFORM}/tutorial.mp4`. You can copy it from `tests/assets/{GAME}/tutorial.mp4`:
```bash
mkdir -p dist/{GAME}/{PLATFORM}
cp tests/assets/{GAME}/tutorial.mp4 dist/{GAME}/{PLATFORM}/
```

#### 2. "Frames directory does not exist" Error
**Problem:** Frame validation script can't find extracted frames.
**Solution:** Ensure frames are extracted to `dist/{GAME}/{PLATFORM}/frames/`. You may need to copy them from `tests/golden/{GAME}/{PLATFORM}/frames/`:
```bash
mkdir -p dist/{GAME}/{PLATFORM}/frames
cp tests/golden/{GAME}/{PLATFORM}/frames/* dist/{GAME}/{PLATFORM}/frames/
```

#### 3. Environment Variables Not Being Recognized (Windows)
**Problem:** Environment variables not being passed correctly on Windows.
**Solution:** Use `cross-env` or set variables with the correct syntax:
```bash
# Correct Windows syntax
set GAME=sushi-go&& set PLATFORM=windows&& npm run smoke

# Or use cross-env (recommended)
npx cross-env GAME=sushi-go PLATFORM=windows npm run smoke
```

#### 4. Cross-Platform Path Issues
**Problem:** Scripts using hardcoded paths that don't work across platforms.
**Solution:** All scripts now use Node.js path utilities for cross-platform compatibility. If you encounter path issues, ensure you're using the latest version of the scripts.

#### 5. Performance Validation Failing
**Problem:** Performance validation reports low FPS.
**Solution:** The default budget is 5 FPS. For local testing, you can increase the budget:
```bash
cross-env GAME=sushi-go PLATFORM=windows BUDGET_FPS=1 npm run frames:perf
```

#### 6. JUnit Validation Failing
**Problem:** JUnit validation reports malformed files.
**Solution:** Remove any empty or malformed JUnit files:
```bash
rm tests/golden/reports/*.xml  # Be careful with this command
```
Or run the validation script to identify specific problematic files.

### Platform-Specific Notes

#### Windows
- Use `cross-env` for setting environment variables
- PowerShell is recommended for running scripts
- Ensure FFmpeg is installed and in PATH

#### macOS
- Use `bash` for running scripts
- Ensure FFmpeg is installed via Homebrew: `brew install ffmpeg`
- Set `HOMEBREW_NO_AUTO_UPDATE=1` for faster builds

#### Linux
- Use `bash` for running scripts
- Ensure FFmpeg is installed: `sudo apt-get install ffmpeg`

## CI Workflow

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on Ubuntu, macOS, and Windows to ensure cross-platform compatibility.

## Usage

To generate a tutorial for Sushi Go!:

1. Ensure you have Node.js, FFmpeg, and Python installed
2. Run `npm install` to install dependencies
3. Run `npm run render -- games/sushi-go` to generate the tutorial

## Quality Gates

The CI pipeline enforces these quality gates:

- Audio levels must be within EBU R128 specifications
- Video must use yuv420p pixel format at 30fps
- All required operations must be covered in the tutorial
- Output must be consistent across all supported platforms
- Frame extraction performance must meet minimum thresholds