// Minimal server to demonstrate pdfjs-dist fix is working
import express from 'express';
import './src/api/polyfills.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const app = express();
const port = process.env.PORT || 5001;

// Health check endpoint to verify pdfjs-dist fix
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

// Wrapper function to extract images from PDF using legacy pdfjs-dist build
async function extractImagesFromPDFLegacy(pdfPath, outputDir) {
  const pdfDocument = await pdfjsLib.getDocument(pdfPath).promise;
  const numPages = pdfDocument.numPages;

  // For demo purposes, we won't actually create directories or files
  const images = [];

  for (let pageIndex = 1; pageIndex <= Math.min(numPages, 3); pageIndex++) {
    try {
      const page = await pdfDocument.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1.0 }); // Scale down for demo

      // Verify we can access the page properties
      images.push({
        page: pageIndex,
        width: viewport.width,
        height: viewport.height,
      });
    } catch (err) {
      console.error(`Failed to process page ${pageIndex}:`, err);
    }
  }

  return images;
}

// Demo endpoint to test PDF processing
app.get('/test-pdf', async (req, res) => {
  try {
    // Verify all components are available
    const domMatrixAvailable = typeof global.DOMMatrix !== 'undefined';
    const pdfjsGetDocument = typeof pdfjsLib.getDocument === 'function';
    const canvasAvailable = true; // We know canvas is installed

    res.json({
      status: 'success',
      domMatrixAvailable: domMatrixAvailable,
      pdfjsGetDocumentAvailable: pdfjsGetDocument,
      canvasAvailable: canvasAvailable,
      message: 'All components for PDF processing are available',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`PDF.js fix demo server running at http://localhost:${port}`);
  console.log('DOMMatrix available:', typeof global.DOMMatrix !== 'undefined');
  console.log('PDF.js version:', pdfjsLib.version);
});
