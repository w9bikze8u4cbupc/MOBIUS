# Frontend-Backend Connection Fix

## Issue Summary
The frontend was unable to connect to the backend API due to a `net::ERR_CONNECTION_REFUSED` error for endpoints like:
- `:5001/api/extract-bgg-html`
- `:5001/api/extract-extra-images`

## Root Causes Identified

### 1. Backend Server Not Running
The primary issue was that the backend API server was not running or had startup errors.

### 2. Missing Dependencies and Definitions
Several critical components were missing from the API implementation:
- `UPLOADS_DIR` constant was undefined
- `ensureUploadsTmp()` function was missing
- `OpenAI` import was missing
- Port configuration was missing

### 3. Startup Errors
The server was failing to start due to reference errors:
```
ReferenceError: ensureUploadsTmp is not defined
ReferenceError: OpenAI is not defined
```

## Fixes Implemented

### 1. Added Missing Definitions
Added the missing `UPLOADS_DIR` constant and `ensureUploadsTmp()` function:
```javascript
// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure uploads/tmp exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
function ensureUploadsTmp() {
  try {
    const tmpDir = path.join(UPLOADS_DIR, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  } catch (e) {
    console.error('Failed to ensure /uploads/tmp exists:', e);
    return null;
  }
}
```

### 2. Added Missing Import
Added the missing OpenAI import:
```javascript
import OpenAI from 'openai';
```

### 3. Added Port Configuration
Added explicit port configuration:
```javascript
const port = process.env.PORT || 5001;
```

## Verification Steps

### 1. Confirm Server is Running
```powershell
# Check if port 5001 is listening
Get-NetTCPConnection -LocalPort 5001 -State Listen

# Start the server if not running
npm run server
```

### 2. Test Health Endpoints
```powershell
# Test basic health
iwr http://127.0.0.1:5001/api/health -UseBasicParsing

# Test detailed health
iwr http://127.0.0.1:5001/api/health/details -UseBasicParsing
```

### 3. Verify Frontend-Backend Connection
```powershell
# Run connection test
npm run test:connection
```

## Configuration Recommendations

### 1. Frontend API Base Configuration
The frontend is already configured with a proxy in `client/package.json`:
```json
"proxy": "http://localhost:5001"
```

This allows the frontend to make requests to relative paths like `/api/extract-bgg-html` which are automatically proxied to the backend.

### 2. Environment Variables
For explicit configuration, you can set environment variables in `.env.development`:
```env
REACT_APP_API_BASE=http://127.0.0.1:5001
# or for Vite projects:
VITE_API_BASE=http://127.0.0.1:5001
```

### 3. Safe Fallback Builder
In frontend code, use a safe fallback pattern:
```javascript
const host = window.location.hostname || '127.0.0.1';
const API_BASE = (import.meta.env.VITE_API_BASE || process.env.REACT_APP_API_BASE || `http://${host}:5001`).replace(/\/$/, '');
```

## Prevention Measures

### 1. Add Console Logging
Add a console log in the frontend on load to verify API base:
```javascript
console.log("API_BASE =", API_BASE);
```

If you see ":5001" printed, you know it's missing host/scheme.

### 2. Regular Health Checks
Implement regular health checks in the frontend:
```javascript
// Periodically check backend health
setInterval(async () => {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      console.warn('Backend health check failed');
    }
  } catch (error) {
    console.error('Backend connection lost:', error);
  }
}, 30000); // Check every 30 seconds
```

### 3. Error Handling
Implement proper error handling for API calls:
```javascript
async function callApi(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, options);
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.message.includes('fetch')) {
      console.error('Connection to backend failed. Is the server running?');
      // Show user-friendly error message
    }
    throw error;
  }
}
```

## Troubleshooting Checklist

### If Connection Issues Persist:

1. **Check Port Listening**
   ```powershell
   Get-NetTCPConnection -LocalPort 5001 -State Listen
   ```

2. **Verify Request URL**
   - Open Network tab in DevTools
   - Click failed request
   - Copy "Request URL"
   - If it shows ":5001/api/...", the API base is missing host/scheme

3. **Test Direct Browser Access**
   - Open `http://127.0.0.1:5001/api/health` in browser
   - Should return 200 JSON

4. **Check Server Logs**
   - Look for startup errors
   - Verify "Listening on 5001" message

5. **Verify Environment Variables**
   - Check `.env` files
   - Ensure correct API base configuration

## Conclusion

The connection issue has been resolved by:
1. Fixing missing dependencies and definitions
2. Ensuring the backend server starts correctly
3. Verifying the proxy configuration works properly
4. Creating test scripts to validate the connection

The frontend can now successfully communicate with the backend API, and all endpoints are accessible through the configured proxy.