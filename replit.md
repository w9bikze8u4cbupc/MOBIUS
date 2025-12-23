# Mobius Games Tutorial Generator

## Overview
Mobius Games Tutorial Generator is a comprehensive pipeline designed to automate the creation of professional game tutorial videos. It ingests structured game rules, uses AI for script and storyboard generation, synthesizes voiceovers, and renders high-quality video outputs. The project aims to streamline content creation for game tutorials, offering a scalable solution for publishers and game developers to produce engaging instructional media with minimal manual effort, thereby tapping into the growing market for accessible game learning resources.

## User Preferences
The agent should prioritize iterative development, asking for approval before making major architectural changes. It should provide detailed explanations for complex solutions and use simple, clear language in all communications. The agent must not modify any files or folders within the `genesis/` and `mobius/` directories.

## System Architecture
The system employs a client-server architecture. The frontend is a React application (`client/`) providing an 8-step pipeline UI for project setup, rulebook ingestion, AI script generation, image management, storyboard creation, voice synthesis, and render job management. The backend (`src/api/`), built with Express.js and Node.js, offers a RESTful API to manage all pipeline operations, including PDF parsing, BGG metadata scraping, AI integrations, image processing, and render queue management. Python components (`genesis/`, `mobius/`) handle advanced analytics, video quality metrics, and contract validation. The UI features enhanced loading states, progress bars, status badges, and an intuitive design with color-coded elements for clarity. Core features include an AI-powered multi-stage component detection pipeline for image extraction and automatic metadata and component extraction from rulebooks using GPT-4o.

## External Dependencies
- **AI Integrations**: Replit AI Integrations (for OpenAI GPT-4o)
- **Text-to-Speech**: ElevenLabs API
- **Database**: Local file-based storage (`./data`)
- **Image Processing**: `sharp` library
- **PDF Parsing**: `pdf-parse`, `pdf-lib` libraries, PyMuPDF (via HEPHAESTUS)
- **Web Scraping**: `axios`, `cheerio` (for BoardGameGeek integration)
- **OCR**: Tesseract.js (for text extraction from images)

## HEPHAESTUS Integration (December 2025)
The project now includes HEPHAESTUS, a Python-based PDF component extraction system that provides:
- **PyMuPDF-based extraction**: More robust than the previous pdf-parse approach
- **Hybrid classification**: Combines heuristics with AI-ready classification for component detection
- **Perceptual deduplication**: Uses imagehash to identify and remove duplicate images
- **Structured manifest output**: JSON manifests with complete metadata for all extracted components
- **Small component detection**: Lowered thresholds (16px min dimension, 400px² min area) to capture tokens, coins, and resource markers
- **Reference sheet rasterization**: Detects and rasterizes vector-drawn player aids and reference sheets
- **Enhanced classification**: Recognizes tokens, cards, tiles, boards, and reference sheets with improved heuristics

### HEPHAESTUS Files
- `hephaestus/` - Python source code for the extraction system
- `hephaestus/extract_api.py` - JSON API wrapper for Node.js integration (main extraction logic)
- `hephaestus/pdf/images.py` - Core image extraction with rasterization support
- `hephaestus/classifier/heuristics.py` - Heuristic-based component classification
- `hephaestus/classifier/model.py` - Hybrid classifier combining heuristics with vision
- `src/services/hephaestusService.js` - Node.js service that spawns Python subprocess

### API Endpoint
- `POST /api/projects/:projectId/images/extract-hephaestus` - Extracts images using HEPHAESTUS pipeline

### Classification Types
- `token` - Small near-square components (coins, resource markers, tokens)
- `card` - Standard card aspect ratios
- `tile` - Medium square-ish game tiles
- `board` - Large game boards
- `reference-sheet` - Player aids and reference cards (detected via page rasterization)
- `icon` - Non-component decorative icons
- `noise` - Artifacts filtered out