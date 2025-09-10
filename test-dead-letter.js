import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test the dead letter capture feature
 */
function testDeadLetterCapture() {
  console.log('🧪 TESTING DEAD LETTER CAPTURE');
  console.log('='.repeat(40));
  
  // Test text with suspicious but excluded lines
  const testText = `
  Contents & Setup
  
  1 Game board
  71 Exploration cards (65 Allies & 6 Monsters)
  35 Lords
  20 Locations
  20 Monster tokens (2 of value 4, 9 of value 3, and 9 of value 2)
  1 Threat token
  10 Key tokens
  Pearls (supply; quantity not specified)
  Plastic cups (used for the Treasury; quantity not specified)
  
  // These should be captured in dead letter
  65 Allies & 6 Monsters  // Breakdown-only line
  Place the Monster token on the Threat track  // Instruction pattern
  On the 6th space, they win 2 Pearls  // Reward text
  Front of a Location  // Caption
  Keep the Pearls in the Treasury cup  // Instruction with component terms
  
  Game Overview
  `;

  console.log('🔍 RUNNING VERBOSE EXTRACTION WITH DEAD LETTER CAPTURE...');
  const components = extractComponentsFromText(testText, true);
  
  console.log('\n' + '='.repeat(40));
  console.log('📊 RESULTS SUMMARY:');
  console.log('='.repeat(40));
  console.log(`✅ Components extracted: ${components.length}`);
  
  components.forEach((comp, i) => {
    console.log(`${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`);
  });
  
  console.log('\n🎉 DEAD LETTER CAPTURE TEST COMPLETE');
}

// Run the test
testDeadLetterCapture();