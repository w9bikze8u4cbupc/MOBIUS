# Mobius Games Tutorial Generator

## Overview
A comprehensive pipeline for generating professional game tutorial videos from structured game rules. The system includes ingestion of rulebooks, AI-powered script generation, storyboard creation, voice synthesis, and video rendering capabilities.

## Project Architecture

### Frontend (React)
- Location: `client/`
- Port: 5000 (development)
- Main component: Board Game Tutorial Generator UI with pipeline steps
- Features:
  - Project setup and game metadata input
  - PDF rulebook ingestion and BoardGameGeek integration
  - AI-powered script generation
  - Image management and enhancement
  - Storyboard creation
  - Voice synthesis with ElevenLabs
  - Render job management
  - GENESIS quality control and optimization tools

### Backend (Express.js/Node.js)
- Location: `src/api/`
- Port: 5001
- Entry point: `src/api/index.js`
- Features:
  - RESTful API for all pipeline operations
  - PDF parsing and text extraction
  - BGG metadata scraping
  - OpenAI integration for AI summarization
  - ElevenLabs integration for TTS
  - Image processing pipeline
  - Render queue management
  - GENESIS feedback and analytics
  - Gateway security with CORS and API key support

### Python Components
- Location: `genesis/`, `mobius/`
- Used for:
  - Advanced GENESIS analytics
  - Video quality metrics
  - Contract validation
  - Captions and localization

## Environment Variables

### Required
- `OPENAI_API_KEY` - For AI-powered script generation (request via secrets)
- `ELEVENLABS_API_KEY` - For text-to-speech generation (request via secrets)

### Optional
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Backend server port (default: 5001)
- `MOBIUS_CORS_ORIGINS` - CORS allowed origins (default: *)
- `MOBIUS_API_KEYS` - API keys for production authentication
- `IMAGE_EXTRACTOR_API_KEY` - For external image extraction services
- `DB_DATA_DIR` - Database directory (default: ./data)
- `OUTPUT_DIR` - Output directory (default: ./output/MobiusGames)

## Recent Changes (Nov 28, 2025)
- Fixed package.json dependency: updated pdf-to-img from ^1.2.4 to ^5.0.0
- Configured React frontend to run on port 5000 with proper host settings for Replit
- Added default export to App.js component
- Set up environment variables for development and production
- Created workflow for frontend deployment
- Configured deployment with autoscale target
- Updated backend to serve React build in production
- Fixed BACKEND_URL to use relative paths in production
- Added production scripts: `npm start` sets NODE_ENV=production
- Updated server to listen on port 5000 by default (production) and 0.0.0.0 host
- Added catch-all route for React Router SPA support

## Project Structure
```
.
├── client/              # React frontend application
├── src/
│   ├── api/            # Express backend and routes
│   ├── ingestion/      # Rulebook ingestion pipeline
│   ├── storyboard/     # Storyboard generation
│   ├── services/       # Image pipeline and AI services
│   ├── validators/     # Contract validators
│   └── video_generator.py  # FFmpeg video generation
├── genesis/            # GENESIS quality control system
├── mobius/             # Core video pipeline utilities
├── scripts/            # Build and validation scripts
├── tests/              # Test suites
├── config/             # Configuration files
└── docs/               # Governance and specification docs
```

## Development Workflow
1. Frontend runs on port 5000 (Replit webview) - React dev server
2. Backend API runs on port 5001 (localhost) - Express server
3. Frontend connects to backend via http://localhost:5001

## Production Deployment
1. Build process: `npm run build` - builds React app to client/build
2. Single server: Express serves both API and static React build on port 5000
3. Frontend uses relative URLs to call API on same domain
4. Environment: NODE_ENV=production

## Known Dependencies
- Node.js packages: express, axios, cheerio, openai, multer, sharp, pdf-parse, etc.
- Python: Standard library only (json, dataclasses, pathlib, etc.)
- External services: OpenAI API, ElevenLabs API

## Deployment
- Target: Autoscale (stateless web application)
- Build: Compiles React frontend to production build
- Run: Serves backend API and frontend simultaneously
