import axios from 'axios';

async function testBGGUrls() {
  const urls = [
    'https://boardgamegeek.com/boardgame/174430', // Wingspan
    'https://boardgamegeek.com/boardgame/13', // Catan
    'https://boardgamegeek.com/boardgame/68448', // 7 Wonders
    'https://boardgamegeek.com/boardgame/31260', // Agricola
    'https://boardgamegeek.com/boardgame/224517', // Spirit Island
  ];

  console.log('Testing multiple BGG URLs...');

  for (const url of urls) {
    try {
      console.log(`\nTesting ${url}`);
      const response = await axios.post(
        'http://127.0.0.1:5001/api/extract-bgg-html',
        {
          url: url,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('Success:', response.data.success);
      console.log('Title:', response.data.metadata.title);
      console.log('BGG ID:', response.data.metadata.bgg_id);
      console.log('Cover Image:', response.data.metadata.cover_image ? 'Yes' : 'No');
    } catch (error) {
      console.error('Error:', error.response ? error.response.data : error.message);
    }
  }
}

testBGGUrls();
