import axios from 'axios';

async function testSourceTracking() {
  console.log('Testing source tracking...\n');

  // Clear cache by using a new URL each time
  const timestamp = Date.now();
  const testUrl = `https://boardgamegeek.com/boardgame/13?cachebust=${timestamp}`;

  try {
    console.log(`Testing: ${testUrl}`);

    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-bgg-html',
      { url: testUrl },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );

    const data = response.data;
    console.log(`Success: ${data.success}`);

    if (data.success && data.metadata) {
      console.log(`Title: ${data.metadata.title}`);
      console.log(`BGG ID: ${data.metadata.bgg_id}`);
      console.log(`Cover Image: ${data.metadata.cover_image ? 'Yes' : 'No'}`);
      console.log(`Source: ${data.source || 'unknown'}`);
    } else {
      console.log(`Error: ${data.error || 'Unknown error'}`);
      if (data.suggestion) {
        console.log(`Suggestion: ${data.suggestion}`);
      }
    }
  } catch (error) {
    console.log(`Failed: ${error.message}`);
    if (error.response && error.response.data) {
      console.log(`Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

testSourceTracking().catch(console.error);
