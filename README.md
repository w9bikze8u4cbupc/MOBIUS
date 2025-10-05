# Mobius Games Tutorial Generator

## Overview
The Mobius Games Tutorial Generator is a web application that creates interactive tutorials for board games using AI-powered text generation and voice synthesis.

## Quick Start
To launch the tutorial generator, you can use one of the following methods:

### Method 1: Using the Launch Scripts (Recommended)
Double-click on either of these files in the project root:
- `launch-tutorial-generator.bat` (Windows)
- `launch-tutorial-generator.ps1` (PowerShell)

### Method 2: Manual Start
1. Start the backend server:
   ```
   node src/api/index.js
   ```
   
2. In a separate terminal, start the frontend client:
   ```
   cd client
   npm start
   ```

## Accessing the Application
Once both services are running:
- Open your browser to http://localhost:3001
- The tutorial generator interface will be displayed

## Environment Configuration
The application uses the following environment variables (configured in `client/.env`):
- `REACT_APP_SHOW_DEV_TEST=false` - Ensures the Tutorial Generator (not DevTestPage) is displayed
- `REACT_APP_API_BASE=http://localhost:5002` - Backend API endpoint
- `REACT_APP_WS_URL=ws://localhost:5002/ws` - WebSocket connection for real-time updates

## System Requirements
- Node.js v14 or higher
- npm v6 or higher
- Python 3.8+ (for video generation components)
- FFmpeg (for media processing)

## Features
- PDF rulebook parsing and analysis
- AI-powered tutorial script generation
- Multi-language support (English, French)
- Text-to-speech audio generation
- Interactive tutorial interface