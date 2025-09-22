# Mobius Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules.

## Getting Started

### Prerequisites

- Node.js (v20.19.5 or higher)
- npm (v10.8.2 or higher)

### Installation

1. Install dependencies for the main project:
```bash
npm install
```

2. Install dependencies for the client:
```bash
cd client
npm install
```

### Running the Development Server

To start the client development server:

```bash
cd client
npm start
```

### Browser Configuration

By default, the development server will open Google Chrome when you run `npm start`. This is configured through the `.env` file in the client directory.

To use a different browser, you can:

1. Copy `.env.example` to `.env` in the client directory
2. Modify the `BROWSER` environment variable:

```bash
# For Google Chrome (default)
BROWSER=google-chrome

# For other browsers
BROWSER=firefox
BROWSER=chromium-browser

# For macOS users
BROWSER=google chrome

# For Windows users  
BROWSER=chrome

# To disable automatic browser opening
BROWSER=none
```

## Project Structure

- `client/` - React frontend application
- `src/api/` - Backend API server
- `scripts/` - Build and utility scripts
- `tests/` - Test files and golden reference data

## Scripts

- `npm start` - Start the development server
- `npm run build` - Build the production version
- `npm test` - Run tests
- `npm run test-pipeline` - Run the full pipeline test
