import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Regression test for Abyss component extraction fix
 * This test ensures that the fix for the "only cards" issue remains working
 */
async function testAbyssRegression() {
  console.log('🧪 ABYSS REGRESSION TEST');
  console.log('='.repeat(40));

  // This is the problematic case that was causing "only cards" issue
  const abyssText = `
  Contents & Setup
  
  1 Game board
  71 Exploration cards (65 Allies & 6 Monsters)
  35 Lords
  20 Locations
  20 Monster tokens (2 of value 4, 9 of value 3, and 9 of value 2)
  1 Threat token
  10 Key tokens
  Pearls (supply; quantity not specified in the excerpt)
  Plastic cups (used for the Treasury; quantity not specified in the excerpt)
  
  Game Overview
  Abyss is a game of exploration and political maneuvering...
  
  On the 6th space, they win 2 Pearls...
  Draw 1, 2, 3, or 4 Locations...
  Front of a Location
  Back of a Location
  The Traitor card
  Master of Magic
  `;

  console.log('🔍 Testing Abyss component extraction...');

  const components = extractComponentsFromText(abyssText);

  console.log(`\n📊 RESULTS: Found ${components.length} components`);

  // Verify we get multiple component types, not just cards
  const componentTypes = new Set();
  components.forEach((comp) => {
    const name = comp.name.toLowerCase();
    if (name.includes('card')) componentTypes.add('cards');
    if (name.includes('board')) componentTypes.add('boards');
    if (name.includes('token')) componentTypes.add('tokens');
    if (name.includes('lord')) componentTypes.add('lords');
    if (name.includes('location')) componentTypes.add('locations');
    if (name.includes('monster')) componentTypes.add('monsters');
    if (name.includes('pearl')) componentTypes.add('pearls');
    if (name.includes('cup')) componentTypes.add('cups');
  });

  console.log(`\n🎯 COMPONENT TYPES DETECTED: ${Array.from(componentTypes).join(', ')}`);

  // Validation
  const expectedTypes = [
    'boards',
    'cards',
    'tokens',
    'lords',
    'locations',
    'monsters',
    'pearls',
    'cups',
  ];
  const detectedExpectedTypes = expectedTypes.filter((type) => componentTypes.has(type));

  console.log(`\n✅ EXPECTED TYPES FOUND: ${detectedExpectedTypes.length}/${expectedTypes.length}`);

  // Check that we're NOT getting false positives
  const falsePositives = components.filter((comp) => {
    const name = comp.name.toLowerCase();
    return (
      name.includes('6th space') ||
      name.includes('draw') ||
      name.includes('front') ||
      name.includes('back') ||
      name.includes('traitor') ||
      name.includes('magic')
    );
  });

  console.log(`\n🚫 FALSE POSITIVES: ${falsePositives.length}`);

  // Overall result
  const success = componentTypes.size >= 5 && falsePositives.length === 0;

  console.log('\n' + '='.repeat(40));
  if (success) {
    console.log('🎉 ABYSS REGRESSION TEST PASSED');
    console.log('   ✅ Multiple component types detected');
    console.log('   ✅ No false positives');
    console.log('   ✅ "Only cards" issue RESOLVED');
  } else {
    console.log('❌ ABYSS REGRESSION TEST FAILED');
    console.log(`   📊 Component types: ${componentTypes.size}`);
    console.log(`   ❌ False positives: ${falsePositives.length}`);
  }

  return success;
}

// Run the test
testAbyssRegression()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test failed with error:', error);
    process.exit(1);
  });
