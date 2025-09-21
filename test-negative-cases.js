import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test negative cases to ensure we don't get false positives
 */
function testNegativeCases() {
  console.log('🧪 NEGATIVE CASE TESTING');
  console.log('='.repeat(40));

  // Negative test cases
  const NEGATIVE_LINES = [
    'On the 6th space, win 2 Pearls.',
    'Front of a Location',
    'Draw 1 Lord card and reveal it',
    'Place the Monster token on the Threat track',
    'Keep the Pearls in the Treasury cup',
  ];

  console.log('Testing negative cases (should return empty arrays):');
  let allPassed = true;

  NEGATIVE_LINES.forEach((line, index) => {
    const text = `CONTENTS & SETUP\n${line}\nObject of the Game`;
    const result = extractComponentsFromText(text);
    const passed = result.length === 0;
    console.log(
      `${passed ? '✅' : '❌'} Test ${index + 1}: "${line}" -> ${result.length} components`,
    );
    if (!passed) {
      console.log(`   Found: ${result.map((r) => r.name).join(', ')}`);
      allPassed = false;
    }
  });

  // Specific test for Threat token
  console.log('\nTesting Threat token exclusion:');
  const threatText = 'CONTENTS & SETUP\nThreat token — 1\nObject of the Game';
  const threatResult = extractComponentsFromText(threatText);
  const threatPassed = !threatResult.find((x) => x.name === 'Threat token');
  console.log(
    `${threatPassed ? '✅' : '❌'} Threat token correctly excluded: ${threatResult.length} components found`,
  );
  if (!threatPassed) {
    console.log(`   Found: ${threatResult.map((r) => r.name).join(', ')}`);
    allPassed = false;
  }

  console.log('\n' + '='.repeat(40));
  if (allPassed) {
    console.log('🎉 ALL NEGATIVE TESTS PASSED');
  } else {
    console.log('❌ SOME NEGATIVE TESTS FAILED');
  }

  return allPassed;
}

// Run the test
testNegativeCases();
