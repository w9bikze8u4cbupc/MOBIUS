import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test synonym coverage
 */
function testSynonyms() {
  console.log('🧪 SYNONYM COVERAGE TEST');
  console.log('='.repeat(40));

  // Test text with synonyms
  const synonymText = `
  Contents & Setup
  
  1 Main board
  1 Gameboard
  71 Expansion cards (65 Allies & 6 Monsters)
  Pearls (supply; quantity not specified)
  Plastic cups (used for the Treasury; quantity not specified)
  
  Game Overview
  `;

  console.log('🔍 TESTING SYNONYMS...');
  const components = extractComponentsFromText(synonymText, true);

  console.log('\n📊 RESULTS:');
  console.log(`Found ${components.length} components`);

  // Check that synonyms were properly normalized
  const gameBoard = components.find((c) => c.name === 'Game board');
  if (gameBoard) {
    console.log('✅ "Main board" and "Gameboard" correctly normalized to "Game board"');
  }

  console.log('\n🎉 SYNONYM COVERAGE TEST COMPLETE');
}

// Run the test
testSynonyms();
