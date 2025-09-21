// Test script for SSRF validation
console.log('=== SSRF Validation Test ===\n');

async function testSSRFValidation() {
  try {
    // Test 1: Direct disallowed host
    console.log('Test 1: Direct disallowed host');
    const response1 = await fetch('http://localhost:5001/api/extract-bgg-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://malicious-site.com/boardgame/12345',
        requestId: 'test-ssrf-1',
      }),
    });

    const data1 = await response1.json();
    console.log(`Status: ${response1.status}`);
    console.log(`Code: ${data1.code}`);
    console.log(`Request ID: ${data1.requestId}`);
    console.log('Expected: 400, url_disallowed, test-ssrf-1');
    console.log(
      `Result: ${response1.status === 400 && data1.code === 'url_disallowed' && data1.requestId === 'test-ssrf-1' ? '✅ PASS' : '❌ FAIL'}\n`,
    );

    // Test 2: Allowed host that redirects to disallowed
    console.log('Test 2: Allowed host that redirects to disallowed (simulated)');
    // Note: This would require setting up a redirect test, but we'll document the expected behavior
    console.log(
      'For redirect test, final URL host must be validated and return 400 with url_disallowed code\n',
    );
  } catch (error) {
    console.log(`❌ Test failed with error: ${error.message}`);
  }

  console.log('=== SSRF Validation Test Complete ===');
}

// Run the test
testSSRFValidation();
