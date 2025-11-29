# Mobius Games Tutorial Generator

## Overview
A comprehensive pipeline for generating professional game tutorial videos from structured game rules. The system includes ingestion of rulebooks, AI-powered script generation, storyboard creation, voice synthesis, and video rendering capabilities.

## Project Architecture

### Frontend (React)
- Location: `client/`
- Port: 5000 (development webview)
- Main component: Board Game Tutorial Generator UI with 8-step pipeline
- Features:
  - Project setup and game metadata input
  - PDF rulebook ingestion and BoardGameGeek integration
  - AI-powered script generation (GPT-4o)
  - Image management and enhancement
  - Storyboard creation
  - Voice synthesis with ElevenLabs
  - Render job management
  - GENESIS quality control and optimization tools
  - Enhanced UI with loading states, progress bars, and status badges

### Backend (Express.js/Node.js)
- Location: `src/api/`
- Port: 8000 (development), 5000 (production)
- Entry point: `src/api/index.js`
- Uses ES Modules (type: module in src/api/package.json)
- Features:
  - RESTful API for all pipeline operations
  - PDF parsing and text extraction
  - BGG metadata scraping
  - OpenAI integration via Replit AI Integrations (GPT-4o)
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

### AI Integration (Automatic via Replit)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Replit AI Integrations base URL (auto-configured)
- `AI_INTEGRATIONS_OPENAI_API_KEY` - Replit AI Integrations API key (auto-configured)

### Optional (Legacy Fallback)
- `OPENAI_API_KEY` - Direct OpenAI API key (fallback if AI Integrations not available)
- `ELEVENLABS_API_KEY` - For text-to-speech generation (request via secrets)

### Configuration
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Backend server port (default: 8000 dev, 5000 prod)
- `MOBIUS_CORS_ORIGINS` - CORS allowed origins (default: *)
- `MOBIUS_API_KEYS` - API keys for production authentication
- `IMAGE_EXTRACTOR_API_KEY` - For external image extraction services
- `DB_DATA_DIR` - Database directory (default: ./data)
- `OUTPUT_DIR` - Output directory (default: ./output/MobiusGames)

## Recent Changes (Nov 29, 2025)

### AI Component Cropping Fixed
- **Simplified GPT-4o Vision Prompt**: Reduced prompt complexity to avoid Azure content filter blocks
- **Multi-Layer Validation**: Filters by confidence (≥8), area (1-70%), aspect ratio, and minimum size (80px)
- **Entropy-Based Post-Processing**: Rejects low-entropy crops (text/diagrams have lower entropy than photos)
- **Normalized Coordinates**: Uses 0-1 normalized bounding boxes for reliability
- **JSON Mode**: Uses `response_format: { type: 'json_object' }` for reliable parsing
- **Successfully tested on Abyss**: Extracted 20 component images from 12 pages

## Previous Changes (Nov 28, 2025)

### Step 3 Automation (Latest)
- **Automatic Component Extraction**: When entering Step 3 (Ingestion Review), MOBIUS automatically:
  - Extracts game components using GPT-4o AI from the rulebook PDF
  - Runs document structure analysis in parallel
  - No manual button clicks required - just navigate to Step 3
- **Smart Re-run Prevention**: Only triggers extraction when rulebook content changes
- **Reset on PDF Change**: Auto-trigger resets when a new PDF is uploaded

### Step 4 Image Extraction (Latest)
- **Native PDF Image Extraction**: Attempts to extract embedded images directly from PDF structure
  - Uses pdf-lib to parse PDF XObject image references
  - Decodes compressed streams (DCTDecode for JPEG, FlateDecode for raw)
  - Only works for PDFs with actual embedded image objects
- **Page Extraction Fallback**: Most rulebook PDFs use full-page layouts, so extraction falls back to:
  - Extracting full pages as high-quality images
  - 12 pages from a typical rulebook become 12 browsable images
- **AI Component Cropping (NEW)**: GPT-4o Vision detects and crops individual game components
  - Uses bounding box detection to find cards, tokens, boards, dice, miniatures, tiles
  - Returns percentage-based coordinates for accurate cropping
  - Filters out text blocks, diagrams, and decorative elements
  - Sharp library performs the actual image cropping
  - Cropped components saved to `data/component-crops/<projectId>/`
- **Quality Filtering**: Only extracts images >= 100x100 pixels
- **Enhanced UI**: 
  - Blue color coding for rulebook page images
  - Green color coding for native embedded images (when available)
  - Shows page number for provenance
- **Image Thumbnails**: Displays actual image thumbnails from extracted rulebook pages
  - Image serving endpoint: `GET /api/projects/:projectId/images/:imageId/file`
  - Secure path validation prevents directory traversal
  - Works for rulebook images, ai-crops, manual uploads, and BGG images
- **Auto-Gather Images**: One-click button to collect images from all available sources
  - AI vision-based component cropping (primary method)
  - PDF page extraction (fallback)
  - BoardGameGeek image fetch (requires BGG ID due to API auth changes)
- **AI-Powered Component Matching**: GPT-4o analyzes images and automatically matches them to game components
  - Matches based on image source, tags, and component categories
  - Fallback to category-based matching if AI unavailable
- **Learning System**: Train MOBIUS to improve matching over time
  - Enable "Learning Mode" to review and confirm/reject matches
  - Confirm correct matches to reinforce patterns
  - Reject incorrect matches to teach MOBIUS what to avoid
  - Patterns stored in `data/match-learning.json`
- **New API Endpoints**:
  - `GET /api/projects/:projectId/images/:imageId/file` - Serve image files
  - `POST /api/projects/:projectId/images/extract-native` - Native embedded image extraction
  - `POST /api/projects/:projectId/images/extract-pdf` - Full page extraction (fallback)
  - `POST /api/projects/:projectId/images/auto-match` - AI component matching
  - `POST /api/projects/:projectId/match-feedback` - Save match confirmations
  - `GET /api/learning/patterns` - Get learned matching patterns
- **BGG Search Improvement**: Now searches by game name (not just ID) with graceful fallback

### AI-Powered Game Component Extraction
- Uses GPT-4o to extract exact physical game components from PDF rulebooks
- Extracts: component name, exact quantity, category, and details (colors, materials)
- Categories: cards, tokens, boards, tiles, dice, meeples, miniatures, markers, cubes, other
- Uses first 12,000 characters of PDF for comprehensive component coverage
- Components displayed grouped by category with color-coded icons
- Inline editing: modify name, quantity, or details for any component
- Add/delete components manually for corrections
- `/api/extract-game-components` endpoint in backend

### Automatic Metadata Extraction
- AI-powered game metadata extraction from PDF rulebooks using GPT-4o
- Extracts: game name, publisher, player count, game length, minimum age, theme, edition
- Uses first 6000 characters of PDF for comprehensive metadata capture
- BoardGameGeek integration (optional - requires API token as of 2024)
- Intelligent fallback: PDF metadata -> BGG metadata -> user input
- Metadata state properly shared across all pipeline stages
- Redesigned UI with horizontal pill-style step navigation
- Prominent centered PDF drop zone for better user experience
- Editable metadata fields with real-time updates

### AI Integration Upgrade
- Set up Replit AI Integrations for OpenAI - no API key management needed
- Using GPT-4o model for reliable AI extraction and script generation
- Updated OpenAI client to use AI Integrations with legacy fallback
- Fixed malformed template literals in script generation prompts
- Fixed typos in system prompts ("YoYou are" -> "You are")

### Backend Improvements
- Updated backend to run on port 8000 in development
- Created missing utility files: aiUtils.js, pdfUtils.js, utils.js
- Added ES Module support via src/api/package.json and src/services/package.json
- Added explainChunkWithAI and extractComponentsWithAI functions
- Configured dual workflows: Start Backend (port 8000) and Start Frontend (port 5000)
- `/api/extract-game-name` endpoint extracts full game metadata from PDF text
- `/api/bgg-search` endpoint for BoardGameGeek integration (handles 401 auth gracefully)

### UI/UX Enhancements
- Added comprehensive CSS improvements in pipeline.css:
  - Enhanced button styles with gradients and hover effects
  - Loading spinner animations
  - Progress bars (determinate and indeterminate)
  - Status badges (success, warning, error, info)
  - Toast messages for notifications
  - Enhanced form inputs with focus states
  - Skeleton loading placeholders
  - Fade-in and pulse animations
- Updated ScriptStep component with loading states and better feedback
- Updated IngestionReviewStep with metric cards and progress indicators

### Previous Changes
- Fixed package.json dependency: updated pdf-to-img from ^1.2.4 to ^5.0.0
- Configured React frontend to run on port 5000 with proper host settings
- Set up environment variables for development and production
- Configured deployment with autoscale target
- Added catch-all route for React Router SPA support

## Project Structure
```
.
├── client/              # React frontend application
│   ├── src/
│   │   ├── components/  # Pipeline step components
│   │   ├── styles/      # CSS styles including pipeline.css
│   │   └── App.js       # Main application component
│   └── package.json
├── src/
│   ├── api/             # Express backend and routes
│   │   ├── index.js     # Main API server
│   │   ├── aiUtils.js   # AI helper functions
│   │   ├── pdfUtils.js  # PDF extraction utilities
│   │   ├── utils.js     # General utilities
│   │   └── package.json # ES module config
│   ├── ingestion/       # Rulebook ingestion pipeline
│   ├── storyboard/      # Storyboard generation
│   ├── services/        # Image pipeline and AI services
│   ├── validators/      # Contract validators
│   └── video_generator.py  # FFmpeg video generation
├── genesis/             # GENESIS quality control system
├── mobius/              # Core video pipeline utilities
├── scripts/             # Build and validation scripts
├── tests/               # Test suites
├── config/              # Configuration files
└── docs/                # Governance and specification docs
```

## Development Workflow
1. Start Backend: Runs on port 8000 - Express API server
2. Start Frontend: Runs on port 5000 - React dev server (Replit webview)
3. Frontend connects to backend via http://localhost:8000

## Production Deployment
1. Build process: `npm run build` - builds React app to client/build
2. Single server: Express serves both API and static React build on port 5000
3. Frontend uses relative URLs to call API on same domain
4. Environment: NODE_ENV=production

## Known Dependencies
- Node.js packages: express, axios, cheerio, openai, multer, sharp, pdf-parse, etc.
- Python: Standard library only (json, dataclasses, pathlib, etc.)
- External services: Replit AI Integrations (OpenAI), ElevenLabs API

## Deployment
- Target: Autoscale (stateless web application)
- Build: Compiles React frontend to production build
- Run: Serves backend API and frontend simultaneously on port 5000
