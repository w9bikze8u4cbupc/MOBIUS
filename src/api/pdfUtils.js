import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractPdfToIngestionInput } = require('../ingestion/pdfExtractor');

/**
 * Extract flat text from a PDF (backward-compatible).
 * Returns the full text content as a single string.
 */
export async function extractTextFromPDF(pdfPath) {
  try {
    // Check if the path is absolute or relative
    const resolvedPath = pdfPath.startsWith('/') ? pdfPath : `./${pdfPath}`;
    
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`PDF file not found: ${resolvedPath}`);
    }

    const dataBuffer = fs.readFileSync(resolvedPath);
    const data = await pdfParse(dataBuffer);
    
    return data.text || '';
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

/**
 * Extract structured ingestion input from a PDF.
 * Returns { pages, ocr, metadata, diagnostics } compatible with runIngestionPipeline.
 *
 * @param {string|Buffer|Uint8Array} input - PDF file path, Buffer, or Uint8Array
 * @param {object} options - { mergeLines, source }
 * @returns {Promise<{ pages, ocr, metadata, diagnostics }>}
 */
export async function extractStructuredPDF(input, options = {}) {
  return extractPdfToIngestionInput(input, options);
}
