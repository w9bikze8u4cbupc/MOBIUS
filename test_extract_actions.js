import fs from 'fs';

import axios from 'axios';

async function testExtractActions() {
  try {
    // Use the correct URL to the PDF
    const pdfUrl = 'http://127.0.0.1:5001/static/1758027640098_1751722917481_Jaipur.pdf';

    console.log('Extracting actions from PDF URL:', pdfUrl);
    const response = await axios.get(
      `http://127.0.0.1:5001/api/extract-actions?pdfUrl=${encodeURIComponent(pdfUrl)}`,
    );

    console.log('Actions Response:', response.data);

    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    fs.writeFileSync('./work/actions.json', JSON.stringify(response.data, null, 2));
    console.log('Actions saved to ./work/actions.json');

    // Show first 10 actions if any
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log('First 10 actions:');
      console.log(response.data.slice(0, 10));
    } else {
      console.log('No actions found');
    }
  } catch (error) {
    console.error('Error extracting actions:', error.response?.data || error.message);
  }
}

testExtractActions();
