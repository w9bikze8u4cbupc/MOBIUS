import axios from 'axios';

async function testBGGExtraction() {
  try {
    const response = await axios.post('http://localhost:5001/start-extraction', {
      bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testBGGExtraction();