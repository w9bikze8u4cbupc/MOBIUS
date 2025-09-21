import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test consistency checks for breakdown sums
 */
function testBreakdownConsistency() {
  console.log('🧪 BREAKDOWN CONSISTENCY TEST');
  console.log('='.repeat(40));

  // Test text with correct breakdowns
  const correctText = `
  Contents & Setup
  
  1 Game board
  71 Exploration cards (65 Allies & 6 Monsters)
  35 Lords
  20 Locations
  20 Monster tokens (2 of value 4, 9 of value 3, and 9 of value 2)
  10 Key tokens
  Pearls (supply; quantity not specified)
  Plastic cups (used for the Treasury; quantity not specified)
  
  Game Overview
  `;

  console.log('🔍 TESTING CORRECT BREAKDOWNS...');
  const correctComponents = extractComponentsFromText(correctText, true);

  // Test text with incorrect breakdowns
  const incorrectText = `
  Contents & Setup
  
  70 Exploration cards (65 Allies & 6 Monsters)  // Should be 71 total
  19 Monster tokens (2 of value 4, 9 of value 3, and 9 of value 2)  // Should be 20 total
  
  Game Overview
  `;

  console.log('\n🔍 TESTING INCORRECT BREAKDOWNS (should show warnings)...');
  const incorrectComponents = extractComponentsFromText(incorrectText, true);

  console.log('\n🎉 BREAKDOWN CONSISTENCY TEST COMPLETE');
}

// Run the test
testBreakdownConsistency();
