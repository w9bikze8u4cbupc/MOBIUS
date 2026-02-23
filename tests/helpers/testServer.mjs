// tests/helpers/testServer.mjs
// Test server helper for Node's built-in test runner
// Starts Express app on ephemeral port and provides cleanup

import { createServer } from 'http';

/**
 * Start test server on ephemeral port
 * @param {Express} app - Express app instance
 * @returns {Promise<{server: Server, baseUrl: string, port: number}>}
 */
export async function startTestServer(app) {
  return new Promise((resolve, reject) => {
    // Use port 0 for ephemeral port assignment
    const server = createServer(app);
    
    server.listen(0, 'localhost', () => {
      const address = server.address();
      const port = address.port;
      const baseUrl = `http://localhost:${port}`;
      
      console.log(`✓ Test server started on ${baseUrl}`);
      
      resolve({ server, baseUrl, port });
    });
    
    server.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Stop test server
 * @param {Server} server - HTTP server instance
 * @returns {Promise<void>}
 */
export async function stopTestServer(server) {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    
    server.close((error) => {
      if (error) {
        console.error('✗ Error closing test server:', error);
        reject(error);
      } else {
        console.log('✓ Test server stopped');
        resolve();
      }
    });
  });
}

export default {
  startTestServer,
  stopTestServer
};
