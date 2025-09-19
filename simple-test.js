import axios from 'axios';

async function test() {
  try {
    const response = await axios.post('http://localhost:5001/start-extraction', {
      bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

test();