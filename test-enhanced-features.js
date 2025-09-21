import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test the enhanced features of the component extractor
 */
function testEnhancedFeatures() {
  console.log('🧪 TESTING ENHANCED FEATURES');
  console.log('='.repeat(40));

  // Test text with OCR issues and suspicious lines
  const testText = `
  Contents & Setup
  
  1 Game b0ard  // OCR issue: b0ard instead of board
  71 Expl0ration cards (65 Allies & 6 Monsters)  // OCR issue: Expl0ration
  35 L0rds  // OCR issue: L0rds instead of Lords
  20 Locations
  20 M0nster tokens (2 of value 4, 9 of value 3, and 9 of value 2)  // OCR issue: M0nster
  1 Threat token
  10 Key tokens
  Pearls (supply; quantity not specified)
  Plastic cups (used for the Treasury; quantity not specified)
  
  Game Overview
  Abyss is a game of exploration and political maneuvering...
  
  On the 6th space, they win 2 Pearls...  // Should be excluded as reward text
  Draw 1, 2, 3, or 4 Locations...  // Should be excluded as instruction
  Front of a Location  // Should be excluded as caption
  Back of a Location  // Should be excluded as caption
  The Traitor card  // Should be excluded as not in components section
  Master of Magic  // Should be excluded as not in components section
  
  // These should be captured in dead letter
  65 Allies & 6 Monsters  // Breakdown-only line
  Place the Monster token on the Threat track  // Instruction pattern
  `;

  console.log('🔍 RUNNING VERBOSE EXTRACTION WITH ENHANCED FEATURES...');
  const components = extractComponentsFromText(testText, true);

  console.log('\n' + '='.repeat(40));
  console.log('📊 RESULTS SUMMARY:');
  console.log('='.repeat(40));
  console.log(`✅ Components extracted: ${components.length}`);

  components.forEach((comp, i) => {
    console.log(
      `${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`,
    );
  });

  // Verify OCR normalization worked
  console.log('\n' + '='.repeat(40));
  console.log('🔍 OCR NORMALIZATION VERIFICATION:');
  console.log('='.repeat(40));

  const gameBoard = components.find((c) => c.name === 'Game board');
  const explorationCards = components.find((c) => c.name === 'Exploration cards');
  const lords = components.find((c) => c.name === 'Lord cards');
  const monsterTokens = components.find((c) => c.name === 'Monster tokens');

  if (gameBoard) console.log('✅ "Game b0ard" correctly normalized to "Game board"');
  if (explorationCards)
    console.log('✅ "Expl0ration cards" correctly normalized to "Exploration cards"');
  if (lords) console.log('✅ "L0rds" correctly normalized to "Lord cards"');
  if (monsterTokens) console.log('✅ "M0nster tokens" correctly normalized to "Monster tokens"');

  // Verify Threat token is still excluded
  const threatToken = components.find((c) => c.name === 'Threat token');
  if (!threatToken) {
    console.log('✅ "Threat token" correctly excluded');
  } else {
    console.log('❌ "Threat token" should have been excluded');
  }

  console.log('\n🎉 ENHANCED FEATURES TEST COMPLETE');
}

// Run the test
testEnhancedFeatures();
