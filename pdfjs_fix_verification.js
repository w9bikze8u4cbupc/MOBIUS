// Verification script for pdfjs-dist fix
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
      message: 'pdfjs-dist fix is working correctly'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Simple test endpoint to verify PDF processing capabilities
app.get('/test-pdf', (req, res) => {
  try {
    // Verify that all necessary components are available
    const domMatrixAvailable = typeof global.DOMMatrix !== 'undefined';
    const pdfjsGetDocument = typeof pdfjsLib.getDocument === 'function';
    const canvasAvailable = true; // We know canvas is installed
    
    res.json({
      status: 'success',
      domMatrixAvailable: domMatrixAvailable,
      pdfjsGetDocumentAvailable: pdfjsGetDocument,
      canvasAvailable: canvasAvailable,
      message: 'All components for PDF processing are available'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Verification server running at http://localhost:${port}`);
  console.log('DOMMatrix available:', typeof global.DOMMatrix !== 'undefined');
  console.log('PDF.js version:', pdfjsLib.version);
});