#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Use full path to tesseract OCR tool
const TESSERACT_PATH = 'tesseract'; // Assumes tesseract is in PATH

function hasTesseract() {
  try {
    const r = spawnSync(TESSERACT_PATH, ["--version"], { stdio: "ignore" });
    return r.status === 0;
  } catch (error) {
    return false;
  }
}

function extractTextWithOCR(pdfPath, outputPath) {
  if (!hasTesseract()) {
    console.error("Tesseract OCR is not available.");
    process.exit(1);
  }

  try {
    // Convert PDF to images first (using pdftoppm)
    const pdftoppmPath = 'pdftoppm';
    const ppmPrefix = path.join(path.dirname(outputPath), 'temp_ocr');
    
    const pdftoppmArgs = [
      '-png',
      pdfPath,
      ppmPrefix
    ];
    
    const pdftoppmResult = spawnSync(pdftoppmPath, pdftoppmArgs, { stdio: 'inherit' });
    if (pdftoppmResult.status !== 0) {
      console.error('Error converting PDF to images for OCR');
      process.exit(1);
    }
    
    // Perform OCR on each image
    const fs = require('fs');
    const files = fs.readdirSync(path.dirname(outputPath))
      .filter(f => f.startsWith('temp_ocr') && f.endsWith('.png'))
      .map(f => path.join(path.dirname(outputPath), f));
    
    let fullText = '';
    for (const file of files) {
      const textOutput = file.replace('.png', '');
      const ocrArgs = [
        file,
        textOutput,
        'txt'
      ];
      
      const ocrResult = spawnSync(TESSERACT_PATH, ocrArgs, { stdio: 'inherit' });
      if (ocrResult.status === 0) {
        const textFile = textOutput + '.txt';
        if (fs.existsSync(textFile)) {
          fullText += readFileSync(textFile, 'utf8') + '\n\n';
          // Clean up text file
          fs.unlinkSync(textFile);
        }
      }
      // Clean up image file
      fs.unlinkSync(file);
    }
    
    // Write combined text to output file
    writeFileSync(outputPath, fullText);
    console.log(`OCR extraction completed. Output saved to ${outputPath}`);
    
    return fullText;
  } catch (error) {
    console.error('Error during OCR extraction:', error.message);
    process.exit(1);
  }
}

// If called directly, process command line arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length !== 4) {
    console.error('Usage: node ocr-fallback.js <input.pdf> <output.txt>');
    process.exit(1);
  }
  
  const pdfPath = process.argv[2];
  const outputPath = process.argv[3];
  
  extractTextWithOCR(pdfPath, outputPath);
}

export { extractTextWithOCR };