# MOBIUS Tutorial System - Complete Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Installation & Setup](#installation--setup)
3. [Core Components](#core-components)
4. [Tutorial Generation Pipeline](#tutorial-generation-pipeline)
5. [Testing & Validation](#testing--validation)
6. [Deployment Workflow](#deployment-workflow)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)
9. [Contributing](#contributing)

## System Overview

MOBIUS is a comprehensive tutorial generation system designed to create high-quality video tutorials for board games. The system processes game rulebooks, extracts components and rules, and generates structured video content with narration, visual cues, and proper pacing.

### Key Features
- **Automated Rulebook Processing** - PDF parsing and content extraction
- **AI-Powered Script Generation** - OpenAI integration for natural language scripts
- **Multi-Language Support** - TTS generation in multiple languages
- **Component Recognition** - Automatic identification of game pieces
- **Video Pipeline** - FFmpeg-based rendering and post-processing
- **Quality Assurance** - Golden test validation and SSIM comparison

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- FFmpeg with libx264
- OpenAI API key
- ElevenLabs API key (for TTS)

### Environment Setup

#### Windows (PowerShell)
```powershell
# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm install

# Set environment variables
$env:OPENAI_API_KEY="your-openai-key-here"
$env:ELEVENLABS_API_KEY="your-elevenlabs-key-here"
$env:IMAGE_EXTRACTOR_API_KEY="your-image-api-key"
```

#### Linux/macOS (Bash)
```bash
# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm install

# Set environment variables
export OPENAI_API_KEY="your-openai-key-here"
export ELEVENLABS_API_KEY="your-elevenlabs-key-here" 
export IMAGE_EXTRACTOR_API_KEY="your-image-api-key"
```

### Verification
```bash
# Test the installation
npm test

# Verify FFmpeg installation
ffmpeg -version
ffprobe -version
```

## Core Components

### 1. API Server (`src/api/index.js`)
The main Express.js server that handles:
- Rulebook upload and processing
- AI-powered content extraction
- TTS generation
- Component cropping and management
- BGG (BoardGameGeek) integration

**Key Endpoints:**
- `POST /upload-pdf` - Upload and process rulebook PDFs
- `POST /generate-tts` - Generate text-to-speech audio
- `POST /crop-component` - Extract game component images
- `GET /bgg-data/:gameName` - Fetch BoardGameGeek metadata

### 2. Golden Test System
Quality assurance through visual and audio comparison:

**Generate Golden References:**
```bash
# Generate golden test data
npm run golden:update:sushi
npm run golden:update:loveletter
```

**Validate Against Golden Tests:**
```bash
# Check specific game
npm run golden:check:sushi
npm run golden:check:loveletter

# Check all games
npm run golden:check
```

### 3. Scripts Directory
- `scripts/check_golden.js` - SSIM validation and audio analysis
- `scripts/generate_golden.js` - Golden reference generation
- `scripts/deploy/` - Mock deployment scripts (new in this PR)

## Tutorial Generation Pipeline

### Step 1: Rulebook Processing
```javascript
// Upload PDF rulebook
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('gameName', 'Sushi Go');

const response = await fetch('/upload-pdf', {
  method: 'POST',
  body: formData
});
```

### Step 2: Component Extraction
```javascript
// Extract game components
const components = await fetch('/identify-components', {
  method: 'POST',
  body: JSON.stringify({ text: extractedText }),
  headers: { 'Content-Type': 'application/json' }
});
```

### Step 3: Script Generation
```javascript
// Generate tutorial script
const script = await fetch('/generate-script', {
  method: 'POST', 
  body: JSON.stringify({
    gameName: 'Sushi Go',
    rulebookText: text,
    components: componentList
  })
});
```

### Step 4: Audio Generation
```javascript
// Generate TTS audio
const audio = await fetch('/generate-tts', {
  method: 'POST',
  body: JSON.stringify({
    text: scriptText,
    language: 'en',
    voice: 'default',
    gameName: 'Sushi Go'
  })
});
```

## Testing & Validation

### Golden Test Validation
The system uses golden tests to ensure consistent video and audio output:

**Visual Testing (SSIM):**
- Extracts frames at specific timestamps
- Compares against golden reference frames
- Uses SSIM (Structural Similarity Index) for validation
- Generates diff images for debugging

**Audio Testing (EBU R128):**
- Measures loudness levels (LUFS)
- Validates true peak levels
- Ensures consistent audio quality

### Cross-Platform Testing
Use the new mock scripts for local validation:

#### Windows PowerShell
```powershell
# Run complete mock deployment
.\scripts\deploy\deploy-wrapper.ps1 --dry-run --verbose

# Individual components
.\scripts\deploy\backup.ps1 --dry-run
.\scripts\deploy\notify.ps1 --test
.\scripts\deploy\monitor.ps1 --status
```

#### Git Bash / Linux / macOS
```bash
# Run complete mock deployment
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Individual components  
./scripts/deploy/backup.sh --dry-run
./scripts/deploy/notify.sh --test
./scripts/deploy/monitor.sh --status
```

## Deployment Workflow

### Mock Deployment (Safe Testing)
The new mock scripts simulate the full deployment process:

1. **Backup Phase** - Simulates data backup operations
2. **Deploy Phase** - Mimics application deployment
3. **Notification Phase** - Mock alerts and status updates
4. **Monitoring Phase** - Simulated health checks
5. **Rollback Phase** - Mock rollback procedures (if needed)

### Production Deployment
*Note: Production scripts are not included in this repository for security*

```bash
# Example production flow (NOT INCLUDED)
# ./scripts/production/backup.sh --full
# ./scripts/production/deploy.sh --version=1.2.3
# ./scripts/production/notify.sh --channel=slack
# ./scripts/production/monitor.sh --duration=300
```

## Troubleshooting

### Common Issues

#### FFmpeg Not Found
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

#### OpenAI API Errors
- Verify API key is set correctly
- Check API quota and billing
- Ensure network connectivity

#### Golden Test Failures
```bash
# Generate debug output
node scripts/check_golden.js --game "Sushi Go" --in "out/preview.mp4" --debug

# Check debug images
ls tests/golden/sushi-go/debug/
```

#### Memory Issues
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm run golden:check
```

### Log Analysis
```bash
# Check server logs
tail -f logs/mobius.log

# Check deployment logs  
tail -f scripts/deploy/logs/deploy.log
```

## API Reference

### POST /upload-pdf
Upload and process a game rulebook PDF.

**Request:**
```javascript
FormData: {
  pdf: File,
  gameName: String
}
```

**Response:**
```javascript
{
  success: Boolean,
  data: {
    text: String,
    components: Array,
    metadata: Object,
    images: Array
  }
}
```

### POST /generate-tts
Generate text-to-speech audio from script text.

**Request:**
```javascript
{
  text: String,
  language: String, // 'en', 'es', 'fr', etc.
  voice: String,    // ElevenLabs voice ID
  gameName: String
}
```

**Response:**
```javascript
{
  success: Boolean,
  audioPath: String,
  duration: Number
}
```

### POST /crop-component
Extract a specific game component from an uploaded image.

**Request:**
```javascript
{
  imagePath: String,
  x: Number,
  y: Number, 
  width: Number,
  height: Number,
  name: String,
  gameName: String
}
```

**Response:**
```javascript
{
  success: Boolean,
  componentPath: String,
  preview: String
}
```

## Contributing

### Development Setup
```bash
# Fork the repository
git clone https://github.com/your-username/MOBIUS.git
cd MOBIUS

# Create feature branch
git checkout -b feature/your-feature-name

# Install dependencies
npm install

# Run tests
npm test
```

### Code Style
- Use ESLint configuration provided
- Follow existing naming conventions
- Add tests for new functionality
- Update documentation for API changes

### Testing Requirements
- All new features must include tests
- Golden tests must pass for video changes
- Mock scripts must work on Windows/Linux/macOS

### Pull Request Process
1. Create feature branch from main
2. Implement changes with tests
3. Update documentation
4. Ensure all tests pass
5. Submit PR with clear description

---

## Support

For questions, issues, or contributions:
- Create GitHub issues for bugs
- Submit feature requests via GitHub
- Review existing documentation first
- Include system information in bug reports

---

**Version:** 1.0.0  
**Last Updated:** September 2024  
**License:** MIT