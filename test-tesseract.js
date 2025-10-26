import fs from 'fs';
import path from 'path';

async function testTesseract() {
  try {
    console.log('Testing tesseract.js import...');
    const { createWorker, PSM } = await import('tesseract.js');
    console.log('tesseract.js imported successfully');
    
    // Create a simple text file to test OCR
    const testText = 'This is a test document for OCR processing.';
    const testFilePath = path.join('data', 'test-ocr.txt');
    fs.writeFileSync(testFilePath, testText);
    console.log('Created test text file');
    
    console.log('Creating worker...');
    const worker = await createWorker('eng');
    console.log('Worker created and initialized');
    
    // For now, let's just test that we can create the worker
    console.log('tesseract.js is working correctly');
    
    await worker.terminate();
    console.log('Worker terminated');
  } catch (error) {
    console.error('Error testing tesseract.js:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTesseract();