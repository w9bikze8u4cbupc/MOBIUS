import http from 'http';

// Function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      ...options,
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testHealthEndpoints() {
  console.log('Testing health endpoints...');

  try {
    // Test /healthz endpoint
    const healthzResponse = await makeRequest('http://localhost:5001/healthz');
    if (healthzResponse.statusCode === 200 && healthzResponse.data === 'ok') {
      console.log('✓ /healthz endpoint working correctly');
    } else {
      console.error('✗ /healthz endpoint failed');
      return false;
    }

    // Test /readyz endpoint
    const readyzResponse = await makeRequest('http://localhost:5001/readyz');
    if (readyzResponse.statusCode === 200) {
      const data = JSON.parse(readyzResponse.data);
      if (data.status === 'ready') {
        console.log('✓ /readyz endpoint working correctly');
      } else {
        console.log('⚠ /readyz endpoint returned issues:', data.issues || 'Unknown issues');
      }
    } else {
      console.error('✗ /readyz endpoint failed with status:', readyzResponse.statusCode);
      return false;
    }

    return true;
  } catch (error) {
    console.error('✗ Health endpoint test failed:', error.message);
    return false;
  }
}

async function testSSRFProtection() {
  console.log('\nTesting SSRF protection...');

  try {
    // Test valid BGG URL
    const validResponse = await makeRequest('http://localhost:5001/start-extraction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss',
      }),
    });

    console.log('Valid BGG URL response status:', validResponse.statusCode);

    // Test invalid URL (SSRF protection)
    const invalidResponse = await makeRequest('http://localhost:5001/start-extraction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bggUrl: 'https://example.com/not-bgg',
      }),
    });

    console.log('Invalid URL response status:', invalidResponse.statusCode);
    console.log('Invalid URL response data:', invalidResponse.data);

    if (invalidResponse.statusCode === 400 && invalidResponse.data.includes('host not allowed')) {
      console.log('✓ SSRF protection working - invalid host rejected');
    } else {
      console.error('✗ SSRF protection failed - invalid host not rejected');
      return false;
    }

    return true;
  } catch (error) {
    console.error('✗ SSRF protection test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('Mobius Games Tutorial Generator - Simple Hardening Verification');
  console.log('================================================================');

  const results = [await testHealthEndpoints(), await testSSRFProtection()];

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log('\nVerification Summary');
  console.log('===================');
  console.log(`Passed: ${passed}/${total}`);

  if (passed === total) {
    console.log('✓ All tested hardening features verified successfully!');
  } else {
    console.log('⚠ Some hardening features may need attention');
  }
}

main().catch((error) => {
  console.error('Verification failed with error:', error);
});
