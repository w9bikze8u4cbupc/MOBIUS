# MOBIUS Tutorial Generator - Comprehensive Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Project Architecture](#project-architecture)
3. [Installation & Setup](#installation--setup)
4. [Core Features](#core-features)
5. [Usage Examples](#usage-examples)
6. [API Documentation](#api-documentation)
7. [Testing Framework](#testing-framework)
8. [Deployment](#deployment)
9. [Contributing](#contributing)

## Introduction

MOBIUS is an advanced tutorial video generation pipeline that transforms structured game rules into engaging video content. The system leverages AI-powered content analysis, visual rendering, and audio synthesis to create professional-quality tutorial videos automatically.

### Key Capabilities
- **Automated Content Analysis**: Extract game components, rules, and mechanics from rulebooks
- **Visual Rendering**: Generate video content with synchronized visuals and narration
- **Multi-language Support**: Support for English and French tutorial generation
- **Quality Assurance**: Golden testing framework for video output validation
- **Cross-platform Deployment**: Support for Windows, macOS, and Linux environments

## Project Architecture

### Core Components

```
MOBIUS/
├── src/                    # Source code
│   ├── api/               # API layer and core logic
│   │   ├── index.js       # Main API server
│   │   ├── aiUtils.js     # AI integration utilities
│   │   ├── pdfUtils.js    # PDF processing utilities
│   │   └── prompts.js     # AI prompt templates
│   └── components/        # Reusable components
├── client/                # Frontend application
├── scripts/               # Build and deployment scripts
│   ├── check_golden.js    # Quality assurance testing
│   ├── generate_golden.js # Golden reference generation
│   └── deploy/           # Deployment infrastructure
├── tests/                # Test suites and golden references
└── docs/                 # Documentation
```

### Technology Stack
- **Backend**: Node.js with Express
- **AI Integration**: OpenAI GPT models
- **Video Processing**: FFmpeg
- **PDF Processing**: pdf-parse, pdf-to-img
- **Image Processing**: Sharp
- **Database**: Custom JSON-based storage
- **Testing**: Jest with custom golden testing framework

## Installation & Setup

### Prerequisites
- Node.js 18.0 or higher
- FFmpeg (for video processing)
- Git
- npm or yarn package manager

### Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
   cd MOBIUS
   ```

2. **Install Dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   PORT=5001
   OUTPUT_DIR=./uploads/MobiusGames
   IMAGE_EXTRACTOR_API_KEY=your_image_api_key
   ```

4. **Verify Installation**
   ```bash
   npm test
   npm run verify
   ```

## Core Features

### 1. Rulebook Processing
- **PDF Text Extraction**: Advanced OCR and text parsing
- **Component Recognition**: AI-powered identification of game components
- **Metadata Extraction**: Automatic extraction of game information (publisher, player count, etc.)

### 2. Content Generation
- **Chunk-based Processing**: Intelligent text segmentation for optimal AI processing
- **Multi-language Support**: English and French tutorial generation
- **Custom Prompts**: Specialized prompts for different content types

### 3. Video Rendering
- **Timeline Generation**: Automated creation of video timelines
- **Visual Synchronization**: Alignment of visuals with narration
- **Quality Control**: Built-in validation and quality checks

### 4. Quality Assurance
- **Golden Testing**: Frame-by-frame comparison with reference videos
- **Audio Analysis**: LUFS and peak measurement validation
- **SSIM Comparison**: Structural similarity analysis for visual validation

## Usage Examples

### Basic Tutorial Generation

```bash
# Generate a tutorial for a specific game
npm run compile-shotlist gigs/hanamikoji.json

# Render preview video
npm run render:proxy

# Validate output quality
npm run golden:check
```

### API Usage

```javascript
// Start the API server
const app = require('./src/api/index.js');

// Process a rulebook
const response = await fetch('http://localhost:5001/api/explain-chunk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameName: 'Example Game',
    rulebookText: 'Game rules text...',
    language: 'english'
  })
});
```

### Component Extraction

```javascript
// Extract components from rulebook
const components = await extractComponentsFromText(rulebookText);
console.log('Detected components:', components);
```

## API Documentation

### Core Endpoints

#### POST /api/explain-chunk
Generate tutorial content from rulebook text.

**Request Body:**
```json
{
  "gameName": "string",
  "rulebookText": "string",
  "language": "english|french",
  "metadata": {
    "publisher": "string",
    "playerCount": "string",
    "gameLength": "string",
    "theme": "string"
  }
}
```

**Response:**
```json
{
  "success": true,
  "summary": "Generated tutorial content",
  "metadata": {...},
  "components": [...]
}
```

#### POST /api/extract-components
Extract game components from PDF or text.

**Request:** Multipart form with PDF file or text content

**Response:**
```json
{
  "success": true,
  "components": [
    {
      "name": "string",
      "quantity": "number|null",
      "selected": "boolean",
      "confidence": "number"
    }
  ]
}
```

## Testing Framework

### Golden Testing System

The project uses a sophisticated golden testing framework that validates video output quality:

```bash
# Generate golden references
npm run golden:update

# Run quality checks
npm run golden:check

# Check specific game
npm run golden:check:sushi
```

### Test Categories

1. **Visual Quality Tests**
   - Frame-by-frame SSIM comparison
   - Visual artifact detection
   - Resolution and format validation

2. **Audio Quality Tests**
   - LUFS measurement validation
   - Peak level analysis
   - Audio synchronization checks

3. **Integration Tests**
   - End-to-end pipeline validation
   - API endpoint testing
   - Component extraction accuracy

### Custom Test Commands

```bash
# Run all tests
npm test

# Run pipeline tests
npm run test-pipeline

# Generate JUnit reports
npm run golden:check-with-junit
```

## Deployment

### Cross-Platform Scripts

The project includes comprehensive deployment scripts for multiple platforms:

```bash
# Unix/Linux deployment
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Windows PowerShell deployment
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput
```

### Docker Support

```dockerfile
# Example Dockerfile usage
FROM node:18
COPY . /app
WORKDIR /app
RUN npm install
EXPOSE 5001
CMD ["npm", "start"]
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 5001 |
| `OUTPUT_DIR` | Video output directory | ./uploads/MobiusGames |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `GOLDEN_PER_OS` | Platform-specific golden tests | 0 |

## Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make changes and test thoroughly
4. Run quality checks: `npm run golden:check`
5. Submit a pull request

### Code Standards

- Follow existing code style and conventions
- Add tests for new functionality
- Update documentation for API changes
- Ensure cross-platform compatibility

### Testing Requirements

- All new features must include tests
- Golden tests must pass for video processing changes
- API endpoints must include integration tests
- Cross-platform compatibility must be verified

---

For more detailed information, see the individual documentation files in the `docs/` directory or contact the development team.