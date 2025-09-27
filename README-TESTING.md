# MOBIUS Testing Documentation

## Overview

This document describes the comprehensive testing infrastructure for the MOBIUS tutorial generator, including golden testing, cross-platform validation, and deployment verification procedures.

## Testing Architecture

### Test Categories

1. **Golden Tests** - Video/audio quality validation using reference files
2. **Unit Tests** - Individual component and function testing
3. **Integration Tests** - End-to-end pipeline validation
4. **Deployment Tests** - Cross-platform deployment verification

## Golden Testing Framework

### Concept

The golden testing system validates video output quality by comparing generated content against known-good reference files ("golden" references). This ensures consistent output quality across different environments and code changes.

### Golden Test Structure

```
tests/
├── golden/
│   ├── hanamikoji/
│   │   ├── container.json    # Video metadata reference
│   │   ├── audio_stats.json  # Audio quality reference
│   │   └── frames/          # Reference frame images
│   │       ├── frame_5s.png
│   │       ├── frame_10s.png
│   │       └── frame_20s.png
│   └── sushi-go/
│       └── ...
└── reports/                 # JUnit test reports
```

### Golden Test Metrics

#### Video Quality Metrics
- **SSIM (Structural Similarity)**: Measures visual similarity between frames
  - Threshold: 0.995 (99.5% similarity required)
  - Validates: Visual consistency, rendering accuracy
  
#### Audio Quality Metrics
- **LUFS (Loudness Units Full Scale)**: Measures perceived audio loudness
  - Tolerance: ±1.0 LUFS
  - Validates: Audio level consistency
  
- **True Peak**: Measures peak audio levels
  - Tolerance: ±1.0 dB
  - Validates: Audio clipping prevention

### Running Golden Tests

#### Generate Golden References
```bash
# Generate reference for specific game
npm run golden:update:sushi
npm run golden:update:loveletter

# Generate all references
npm run golden:approve
```

#### Run Golden Validation
```bash
# Check specific game
npm run golden:check:sushi
npm run golden:check:loveletter

# Check all games
npm run golden:check

# Generate JUnit reports
npm run golden:check-with-junit
```

#### Platform-Specific Testing
```bash
# Enable per-OS golden references
export GOLDEN_PER_OS=1
npm run golden:check

# Check with OS-specific references
npm run golden:check:all
```

### Golden Test Commands

#### Basic Commands
```bash
# Update golden references
node scripts/generate_golden.js --game "Game Name" --in "path/to/video.mp4" --out "tests/golden/game-name"

# Validate against golden
node scripts/check_golden.js --game "Game Name" --in "path/to/video.mp4" --golden "tests/golden/game-name"
```

#### Advanced Options
```bash
# Custom frame timestamps
--frames "5,10,20,30"

# Custom SSIM threshold
--ssim "0.990"

# Custom audio tolerances
--lufs_tol "2.0" --tp_tol "1.5"

# JUnit output
--junit "tests/reports/results.xml"
```

## Unit Testing

### Jest Configuration

The project uses Jest for unit testing with TypeScript support:

```json
{
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/src"],
    "testMatch": [
      "**/__tests__/**/*.ts",
      "**/?(*.)+(spec|test).ts"
    ]
  }
}
```

### Test Structure

```
src/
├── api/
│   ├── __tests__/
│   │   ├── aiUtils.test.ts
│   │   ├── pdfUtils.test.ts
│   │   └── index.test.ts
│   └── ...
└── components/
    ├── __tests__/
    │   └── ...
    └── ...
```

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- aiUtils.test.ts

# Watch mode for development
npm test -- --watch
```

## Integration Testing

### Pipeline Testing

Tests the complete video generation pipeline:

```bash
# Test complete pipeline
npm run test-pipeline

# Individual pipeline steps
npm run compile-shotlist
npm run verify
npm run bind-alignment
```

### API Integration Tests

Test API endpoints and data flow:

```bash
# Start test server
npm run test:api

# Run API integration tests
npm run test:integration
```

## Deployment Testing

### Cross-Platform Scripts

The deployment testing infrastructure includes scripts for multiple platforms:

#### Unix/Linux Testing
```bash
# Make scripts executable
chmod +x scripts/deploy/*.sh

# Run deployment wrapper (dry-run)
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Test individual components
./scripts/deploy/notify-mock.sh --test --type slack
./scripts/deploy/backup-mock.sh --dry-run
./scripts/deploy/monitor-mock.sh --status
```

#### Windows PowerShell Testing
```powershell
# Run deployment wrapper (dry-run)
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput

# Test individual components
.\scripts\deploy\notify-mock.ps1 -Test -Type slack
.\scripts\deploy\backup-mock.ps1 -DryRun
.\scripts\deploy\monitor-mock.ps1 -Status
```

### Verification Procedures

#### 1. Output File Verification
```bash
# Unix/Linux
sha256sum out/preview.mp4
ls -la out/

# Windows
Get-FileHash -Path .\out\preview.mp4 -Algorithm SHA256
Get-ChildItem .\out\ -Filter 'preview*' | Select-Object Name, Length, LastWriteTime
```

#### 2. Mock Integration Testing
```bash
# Test notification systems
./scripts/deploy/notify-mock.sh --test --type email
./scripts/deploy/notify-mock.sh --test --type slack

# Test backup systems
./scripts/deploy/backup-mock.sh --verify

# Test monitoring systems
./scripts/deploy/monitor-mock.sh --health-check
```

## Continuous Integration

### GitHub Actions Integration

Example workflow for automated testing:

```yaml
name: MOBIUS CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run unit tests
        run: npm test
      - name: Run golden tests
        run: npm run golden:check
      - name: Test deployment scripts
        run: ./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
```

### Cross-Platform CI

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [18, 20]
```

## Quality Gates

### Pre-Commit Checks
1. Unit tests must pass
2. Linting must pass
3. Golden tests must pass (if video content changed)
4. Cross-platform scripts must execute successfully

### Release Criteria
1. All test suites pass
2. Golden references updated for any video changes
3. Documentation updated
4. Deployment scripts validated on all platforms

## Troubleshooting

### Common Issues

#### Golden Test Failures
```bash
# Check for missing dependencies
which ffmpeg ffprobe

# Regenerate golden references if intended
npm run golden:approve

# Check platform-specific differences
export GOLDEN_PER_OS=1
npm run golden:check
```

#### Deployment Script Issues
```bash
# Check script permissions (Unix/Linux)
ls -la scripts/deploy/
chmod +x scripts/deploy/*.sh

# Verify PowerShell execution policy (Windows)
Get-ExecutionPolicy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### FFmpeg Issues
```bash
# Install FFmpeg
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Golden tests with debug output
node scripts/check_golden.js --verbose --debug

# Deployment with verbose output
./scripts/deploy/deploy-wrapper.sh --verbose --debug
```

## Performance Testing

### Benchmarking

```bash
# Time pipeline execution
time npm run test-pipeline

# Memory usage monitoring
node --max-old-space-size=4096 scripts/render-ffmpeg.mjs

# Golden test performance
time npm run golden:check
```

### Resource Monitoring

Monitor system resources during testing:

```bash
# CPU and memory usage
top -p $(pgrep -f "node.*golden")

# Disk I/O
iotop -p $(pgrep -f "node.*golden")

# Network usage (if applicable)
nethogs
```

---

This testing framework ensures reliable, consistent output across all supported platforms and environments. For additional help or questions, consult the main project documentation or contact the development team.