import axios from 'axios';

async function testXmlFallback() {
  console.log('Testing XML fallback scenario...\n');

  // Test with a URL that should trigger fallback (non-HTML content)
  // We'll simulate this by using a URL that returns non-HTML content
  // For now, let's test with a game that might have issues

  const testUrl = 'https://boardgamegeek.com/boardgame/1?cachebust=' + Date.now();

  try {
    console.log(`Testing fallback scenario: ${testUrl}`);

    // Add correlation ID for tracing
    const correlationId = `fallback-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-bgg-html',
      { url: testUrl },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': correlationId,
        },
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

  console.log('\nTesting direct XML API call...');

  // Test direct XML API call
  try {
    const gameId = 13; // CATAN
    const xmlUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
    console.log(`Calling XML API directly: ${xmlUrl}`);

    const xmlResponse = await axios.get(xmlUrl, { timeout: 10000 });
    console.log(`XML API Status: ${xmlResponse.status}`);
    console.log(`Content Type: ${xmlResponse.headers['content-type']}`);

    // Show first 500 characters of response
    console.log(`Response Preview: ${xmlResponse.data.substring(0, 500)}...`);
  } catch (error) {
    console.log(`XML API test failed: ${error.message}`);
  }
}

testXmlFallback().catch(console.error);
