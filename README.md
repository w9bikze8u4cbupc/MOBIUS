# Mobius Games Tutorial Generator

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