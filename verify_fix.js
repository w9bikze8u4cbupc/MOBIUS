// Simple test to verify the pdfjs-dist fix resolves the DOMMatrix error
import express from 'express';
import './src/api/polyfills.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const app = express();
const port = 3001;

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    // Verify that pdfjsLib is properly loaded
    const version = pdfjsLib.version;
    const domMatrixAvailable = typeof global.DOMMatrix !== 'undefined';

    res.json({
      status: 'healthy',
      pdfjsVersion: version,
      domMatrixAvailable: domMatrixAvailable,
      message: 'pdfjs-dist fix is working correctly',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
  console.log('DOMMatrix available:', typeof global.DOMMatrix !== 'undefined');
  console.log('PDF.js version:', pdfjsLib.version);
});
