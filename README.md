# MOBIUS Game Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules, featuring multi-platform video processing and automated quality validation.

## Quick Start

### Prerequisites
- Node.js 20+
- FFmpeg installed
- Python 3.10+ (for video processing)

### Installation
```bash
npm ci
cd client && npm ci && cd ..
```

### Development
```bash
npm run test-pipeline  # Test the pipeline
npm run render:proxy   # Generate preview video
npm run golden:check   # Validate against golden files
```

## For Contributors

### Pull Request Process
Before merging any PR, please use our comprehensive validation process:

- **Quick reference**: See [QUICK_MERGE_CHECKLIST.md](QUICK_MERGE_CHECKLIST.md)
- **Full validation**: See [PR_MERGE_CHECKLIST.md](PR_MERGE_CHECKLIST.md)

The checklist ensures all CI gates pass, golden file validation succeeds, and proper backup/rollback procedures are in place.

### Golden File Testing
Our quality assurance relies on golden file validation across multiple platforms:
- Video frame comparison (SSIM ≥ 0.995)
- Audio level validation (LUFS/True Peak ± 1.0dB)  
- Cross-platform reproducibility

## Architecture

- **Backend**: Node.js/TypeScript pipeline
- **Client**: React-based UI
- **Video Processing**: Python + FFmpeg
- **Quality Assurance**: Automated golden file validation
- **CI/CD**: Multi-platform GitHub Actions workflows