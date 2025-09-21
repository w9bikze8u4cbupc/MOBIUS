// Simple script to start the server with pdfjs legacy mitigation
// process.env.USE_PDFJS_LEGACY = '1'; // Removed to prevent conflicts with body-parser
process.env.BASE = process.env.BASE || 'http://localhost:3000';

// Import polyfills before importing the main server
import('./src/api/polyfills.js')
  .then(() => {
    // Import and start the main server
    return import('./src/api/index.js');
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
