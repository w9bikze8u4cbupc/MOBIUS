import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import LoggingService from '../src/utils/logging/LoggingService.js';

async function extractTextWithOCR(pdfPath, outputPath) {
  try {
    // Convert PDF to images using pdftoppm
    const imageDir = path.dirname(pdfPath);
    const imageBase = path.basename(pdfPath, '.pdf');
    
    // Use full path to pdftoppm on Windows for compatibility
    const pdftoppmPath = process.platform === 'win32' 
      ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdftoppm.exe'
      : 'pdftoppm';
    
    const ppmPrefix = path.join(imageDir, imageBase);
    
    // Convert PDF to PPM images
    const convertProcess = spawn(pdftoppmPath, ['-png', '-r', '300', pdfPath, ppmPrefix]);
    
    await new Promise((resolve, reject) => {
      convertProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PDF to image conversion failed with code ${code}`));
        }
      });
      
      convertProcess.on('error', (error) => {
        reject(new Error(`PDF to image conversion error: ${error.message}`));
      });
    });
    
    // Find all generated images
    const imageFiles = fs.readdirSync(imageDir)
      .filter(file => file.startsWith(imageBase) && file.endsWith('.png'))
      .map(file => path.join(imageDir, file))
      .sort();
    
    if (imageFiles.length === 0) {
      throw new Error('No images generated from PDF');
    }
    
    // Extract text from each image using Tesseract
    let fullText = '';
    
    for (const imageFile of imageFiles) {
      const textFile = imageFile.replace('.png', '.txt');
      
      // Use Tesseract to extract text
      const tesseractProcess = spawn('tesseract', [imageFile, textFile.replace('.txt', ''), '-l', 'eng']);
      
      await new Promise((resolve, reject) => {
        tesseractProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Tesseract failed with code ${code}`));
          }
        });
        
        tesseractProcess.on('error', (error) => {
          reject(new Error(`Tesseract error: ${error.message}`));
        });
      });
      
      // Read extracted text
      if (fs.existsSync(textFile)) {
        const text = fs.readFileSync(textFile, 'utf8');
        fullText += text + '\n\n';
        
        // Clean up temporary files
        fs.unlinkSync(textFile);
        fs.unlinkSync(imageFile);
      }
    }
    
    // Write final text to output file
    fs.writeFileSync(outputPath, fullText.trim());
    
    LoggingService.info('OCR-Fallback', 'OCR extraction completed successfully', { 
      pdfPath, 
      pages: imageFiles.length,
      outputLength: fullText.length 
    });
    
    return fullText.trim();
  } catch (error) {
    LoggingService.error('OCR-Fallback', 'OCR extraction failed', { 
      pdfPath, 
      error: error.message 
    });
    
    throw error;
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const pdfPath = args[0];
const outputPath = args[1];

if (!pdfPath || !outputPath) {
  console.error('Usage: node ocr-fallback.js <pdfPath> <outputPath>');
  process.exit(1);
}

// Execute OCR extraction
extractTextWithOCR(pdfPath, outputPath)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('OCR extraction failed:', error.message);
    process.exit(1);
  });