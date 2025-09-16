import fs from 'fs';
import pdf from 'pdf-parse';
import { spawnSync } from 'child_process';

export async function extractTextFromPDF(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    // If extracted text is very short, try OCR fallback
    if (data.text.trim().length < 100) {
      console.log('PDF text extraction yielded minimal text, attempting OCR fallback...');
      return await extractTextWithOCRFallback(pdfPath);
    }
    
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    // Try OCR fallback on error
    console.log('Attempting OCR fallback...');
    return await extractTextWithOCRFallback(pdfPath);
  }
}

async function extractTextWithOCRFallback(pdfPath) {
  // Try to use our OCR script
  try {
    const ocrScriptPath = './scripts/ocr-fallback.js';
    const outputPath = pdfPath + '.ocr.txt';
    
    // Check if tesseract is available
    const tesseractCheck = spawnSync('tesseract', ['--version'], { stdio: 'ignore' });
    if (tesseractCheck.status !== 0) {
      console.warn('Tesseract OCR not available, skipping OCR fallback');
      return '';
    }
    
    const ocrResult = spawnSync('node', [ocrScriptPath, pdfPath, outputPath], { stdio: 'inherit' });
    if (ocrResult.status === 0 && fs.existsSync(outputPath)) {
      const ocrText = fs.readFileSync(outputPath, 'utf8');
      // Clean up OCR output file
      fs.unlinkSync(outputPath);
      return ocrText;
    } else {
      console.warn('OCR fallback failed');
      return '';
    }
  } catch (error) {
    console.error('OCR fallback error:', error.message);
    return '';
  }
}