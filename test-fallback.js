import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test section scoping fallback rules
 */
function testFallbackRules() {
  console.log('🧪 SECTION SCOPING FALLBACK TEST');
  console.log('='.repeat(40));
  
  // Test text without section headers (should use fallback)
  const fallbackText = `
  1 Game board
  71 Exploration cards (65 Allies & 6 Monsters)
  35 Lords
  20 Locations
  20 Monster tokens (2 of value 4, 9 of value 3, and 9 of value 2)
  10 Key tokens
  Pearls (supply; quantity not specified)
  Plastic cups (used for the Treasury; quantity not specified)
  `;
  
  console.log('🔍 TESTING FALLBACK WITH SUFFICIENT CONFIDENCE...');
  const components = extractComponentsFromText(fallbackText, true);
  
  console.log(`\n✅ FOUND ${components.length} COMPONENTS WITH FALLBACK`);
  
  // Test text without section headers and low confidence (should be suppressed)
  const lowConfidenceText = `
  This is just some random text.
  Nothing to see here.
  Maybe a number 5 somewhere.
  `;
  
  console.log('\n🔍 TESTING LOW-CONFIDENCE FALLBACK SUPPRESSION...');
  const lowConfidenceComponents = extractComponentsFromText(lowConfidenceText, true);
  
  console.log(`\n✅ FOUND ${lowConfidenceComponents.length} COMPONENTS WITH LOW CONFIDENCE (should be 0)`);
  
  console.log('\n🎉 SECTION SCOPING FALLBACK TEST COMPLETE');
}

// Run the test
testFallbackRules();