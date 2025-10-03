# Mock Server Setup for Mobius Games Tutorial Generator

This document provides instructions for setting up and running the mock server for the Mobius Games Tutorial Generator frontend development.

## Files Created

1. `mock-server.mjs` - The main mock server implementation
2. `ws-client.mjs` - A WebSocket client for testing WebSocket connections
3. `test-post.js` - A script to test the POST /api/generate endpoint
4. `test-websocket.html` - An HTML page to test WebSocket connections in the browser
5. `test-api.html` - An HTML page to test the REST API endpoints

## Prerequisites

- Node.js (version 20 or higher)
- npm (comes with Node.js)

## Setup Instructions

1. Install dependencies:
   ```
   npm install express ws cors
   ```

2. If you want to test the POST endpoint with the test script, also install node-fetch:
   ```
   npm install node-fetch
   ```

## Running the Mock Server

1. Start the mock server:
   ```
   node mock-server.mjs
   ```

   The server will start on port 5002 by default.

2. Test the endpoints:
   - Health endpoint: `curl http://localhost:5002/healthz`
   - Generate endpoint: `curl -X POST http://localhost:5002/api/generate -H "Content-Type: application/json" -d '{"prompt":"hello"}'`

3. Test WebSocket connections:
   ```
   node ws-client.mjs
   ```

## Running the Frontend

1. Navigate to the client directory:
   ```
   cd client
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the frontend:
   ```
   npm start
   ```

   The frontend will start on port 3000 by default and will proxy API requests to the mock server on port 5002.

## Testing in the Browser

You can also test the endpoints using the provided HTML files:

1. Open `test-api.html` in a browser to test the REST API endpoints
2. Open `test-websocket.html` in a browser to test the WebSocket connection

## Environment Variables

If you need to change the ports, you can set the following environment variables:

- `PORT` - Port for the mock server (default: 5002)
- `WS_URL` - WebSocket URL for the client (default: ws://localhost:5002/ws)

## Troubleshooting

1. If you get a port conflict error, change the PORT environment variable or modify the port in `mock-server.mjs`.

2. If the frontend can't connect to the backend, make sure the mock server is running and that the proxy setting in `client/package.json` matches the mock server port.

3. If you get CORS errors, make sure the CORS middleware is properly configured in the mock server (it should already be included).