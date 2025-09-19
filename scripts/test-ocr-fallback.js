import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Create a simple test PDF file (in a real scenario, you'd have an actual PDF)
const testPdfPath = path.join(process.cwd(), 'test.pdf');
const testOutputPath = path.join(process.cwd(), 'test-output.txt');

// Create a simple test file to simulate PDF
fs.writeFileSync(testPdfPath, 'This is a test PDF file content');

console.log('Testing OCR fallback script...');

// Test the OCR fallback script
const ocrProcess = spawn('node', ['./scripts/ocr-fallback.js', testPdfPath, testOutputPath], { 
  stdio: 'inherit',
  cwd: process.cwd()
});

ocrProcess.on('close', (code) => {
  console.log(`OCR fallback script exited with code ${code}`);
  
  // Clean up test files
  if (fs.existsSync(testPdfPath)) {
    fs.unlinkSync(testPdfPath);
  }
  
  if (fs.existsSync(testOutputPath)) {
    fs.unlinkSync(testOutputPath);
  }
  
  process.exit(code);
});

ocrProcess.on('error', (error) => {
  console.error('Failed to start OCR fallback script:', error);
  process.exit(1);
});