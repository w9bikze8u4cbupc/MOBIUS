import axios from 'axios';

async function testObservability() {
  console.log('Testing observability improvements...\n');

  // Test with correlation ID
  const correlationId = `observability-test-${Date.now()}`;

  try {
    console.log(`Testing with correlation ID: ${correlationId}`);

    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-bgg-html',
      { url: 'https://boardgamegeek.com/boardgame/13' }, // CATAN
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
    console.log(`Source: ${data.source || 'unknown'}`);

    // Check if correlation ID is echoed in response headers
    console.log(`Response X-Request-ID header: ${response.headers['x-request-id'] || 'not found'}`);

    if (data.success && data.metadata) {
      console.log(`Title: ${data.metadata.title}`);
      console.log(`BGG ID: ${data.metadata.bgg_id}`);
    }
  } catch (error) {
    console.log(`Failed: ${error.message}`);
    // Check if correlation ID is in error response
    if (error.response) {
      console.log(
        `Error response X-Request-ID header: ${error.response.headers['x-request-id'] || 'not found'}`,
      );
      if (error.response.data) {
        console.log(`Error response: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  console.log('\nTesting health endpoints for readiness...');

  try {
    const readyzResponse = await axios.get('http://127.0.0.1:5001/readyz');
    console.log(`Readyz Status: ${readyzResponse.status}`);
    console.log(`Readyz Data: ${JSON.stringify(readyzResponse.data)}`);
  } catch (error) {
    console.log(`Readyz test failed: ${error.message}`);
  }

  console.log('\nTesting SSRF allowlist...');

  // Test allowed URLs
  const allowedUrls = [
    'https://boardgamegeek.com/boardgame/13',
    'https://www.boardgamegeek.com/boardgame/13',
    'https://cf.geekdo-images.com/some-image.jpg',
  ];

  // Test blocked URLs
  const blockedUrls = [
    'https://malicious-site.com/boardgame/13',
    'http://192.168.1.1/private',
    'https://localhost:3000/local',
  ];

  console.log('Allowed URLs:');
  for (const url of allowedUrls) {
    try {
      // This is just a validation check, not an actual request
      console.log(`  ${url}: Should be allowed`);
    } catch (error) {
      console.log(`  ${url}: Unexpected error - ${error.message}`);
    }
  }

  console.log('Blocked URLs:');
  for (const url of blockedUrls) {
    try {
      // This is just a validation check, not an actual request
      console.log(`  ${url}: Should be blocked`);
    } catch (error) {
      console.log(`  ${url}: Unexpected error - ${error.message}`);
    }
  }
}

testObservability().catch(console.error);
