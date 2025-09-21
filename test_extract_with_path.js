import fs from 'fs';

import axios from 'axios';

async function testExtractWithPath() {
  try {
    // Use the absolute path to the PDF
    const pdfPath =
      'C:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\uploads\\1751722917481_Jaipur.pdf';

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

    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    fs.writeFileSync('./work/components.json', JSON.stringify(response.data, null, 2));
    console.log('Components saved to ./work/components.json');
  } catch (error) {
    console.error('Error extracting components:', error.response?.data || error.message);
  }
}

testExtractWithPath();
