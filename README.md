# Mobius Games Tutorial Generator

An AI-powered application for generating interactive board game tutorials from rulebook PDFs.

## Project Structure

```
mobius-games-tutorial-generator/
├── client/                     # React frontend application
│   ├── public/                # Static assets
│   ├── src/                   # React components and logic
│   ├── .env                   # Environment variables (git-ignored)
│   ├── .env.example          # Environment variable template
│   └── package.json          # Frontend dependencies
├── src/
│   └── api/                   # Express.js backend API
├── scripts/                   # Build and test scripts
├── tests/                     # Test files and golden references
└── package.json              # Root project dependencies
```

## Quick Start

1. **Install dependencies:**
   ```bash
   # Install backend dependencies
   npm install
   
   # Install frontend dependencies
   cd client
   npm install
   ```

2. **Configure browser (optional):**
   ```bash
   cd client
   cp .env.example .env
   # Edit .env to customize which browser opens (defaults to Chrome)
   ```

3. **Start the application:**
   ```bash
   # Start backend (from root directory)
   npm start
   
   # Start frontend (from client directory)  
   cd client
   npm start
   ```

The React development server will automatically open your configured browser to `http://localhost:3000`.

## Browser Configuration

By default, `npm start` in the client directory will open **Google Chrome** for consistent development experience.

### Customizing Browser Behavior

The browser that opens is controlled by the `BROWSER` environment variable in `client/.env`:

```bash
# Default: Open Google Chrome
BROWSER=google-chrome

# Other options:
BROWSER=firefox           # Open Firefox
BROWSER=safari           # Open Safari (macOS)  
BROWSER=msedge           # Open Microsoft Edge
BROWSER=none             # Don't open any browser
BROWSER=                 # Use system default browser
```

### Platform-Specific Browser Paths

If the browser isn't found automatically, use the full path:

**Windows:**
```bash
BROWSER="C:\Program Files\Google\Chrome\Application\chrome.exe"
BROWSER="C:\Program Files\Mozilla Firefox\firefox.exe"
BROWSER="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
```

**macOS:**
```bash
BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BROWSER="/Applications/Firefox.app/Contents/MacOS/firefox"
BROWSER="/Applications/Safari.app/Contents/MacOS/Safari"
```

**Linux:**
```bash
BROWSER=google-chrome
BROWSER=google-chrome-stable
BROWSER=firefox
```

### Setting Up Browser Configuration

1. **Copy the example file:**
   ```bash
   cd client
   cp .env.example .env
   ```

2. **Edit your preferences:**
   ```bash
   # Edit .env with your preferred browser
   nano .env
   ```

3. **Restart the dev server:**
   ```bash
   npm start
   ```

## Development

- **Frontend**: React application with PDF processing and AI integration
- **Backend**: Express.js API server with OpenAI integration
- **Default Ports**: Frontend (3000), Backend (5001)

## Environment Files

- `.env` files are git-ignored for individual developer preferences
- `.env.example` files are tracked to provide templates and documentation
- Copy `.env.example` to `.env` and customize as needed

## Troubleshooting

### Browser Won't Open
- Verify the browser is installed and accessible in your system PATH
- Use the full path to the browser executable in `.env`
- Check that the `BROWSER` environment variable is set correctly

### Connection Refused Errors  
- Some browsers (like Brave) may block localhost connections
- Try switching to Chrome or Firefox using the browser configuration above
- Ensure both frontend and backend servers are running

### Desktop Shortcuts
If using desktop shortcuts, update them to launch Chrome explicitly:
```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" http://localhost:3000

# macOS  
open -a "Google Chrome" http://localhost:3000

# Linux
google-chrome http://localhost:3000
```
