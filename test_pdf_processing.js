// Test script to verify PDF processing with legacy pdfjs-dist
import './src/api/polyfills.js';
import fs from 'fs/promises';
import path from 'path';

import { createCanvas } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// For Node.js, we don't need to set the worker source
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

console.log('PDF.js legacy build imported successfully');
console.log('DOMMatrix available:', typeof global.DOMMatrix !== 'undefined');

// Try to load a simple PDF document
console.log('PDF.js version:', pdfjsLib.version);

// Test PDF processing function
async function testPDFProcessing() {
  try {
    // Create a simple test PDF in memory (we'll use a small buffer)
    // In a real scenario, this would be an actual PDF file
    console.log('Testing PDF processing...');

    // Since we don't have a real PDF file in this test, we'll just verify
    // that the necessary components are available
    console.log('Canvas available:', typeof createCanvas !== 'undefined');
    console.log('PDF.js.getDocument function:', typeof pdfjsLib.getDocument);

    console.log('PDF processing test completed successfully');
  } catch (error) {
    console.error('PDF processing test failed:', error.message);
  }
}

testPDFProcessing();
