import fs from 'fs';
import pdfParse from 'pdf-parse';

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
