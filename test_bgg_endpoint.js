import fs from 'fs';

import axios from 'axios';

async function testBGGEndpoint() {
  try {
    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-bgg-html',
      {
        url: 'https://boardgamegeek.com/boardgame/13/catan',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('Response:', response.data);

    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    fs.writeFileSync('./work/bgg.html.extract.json', JSON.stringify(response.data, null, 2));
    console.log('Response saved to ./work/bgg.html.extract.json');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testBGGEndpoint();
