import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test reason codes
 */
function testReasonCodes() {
  console.log('🧪 REASON CODES TEST');
  console.log('='.repeat(40));
  
  // Test text with various patterns
  const testText = `
  Contents & Setup
  
  1 Game board
  71 Exploration cards (65 Allies & 6 Monsters)
  Place the Monster token on the Threat track  // Should be dropped as instruction
  On the 6th space, they win 2 Pearls  // Should be dropped as reward text
  Front of a Location  // Should be dropped as caption
  35 Lords
  
  Game Overview
  `;
  
  console.log('🔍 TESTING REASON CODES...');
  const components = extractComponentsFromText(testText, true);
  
  console.log('\n📊 RESULTS:');
  console.log(`Found ${components.length} components`);
  
  console.log('\n🎉 REASON CODES TEST COMPLETE');
}

// Run the test
testReasonCodes();