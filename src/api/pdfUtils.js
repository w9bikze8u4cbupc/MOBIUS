// src/api/pdfUtils.js
// PDF text extraction utilities

import pdfParse from 'pdf-parse';
import fs from 'fs';

/**
 * Extract text from PDF file
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<string>} Extracted text
 */
export async function extractTextFromPDF(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

export default {
  extractTextFromPDF
};
