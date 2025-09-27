# MOBIUS Games Tutorial Video Generator - Complete Tutorial

## Table of Contents
1. [Introduction](#introduction)
2. [System Overview](#system-overview)
3. [Installation & Setup](#installation--setup)
4. [Creating Your First Tutorial](#creating-your-first-tutorial)
5. [Golden Testing Framework](#golden-testing-framework)
6. [Cross-Platform Deployment](#cross-platform-deployment)
7. [Advanced Features](#advanced-features)
8. [Troubleshooting](#troubleshooting)

## Introduction

MOBIUS is an automated pipeline for generating high-quality board game tutorial videos from structured game rules. The system combines AI-powered content analysis, automated shot planning, and cross-platform video rendering to create professional tutorial content.

### Key Features
- 📚 **Automated Content Analysis**: AI extracts game components, rules, and tutorial structure
- 🎬 **Intelligent Shot Planning**: Generates optimized camera angles and timing
- 🎥 **Professional Rendering**: FFmpeg-based video production pipeline  
- 🧪 **Golden Testing**: Frame-accurate quality assurance across platforms
- 🚀 **Mock Deployment**: Safe testing infrastructure for production deployments

## System Overview

### Architecture
```
Game Rules (PDF/Text)
    ↓
AI Content Analysis (src/api/index.js)
    ↓
Shot List Generation (scripts/compile-shotlist.mjs)
    ↓
Timeline Binding (scripts/bind-alignment.mjs)  
    ↓
Video Rendering (scripts/render-ffmpeg.mjs)
    ↓
Quality Verification (scripts/check_golden.js)
    ↓
Mock Deployment (scripts/deploy/)
```

### Core Components
- **Content Pipeline**: Processes game rules into structured tutorial data
- **Rendering Engine**: Creates video from shot lists and assets
- **Golden Framework**: Ensures consistent quality across builds and platforms
- **Deployment Mocks**: Safe testing environment for production workflows

## Installation & Setup

### Prerequisites
- Node.js 18+
- FFmpeg with libx264, libpng, and audio support
- Git (for version control and scripting)

### Quick Setup
```bash
# Clone and install dependencies
git clone <repository-url>
cd MOBIUS
npm install

# Verify FFmpeg installation
ffmpeg -version
ffprobe -version

# Run initial tests
npm test
```

### Platform-Specific Setup

#### Windows
```powershell
# Verify PowerShell execution policy
Get-ExecutionPolicy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Test deployment scripts
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput
```

#### Linux/macOS
```bash
# Make scripts executable
chmod +x scripts/deploy/*.sh

# Test deployment scripts  
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
```

## Creating Your First Tutorial

### Step 1: Prepare Game Data
Create a game configuration file:
```json
{
  "name": "Example Game",
  "publisher": "Example Publisher",
  "components": ["cards", "tokens", "board"],
  "rules_source": "path/to/rules.pdf"
}
```

### Step 2: Generate Shot List
```bash
npm run compile-shotlist -- games/example-game.json > tmp/shotlist.json
```

### Step 3: Create Timeline
```bash
npm run bind-alignment -- tmp/shotlist.json assets/ > tmp/timeline.json
```

### Step 4: Render Preview
```bash
npm run render:proxy -- tmp/timeline.json assets/ out/preview.mp4
```

### Step 5: Verify Quality
```bash
# Generate golden reference
npm run golden:update -- --game "Example Game" --in "out/preview.mp4"

# Check against golden
npm run golden:check -- --game "Example Game" --in "out/preview.mp4"
```

## Golden Testing Framework

The golden testing system ensures consistent video quality across platforms and builds.

### How It Works
1. **Reference Generation**: Creates "golden" reference frames and audio metrics
2. **Comparison Testing**: New builds are compared against golden references
3. **Cross-Platform Support**: Platform-specific references when needed
4. **Automated Reports**: JUnit-compatible test reports for CI/CD

### Golden Test Commands
```bash
# Update golden references for a game
npm run golden:update:sushi

# Check current build against golden
npm run golden:check:sushi  

# Generate JUnit test report
npm run golden:check-with-junit

# Cross-platform testing
GOLDEN_PER_OS=1 npm run golden:update
```

### Quality Thresholds
- **Video SSIM**: ≥0.995 (structural similarity)
- **Audio LUFS**: ±1.0 dB tolerance (loudness)
- **Audio Peak**: ±1.0 dB tolerance (true peak)

## Cross-Platform Deployment

### Mock Deployment System
Safe testing environment that simulates real deployment without actual publishing.

#### Features
- **Dry Run Mode**: Test workflows without side effects
- **Hash Verification**: SHA256 integrity checking
- **Platform Detection**: Automatic Windows/Unix adaptation
- **Verbose Logging**: Detailed operation tracking
- **Error Simulation**: Test error handling paths

#### Usage Examples

##### PowerShell (Windows Native)
```powershell
# Basic dry run
.\scripts\deploy\deploy-wrapper.ps1 -DryRun

# Verbose with hash verification
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput
Get-FileHash "out/preview.mp4" -Algorithm SHA256

# Simulate errors
.\scripts\deploy\deploy-wrapper.ps1 -SimulateError -DryRun
```

##### Bash (Linux/macOS/Git Bash/WSL)
```bash
# Basic dry run
./scripts/deploy/deploy-wrapper.sh --dry-run

# Verbose with hash verification  
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
sha256sum out/preview.mp4

# Simulate errors
./scripts/deploy/deploy-wrapper.sh --simulate-error --dry-run
```

### Integration Testing Workflow
```bash
# 1. Render video
npm run render:proxy

# 2. Verify quality
npm run golden:check

# 3. Test deployment (mock)
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# 4. Verify integrity
sha256sum out/preview.mp4
```

## Advanced Features

### AI-Powered Content Analysis
The system uses OpenAI to analyze game rules and generate structured tutorial content:

```javascript
// Extract components and tutorial structure
const analysis = await identifyComponents(rulesText);
// Returns: components, video_sections, script_outline, visual_assets
```

### Custom Video Sections
Configure tutorial chapters:
```json
{
  "video_sections": [
    "Overview",
    "Component Tour", 
    "Setup",
    "Turn Structure",
    "Scoring",
    "Example Turn",
    "Common Mistakes",
    "Winning Tips"
  ]
}
```

### Platform-Specific Golden References
For cross-platform consistency:
```bash
# Generate platform-specific references
GOLDEN_PER_OS=1 npm run golden:update

# Directory structure:
# tests/golden/game/windows/
# tests/golden/game/linux/
# tests/golden/game/macos/
```

## Troubleshooting

### Common Issues

#### FFmpeg Not Found
```bash
# Check installation
ffmpeg -version
# Install via package manager if missing
```

#### PowerShell Execution Policy
```powershell
# Allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Golden Test Failures
```bash
# Regenerate references after intentional changes
npm run golden:approve

# Check specific game
npm run golden:check:sushi -- --verbose

# Debug with frame differences
ls tests/golden/*/debug/
```

#### Mock Deployment Issues
```bash
# Verify script permissions
chmod +x scripts/deploy/*.sh

# Test with verbose output
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
```

### Debug Tips

1. **Use Verbose Mode**: Add `--verbose` flag to see detailed operations
2. **Check Debug Directories**: Golden tests create `debug/` folders with diff images
3. **Platform Detection**: Scripts auto-detect platform, check with `--dry-run`
4. **Hash Verification**: Always verify file integrity after operations

### Getting Help

1. Check `README-TESTING.md` for detailed testing procedures
2. Review existing game configurations in `games/` directory
3. Examine golden test artifacts in `tests/golden/`
4. Use mock deployment scripts to test workflows safely

## Contributing

When contributing to MOBIUS:

1. **Test Cross-Platform**: Use both bash and PowerShell deployment mocks
2. **Update Golden References**: Regenerate references for video changes
3. **Document Changes**: Update this tutorial for new features
4. **Mock Before Deploy**: Always test with deployment mocks first

The mock deployment infrastructure ensures safe development and testing of the complete MOBIUS pipeline across all supported platforms.