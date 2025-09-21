import { extractTextFromPDF } from './src/api/pdfUtils.js';

async function extractPdfText() {
  try {
    const pdfPath =
      'C:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\src\\api\\uploads\\1758368018492_test_game_components.pdf';
    const text = await extractTextFromPDF(pdfPath);
    console.log('Extracted text from PDF:');
    console.log('========================');
    console.log(text);
    console.log('========================');
    console.log('Text length:', text.length);
  } catch (error) {
    console.error('Error extracting text:', error.message);
  }
}

extractPdfText();
