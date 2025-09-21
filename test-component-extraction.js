import axios from 'axios';

async function testComponentExtraction() {
  try {
    // Use the path from the upload response
    const pdfPath =
      'C:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\src\\api\\uploads\\1758367885658_valid_small.pdf';

    console.log('Extracting components from PDF path:', pdfPath);
    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-components',
      {
        pdfPath: pdfPath,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('Components Response:', response.data);
  } catch (error) {
    console.error('Error extracting components:', error.response?.data || error.message);
  }
}

testComponentExtraction();
