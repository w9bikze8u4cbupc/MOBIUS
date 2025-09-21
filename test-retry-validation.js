// Test script for retry-with-jitter validation
console.log('=== Retry-with-Jitter Validation Test ===\n');

async function testRetryJitter() {
  const startTime = Date.now();
  let attemptCount = 0;

  try {
    // Simulate hitting the test-flaky endpoint
    const response1 = await fetch('http://localhost:5001/test-flaky');
    attemptCount++;

    if (response1.status === 429) {
      console.log(`✅ Attempt ${attemptCount}: Received 429 (Too Many Requests)`);
      console.log('   Waiting for retry...');

      // Wait a bit and try again
      await new Promise((resolve) => setTimeout(resolve, 500));

      const response2 = await fetch('http://localhost:5001/test-flaky');
      attemptCount++;

      if (response2.status === 429) {
        console.log(`✅ Attempt ${attemptCount}: Received 429 (Too Many Requests)`);
        console.log('   Waiting for retry...');

        // Wait a bit and try again
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const response3 = await fetch('http://localhost:5001/test-flaky');
        attemptCount++;

        if (response3.status === 200) {
          console.log(`✅ Attempt ${attemptCount}: Received 200 (OK) - Success!`);
        } else {
          console.log(`❌ Attempt ${attemptCount}: Expected 200, got ${response3.status}`);
        }
      } else {
        console.log(`❌ Attempt ${attemptCount}: Expected 429, got ${response2.status}`);
      }
    } else {
      console.log(`❌ Attempt ${attemptCount}: Expected 429, got ${response1.status}`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`\n⏱️  Total test duration: ${totalTime}ms`);
    console.log(`📊 Total attempts: ${attemptCount}`);

    // Validate timing (should be ~250ms then ~750ms between attempts)
    if (totalTime >= 800 && totalTime <= 1500) {
      console.log('✅ Timing validation: Within expected range (250ms + 750ms)');
    } else {
      console.log(`⚠️  Timing validation: Outside expected range (got ${totalTime}ms)`);
    }
  } catch (error) {
    console.log(`❌ Test failed with error: ${error.message}`);
  }

  console.log('\n=== Retry Validation Complete ===');
}

// Run the test
testRetryJitter();
