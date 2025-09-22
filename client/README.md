# Mobius Games Tutorial Generator - Client

This is the React frontend for the Mobius Games Tutorial Generator application.

## Quick Start

```bash
cd client
npm install
npm start
```

The app will automatically open in Google Chrome at http://localhost:3000

## Browser Configuration

### Default Setup
The application is configured to use Google Chrome by default to avoid Brave browser localhost blocking issues.

### Customizing Browser
1. Copy the example configuration:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` to change the browser:
   ```bash
   # Available options:
   BROWSER=google-chrome    # Google Chrome (recommended)
   BROWSER=firefox          # Mozilla Firefox  
   BROWSER=msedge           # Microsoft Edge
   BROWSER=safari           # Safari (macOS only)
   BROWSER=chromium-browser # Chromium (Linux)
   BROWSER=none             # Don't auto-open browser
   ```

3. Start the development server:
   ```bash
   npm start
   ```

### Platform-Specific Browser Commands

| Platform | Chrome | Firefox | Edge | Safari | Chromium |
|----------|---------|---------|------|---------|----------|
| Windows  | `google-chrome` | `firefox` | `msedge` | N/A | N/A |
| macOS    | `google-chrome` | `firefox` | `msedge` | `safari` | N/A |
| Linux    | `google-chrome` | `firefox` | N/A | N/A | `chromium-browser` |

## Development

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Backend server running on port 5001

### Available Scripts
- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

### Environment Variables
The application uses the following environment variables:

- `BROWSER` - Browser to open during development (default: google-chrome)

## Troubleshooting

### Browser Issues
- **Brave browser blocking localhost**: Use Chrome instead (`BROWSER=google-chrome`)
- **Browser doesn't open**: Try `BROWSER=none` and open manually
- **Corporate proxy issues**: Set `BROWSER=none` and configure proxy in your browser

### Connection Issues
- **Cannot reach backend**: Ensure backend is running on http://localhost:5001
- **CORS errors**: Check that backend CORS is configured for http://localhost:3000

### Network Diagnostics
If you experience connectivity issues with external APIs (OpenAI, ElevenLabs), use the network diagnostic tools:

```bash
# From project root
./scripts/network-probe.sh
./scripts/network-diagnostics.sh
./scripts/reproduce-blocked-endpoints.sh
```

### Development Tips
- The app expects a backend server at http://localhost:5001
- PDF processing requires the backend server to be running
- Audio generation uses ElevenLabs API through the backend

## API Integration

The client communicates with:
- **Backend API**: http://localhost:5001 (local development server)
- **OpenAI API**: Via backend proxy
- **ElevenLabs API**: Via backend proxy

## Building for Production

```bash
npm run build
```

This builds the app for production to the `build` folder with optimized React code.