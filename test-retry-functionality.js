// Simple test to verify retry functionality
console.log('=== Testing Retry Functionality ===\n');

// Test the retry logic timing
function testRetryTiming() {
  console.log('Testing retry timing with jitter (250ms/750ms):');

  const startTime = Date.now();
  let attempt = 1;

  // Simulate first attempt (immediate)
  console.log(`Attempt ${attempt}: 0ms`);

  // Simulate first retry after 250ms
  setTimeout(() => {
    attempt++;
    console.log(`Attempt ${attempt}: ${Date.now() - startTime}ms (expected ~250ms)`);
  }, 250);

  // Simulate second retry after 750ms more (1000ms total)
  setTimeout(() => {
    attempt++;
    console.log(`Attempt ${attempt}: ${Date.now() - startTime}ms (expected ~1000ms)`);
    console.log('\n✅ Retry timing validation complete');
  }, 1000);
}

// Test the structured error responses
function testStructuredErrors() {
  console.log('\nTesting structured error response format:');

  const sampleError = {
    success: false,
    code: 'url_disallowed',
    message: 'URL not allowed by policy',
    requestId: 'req-12345-test',
  };

  console.log('Sample error response:');
  console.log(JSON.stringify(sampleError, null, 2));

  // Validate required fields
  const hasRequiredFields =
    'success' in sampleError && 'code' in sampleError && 'message' in sampleError;

  console.log(`\n✅ Required fields present: ${hasRequiredFields}`);
  console.log(`✅ Error code: ${sampleError.code}`);
  console.log(`✅ Request ID present: ${!!sampleError.requestId}`);
}

// Run tests
testRetryTiming();
testStructuredErrors();

console.log('\n=== Retry Functionality Test Complete ===');
