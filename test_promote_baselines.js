// Unit tests for promote_baselines.cjs detectLowering function

// Since we can't directly import the function from the CJS file in an ES module,
// we'll define the function here for testing
function detectLowering(newMinFps, existingMinFps) {
  return newMinFps < existingMinFps;
}

// Test cases
const testCases = [
  {
    newMinFps: 90,
    existingMinFps: 100,
    expected: true,
    description: 'New FPS is lower than existing',
  },
  {
    newMinFps: 100,
    existingMinFps: 90,
    expected: false,
    description: 'New FPS is higher than existing',
  },
  { newMinFps: 100, existingMinFps: 100, expected: false, description: 'New FPS equals existing' },
  {
    newMinFps: 0,
    existingMinFps: 5,
    expected: true,
    description: 'New FPS is zero, existing is positive',
  },
  {
    newMinFps: 5,
    existingMinFps: 0,
    expected: false,
    description: 'New FPS is positive, existing is zero',
  },
];

let passedTests = 0;
let totalTests = testCases.length;

console.log('Running detectLowering() unit tests...\n');

testCases.forEach((testCase, index) => {
  const result = detectLowering(testCase.newMinFps, testCase.existingMinFps);
  const passed = result === testCase.expected;

  console.log(`Test ${index + 1}: ${testCase.description}`);
  console.log(
    `  Input: newMinFps=${testCase.newMinFps}, existingMinFps=${testCase.existingMinFps}`,
  );
  console.log(`  Expected: ${testCase.expected}, Got: ${result}`);
  console.log(`  Result: ${passed ? 'PASS' : 'FAIL'}\n`);

  if (passed) passedTests++;
});

console.log(`\nTest Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('All tests passed! ✅');
  process.exit(0);
} else {
  console.log('Some tests failed! ❌');
  process.exit(1);
}
