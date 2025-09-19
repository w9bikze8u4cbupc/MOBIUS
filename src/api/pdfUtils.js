import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { spawn, spawnSync } from 'child_process';
import LoggingService from '../utils/logging/LoggingService.js';
import pdfWorkerManager from '../utils/pdfWorkerManager.js';

export async function extractTextFromPDF(pdfPath) {
  try {
    // Validate PDF file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Check file size
    const stats = fs.statSync(pdfPath);
    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
      throw new Error(`PDF file too large (${(stats.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is 50MB.`);
    }

    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    // If extracted text is very short, try OCR fallback
    if (data.text.trim().length < 100) {
      LoggingService.warn('PDFUtils', 'PDF text extraction yielded minimal text, attempting OCR fallback...', { pdfPath });
      return await extractTextWithOCRFallback(pdfPath);
    }
    
    return data.text;
  } catch (error) {
    LoggingService.error('PDFUtils', 'Error extracting text from PDF', { pdfPath, error: error.message });
    // Try OCR fallback on error
    LoggingService.info('PDFUtils', 'Attempting OCR fallback...', { pdfPath });
    return await extractTextWithOCRFallback(pdfPath);
  }
}

export async function validatePDFFile(pdfPath) {
  try {
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return { valid: false, error: `File not found: ${pdfPath}` };
    }

    // Check file extension
    const ext = path.extname(pdfPath).toLowerCase();
    if (ext !== '.pdf') {
      return { valid: false, error: `Invalid file type: ${ext}. Expected .pdf` };
    }

    // Check file size
    const stats = fs.statSync(pdfPath);
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (stats.size > maxSize) {
      return { 
        valid: false, 
        error: `File too large: ${(stats.size / (1024 * 1024)).toFixed(2)}MB. Maximum size is ${(maxSize / (1024 * 1024)).toFixed(2)}MB.` 
      };
    }

    // Additional check: verify file is not empty
    if (stats.size === 0) {
      return { 
        valid: false, 
        error: 'File is empty. Please upload a valid PDF file.' 
      };
    }

    // Additional check: verify PDF signature
    try {
      const fileBuffer = fs.readFileSync(pdfPath);
      const hasPdfSignature = fileBuffer && fileBuffer.length > 4 && fileBuffer.slice(0,5).toString('ascii') === '%PDF-';
      if (!hasPdfSignature) {
        return { 
          valid: false, 
          error: 'File is not a valid PDF - missing PDF signature.' 
        };
      }
    } catch (readError) {
      return { 
        valid: false, 
        error: `Failed to read file for PDF signature validation: ${readError.message}` 
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `File validation failed: ${error.message}` };
  }
}

export async function extractImagesFromPDF(pdfPath, outputDir) {
  try {
    // Validate PDF file first
    const validation = await validatePDFFile(pdfPath);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    LoggingService.info('PDFUtils', 'Starting PDF image extraction', { pdfPath, outputDir });
    
    // Use worker thread for heavy PDF processing
    const startTime = Date.now();
    const images = await pdfWorkerManager.extractImagesFromPDF(pdfPath, outputDir);
    const duration = Date.now() - startTime;
    
    LoggingService.info('PDFUtils', 'PDF image extraction completed', { 
      pdfPath, 
      outputDir, 
      imageCount: images.length,
      durationMs: duration
    });
    
    return images;
  } catch (error) {
    LoggingService.error('PDFUtils', 'PDF image extraction failed', { pdfPath, error: error.message });
    
    // Provide actionable error message
    let errorMessage = 'PDF processing failed. ';
    
    if (error.message.includes('too large')) {
      errorMessage += 'Try a smaller PDF file (< 50MB).';
    } else if (error.message.includes('worker')) {
      errorMessage += 'Worker thread error. Try restarting the application.';
    } else if (error.message.includes('signature') || error.message.includes('PDF')) {
      errorMessage += 'The file is not a valid PDF. Please check the file and try again.';
    } else {
      errorMessage += 'Try rebuilding sharp: npm rebuild sharp';
    }
    
    throw new Error(errorMessage);
  }
}

async function extractTextWithOCRFallback(pdfPath) {
  try {
    // Validate PDF file first
    const validation = await validatePDFFile(pdfPath);
    if (!validation.valid) {
      LoggingService.error('PDFUtils', 'PDF validation failed for OCR fallback', { pdfPath, error: validation.error });
      return '';
    }

    LoggingService.info('PDFUtils', 'Starting OCR fallback process', { pdfPath });
    
    // Check if required tools are available
    const tesseractCheck = spawnSync('tesseract', ['--version'], { stdio: 'ignore' });
    if (tesseractCheck.status !== 0) {
      LoggingService.warn('PDFUtils', 'Tesseract OCR not available, trying alternative approaches');
      
      // Try smaller PDF approach
      return await trySmallerPDFApproach(pdfPath);
    }
    
    const ocrScriptPath = './scripts/ocr-fallback.js';
    const outputPath = pdfPath + '.ocr.txt';
    
    // Execute OCR script
    return new Promise((resolve) => {
      const ocrProcess = spawn('node', [ocrScriptPath, pdfPath, outputPath], { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      
      ocrProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ocrProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ocrProcess.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          try {
            const ocrText = fs.readFileSync(outputPath, 'utf8');
            // Clean up OCR output file
            fs.unlinkSync(outputPath);
            LoggingService.info('PDFUtils', 'OCR fallback successful', { pdfPath });
            resolve(ocrText);
          } catch (readError) {
            LoggingService.error('PDFUtils', 'Failed to read OCR output', { pdfPath, error: readError.message });
            resolve('');
          }
        } else {
          LoggingService.warn('PDFUtils', 'OCR fallback failed', { 
            pdfPath, 
            code, 
            stdout: stdout.substring(0, 500), 
            stderr: stderr.substring(0, 500) 
          });
          
          // Try smaller PDF approach as last resort
          resolve(trySmallerPDFApproach(pdfPath));
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        ocrProcess.kill();
        LoggingService.warn('PDFUtils', 'OCR process timed out', { pdfPath });
        resolve(trySmallerPDFApproach(pdfPath));
      }, 30000);
    });
  } catch (error) {
    LoggingService.error('PDFUtils', 'OCR fallback error', { pdfPath, error: error.message });
    return '';
  }
}

async function trySmallerPDFApproach(pdfPath) {
  LoggingService.info('PDFUtils', 'Trying smaller PDF approach', { pdfPath });
  
  try {
    // Suggest user to try a smaller PDF file
    const message = `OCR processing failed. Please try:\n` +
      `1. Using a smaller PDF file (< 10MB)\n` +
      `2. Ensuring Tesseract OCR is installed (https://github.com/tesseract-ocr/tesseract)\n` +
      `3. Rebuilding Sharp with: npm rebuild sharp\n` +
      `4. Checking PDF file integrity`;
      
    LoggingService.info('PDFUtils', message);
    return message;
  } catch (error) {
    LoggingService.error('PDFUtils', 'Smaller PDF approach failed', { pdfPath, error: error.message });
    return 'PDF processing failed. Please try using a smaller PDF file or reinstalling dependencies.';
  }
}