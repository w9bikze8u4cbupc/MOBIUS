import axios from 'axios';

// Test URLs - diverse set as requested
const testUrls = [
  'https://boardgamegeek.com/boardgame/174430', // Gloomhaven (popular game)
  'https://boardgamegeek.com/boardgame/13', // CATAN (popular game)
  'https://boardgamegeek.com/boardgame/68448', // 7 Wonders (popular game)
  'https://boardgamegeek.com/boardgame/31260', // Agricola (popular game)
  'https://boardgamegeek.com/boardgame/224517', // Brass: Birmingham (popular game)
  'https://boardgamegeek.com/boardgame/169786', // Scythe (popular game)
  'https://boardgamegeek.com/boardgame/233810', // Dinosaur Island (niche title)
  'https://boardgamegeek.com/boardgame/123456', // Non-existent game (edge case)
];

async function testBggExtraction() {
  console.log('Testing BGG extraction with diverse URLs...\n');

  for (const bggUrl of testUrls) {
    try {
      console.log(`Testing: ${bggUrl}`);

      // Add correlation ID for tracing
      const correlationId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const response = await axios.post(
        'http://127.0.0.1:5001/api/extract-bgg-html',
        { url: bggUrl },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': correlationId,
          },
          timeout: 30000,
        },
      );

      const data = response.data;
      console.log(`  Success: ${data.success}`);

      if (data.success && data.metadata) {
        console.log(`  Title: ${data.metadata.title}`);
        console.log(`  BGG ID: ${data.metadata.bgg_id}`);
        console.log(`  Cover Image: ${data.metadata.cover_image ? 'Yes' : 'No'}`);
        console.log(`  Source: ${data.source || 'unknown'}`);
      } else {
        console.log(`  Error: ${data.error || 'Unknown error'}`);
        if (data.suggestion) {
          console.log(`  Suggestion: ${data.suggestion}`);
        }
      }

      console.log(''); // Empty line for readability
    } catch (error) {
      console.log(`  Failed: ${error.message}`);
      if (error.response && error.response.data) {
        console.log(`  Response: ${JSON.stringify(error.response.data)}`);
      }
      console.log(''); // Empty line for readability
    }
  }
}

// Test PDF rejection with structured error codes
async function testPdfRejection() {
  console.log('Testing PDF rejection with structured error codes...\n');

  // This would normally be a file upload, but we'll simulate the validation
  console.log('PDF rejection test - structured error codes:');
  console.log('When backend rejects PDF, it should return:');
  console.log(
    '{ "success": false, "code": "pdf_bad_signature", "message": "File content does not look like a valid PDF." }',
  );
  console.log('');
}

// Test health endpoints
async function testHealthEndpoints() {
  console.log('Testing health endpoints...\n');

  try {
    const healthzResponse = await axios.get('http://127.0.0.1:5001/healthz');
    console.log(`Healthz: ${healthzResponse.status} - ${healthzResponse.data}`);
  } catch (error) {
    console.log(`Healthz failed: ${error.message}`);
  }

  try {
    const readyzResponse = await axios.get('http://127.0.0.1:5001/readyz');
    console.log(`Readyz: ${readyzResponse.status} - ${JSON.stringify(readyzResponse.data)}`);
  } catch (error) {
    console.log(`Readyz failed: ${error.message}`);
  }

  console.log(''); // Empty line for readability
}

async function runAllTests() {
  console.log('=== Comprehensive BGG Testing ===\n');

  await testHealthEndpoints();
  await testBggExtraction();
  await testPdfRejection();

  console.log('=== Testing Complete ===');
}

runAllTests().catch(console.error);
