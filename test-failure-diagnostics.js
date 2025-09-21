import axios from 'axios';

async function testFailureDiagnostics() {
  console.log('Testing failure diagnostics...\n');

  // Test with an invalid URL to trigger failure diagnostics
  const correlationId = `failure-test-${Date.now()}`;

  try {
    console.log(`Testing with invalid URL and correlation ID: ${correlationId}`);

    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-bgg-html',
      { url: 'https://invalid-domain-that-does-not-exist-12345.com/boardgame/13' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': correlationId,
        },
        timeout: 10000, // Short timeout to trigger failure faster
      },
    );

    console.log(`Unexpected success: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log('Expected failure occurred:');
    console.log(`  Error: ${error.message}`);

    // Check if correlation ID is in error response
    if (error.response) {
      console.log(`  Status: ${error.response.status}`);
      console.log(
        `  Response X-Request-ID header: ${error.response.headers['x-request-id'] || 'not found'}`,
      );
      if (error.response.data) {
        console.log(`  Response data: ${JSON.stringify(error.response.data)}`);
      }
    }
  }
}

testFailureDiagnostics().catch(console.error);
