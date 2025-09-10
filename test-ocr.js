import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test OCR enhancements
 */
function testOCREnhancements() {
  console.log('🧪 OCR ENHANCEMENTS TEST');
  console.log('='.repeat(40));
  
  // Test text with OCR issues
  const ocrText = `
  Contents & Setup
  
  1 Game b0ard  // OCR: b0ard
  71 Expi0ration cards (65 Allies & 6 Monsters)  // OCR: Expi0ration
  20 M0nster t0kens (2 of value 4, 9 of value 3, and 9 of value 2)  // OCR: M0nster, t0kens
  Plastic Plastic Cups  // Repeated word
  Pearls — 50  // Stray dash
  
  Game Overview
  `;
  
  console.log('🔍 TESTING OCR ENHANCEMENTS...');
  const components = extractComponentsFromText(ocrText, true);
  
  console.log('\n📊 RESULTS:');
  console.log(`Found ${components.length} components`);
  
  // Check that OCR issues were corrected
  const gameBoard = components.find(c => c.name === 'Game board');
  const explorationCards = components.find(c => c.name === 'Exploration cards');
  const monsterTokens = components.find(c => c.name === 'Monster tokens');
  const plasticCups = components.find(c => c.name === 'Plastic cups');
  const pearls = components.find(c => c.name === 'Pearls');
  
  if (gameBoard) console.log('✅ "b0ard" correctly normalized to "board"');
  if (explorationCards) console.log('✅ "Expi0ration" correctly normalized to "Exploration"');
  if (monsterTokens) console.log('✅ "M0nster t0kens" correctly normalized to "Monster tokens"');
  if (plasticCups) console.log('✅ "Plastic Plastic Cups" de-duplicated to "Plastic Cups"');
  if (pearls && pearls.count === 50) console.log('✅ Stray dash normalized correctly');
  
  console.log('\n🎉 OCR ENHANCEMENTS TEST COMPLETE');
}

// Run the test
testOCREnhancements();