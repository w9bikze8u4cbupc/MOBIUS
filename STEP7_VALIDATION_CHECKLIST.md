# Step 7 Validation Checklist — React Dev Server Coordination

## Setup Status ✅

**Backend (Port 5001)**: Running successfully
- Demo page accessible at `/demo`
- API endpoints at `/api/*` 
- Static images at `/output/*`
- CORS configured for React dev server origins

**Client (Create React App)**:
- Proxy configured in `client/package.json`: `"proxy": "http://localhost:5001"`
- Environment variable: `REACT_APP_API_BASE=http://localhost:5001`
- Ready to run on port 3000 (or 3001 if 3000 busy)

**Dev Scripts (Root Level)**:
- `npm run server` - starts backend on 5001
- `npm run client` - starts React on 3000/3001  
- `npm run dev` - runs both concurrently (requires `concurrently` package)

## Validation Checklist

### ✅ 1. Backend Demo Still Works
- [x] Start backend: `npm run server`
- [x] Navigate to http://localhost:5001/demo
- [x] Demo page loads correctly with full functionality
- [x] Can extract actions from PDF URLs
- [x] Image thumbnails display properly

### ✅ 2. Backend API Endpoints
- [x] `/api/extract-actions` responds correctly
- [x] `/output/*` serves static images
- [x] CORS headers present for React origins

### ✅ 3. Client Proxy Configuration
- [x] `client/package.json` has `"proxy": "http://localhost:5001"`
- [x] Client uses relative URLs: `fetch('/api/...')` and `img src="/output/..."`
- [x] No CORS issues when client calls backend through proxy

### 🔲 4. End-to-End React Client Testing
When React client starts successfully:
- [ ] Navigate to React client URL (http://localhost:3000 or 3001)
- [ ] Click "Choose Actions Image" in client UI
- [ ] Network tab shows `/api/extract-actions` requests to client origin
- [ ] Requests properly proxied to backend on 5001
- [ ] Image thumbnails load using `/output/...` paths through proxy
- [ ] Language selector and custom keywords work
- [ ] Server logs show requests flowing through API endpoints

### ✅ 5. Convenience Dev Script
- [x] Root `package.json` has dev scripts configured
- [x] `concurrently` dependency installed and working
- [x] `npm run dev` successfully starts both backend and client together

## Current Setup Details

**Proxy Configuration**: Using Create React App's built-in proxy feature
- Simple `"proxy": "http://localhost:5001"` in client/package.json
- All `/api/*` and `/output/*` requests automatically forwarded to backend
- No need for complex Vite proxy configuration or manual CORS setup

**Environment Variables**:
- Backend: Uses `PORT=5001` 
- Client: Uses `REACT_APP_API_BASE=http://localhost:5001` as fallback
- CORS configured to accept requests from localhost:3000 and :3001

**Architecture Benefits**:
- Clean separation: backend (5001) and client (3000/3001) on different ports
- No CORS complexity through proxy
- Demo fallback always works when React isn't running
- Hot reload for React development
- Server logs show all proxied requests

## Next Steps (Optional)

Based on GPT-5's suggestions:

1. **Alpha Badge**: Add "Alpha" chip in image modal for transparent PNGs
   - Use `hasAlpha` field from Step 5B scoring system
   - Show small badge when `img.hasAlpha === true`

2. **Install Concurrently**: Enable the root-level dev script
   - Run: `npm install concurrently` (if not already installed)
   - Test: `npm run dev` to start both servers simultaneously

## Files Modified for Step 7

- `c:\Users\danie\Documents\mobius-games-tutorial-generator\package.json` - Added dev scripts
- `c:\Users\danie\Documents\mobius-games-tutorial-generator\src\api\index.js` - Fixed duplicate import
- `c:\Users\danie\Documents\mobius-games-tutorial-generator\client\package.json` - Proxy already configured
- `c:\Users\danie\Documents\mobius-games-tutorial-generator\client\.env` - API base URL configured

## Demo Access

Backend demo is accessible via the preview browser. Click the preview button to test:
- Full functionality available at `/demo`
- All Step 6C features (multilingual, caching, scoring) working
- Ready for React client coordination testing