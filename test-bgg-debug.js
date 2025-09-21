import axios from 'axios';

async function testBGGExtraction() {
  try {
    console.log('Testing BGG extraction endpoint...');

    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-bgg-html',
      {
        url: 'https://boardgamegeek.com/boardgame/155987/abyss',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Headers:', error.response.headers);
    }
  }
}

testBGGExtraction();
