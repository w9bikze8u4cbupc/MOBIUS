// Test script to verify pdfjs-dist fix
import './src/api/polyfills.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// For Node.js, we don't need to set the worker source
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

console.log('PDF.js legacy build imported successfully');
console.log('DOMMatrix available:', typeof global.DOMMatrix !== 'undefined');

// Try to load a simple PDF document
console.log('PDF.js version:', pdfjsLib.version);