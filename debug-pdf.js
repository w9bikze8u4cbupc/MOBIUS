import fs from 'fs';
import path from 'path';

// Test the validation function directly
const pdfPath = 'tests/fixtures/valid-small.pdf';

console.log('File exists:', fs.existsSync(pdfPath));
console.log('File stats:', fs.statSync(pdfPath));

// Check file extension
const ext = path.extname(pdfPath).toLowerCase();
console.log('File extension:', ext);

if (ext !== '.pdf') {
  console.log('Extension check failed');
} else {
  console.log('Extension check passed');
}
