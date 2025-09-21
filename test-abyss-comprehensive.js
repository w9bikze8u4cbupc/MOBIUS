import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Comprehensive test for the Abyss fix
 */
function testAbyssComprehensive() {
  console.log('🧪 COMPREHENSIVE ABYSS COMPONENT EXTRACTION TEST');
  console.log('='.repeat(60));

  // More realistic PDF content with various sections
  const abyssPdfText = `
  Abyss
  
  A game by Bruno Cathala and Charles Chevallier
  
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
  
  Object of the Game
  
  You are a Master of the Abyss, and you want to gain the most Glory 
  by recruiting powerful Lords and exploring dangerous Locations.
  
  Game Overview
  
  Abyss is a game of exploration and political maneuvering...
  
  On the 6th space, they win 2 Pearls...
  Draw 1, 2, 3, or 4 Locations...
  Front of a Location
  Back of a Location
  The Traitor card
  Master of Magic
  Some text about how players gain 3 victory points for each Lord...
  During the game, players may receive additional cards as rewards...
  `;

  console.log('🔍 EXTRACTING COMPONENTS FROM REALISTIC PDF TEXT...');
  const components = extractComponentsFromText(abyssPdfText);

  console.log('\n✅ EXTRACTION RESULTS:');
  console.log(`Found ${components.length} components`);

  components.forEach((comp, i) => {
    console.log(
      `${i + 1}. ${comp.name}${comp.count ? ` — ${comp.count}` : ' — null'}${comp.note ? ` (note: ${comp.note})` : ''}`,
    );
  });

  // Validate against expected results
  console.log('\n' + '='.repeat(60));
  console.log('🎯 VALIDATION AGAINST GROUND TRUTH');
  console.log('='.repeat(60));

  const expected = [
    { name: 'Game Board', count: 1 },
    { name: 'Exploration Cards', count: 71, note: '65 Allies & 6 Monsters' },
    { name: 'Lord Cards', count: 35 },
    { name: 'Location Tiles', count: 20 },
    { name: 'Monster Tokens', count: 20, note: '2 of value 4, 9 of value 3, and 9 of value 2' },
    { name: 'Threat Token', count: 1 },
    { name: 'Key Tokens', count: 10 },
    { name: 'Pearls', count: null },
    { name: 'Plastic Cups', count: null },
  ];

  let correct = 0;
  expected.forEach((exp) => {
    const found = components.find(
      (c) =>
        c.name === exp.name && c.count === exp.count && (exp.note ? c.note === exp.note : true),
    );

    if (found) {
      console.log(`✅ ${exp.name}`);
      correct++;
    } else {
      console.log(`❌ ${exp.name}`);
    }
  });

  console.log(`\n📊 SCORE: ${correct}/${expected.length} correct`);

  if (correct === expected.length) {
    console.log('🎉 PERFECT! All components extracted correctly');
  } else {
    console.log('⚠️ Some components not extracted as expected');
  }

  // Check that we're NOT extracting the problematic items
  console.log('\n' + '='.repeat(60));
  console.log('🚫 CHECKING FOR PROBLEMATIC EXTRACTIONS:');
  console.log('='.repeat(60));
  const problematic = [
    'On The 6Th Space, They Win 2 Pearls',
    'Draw 1, 2, 3, Or 4 Locations',
    'Front Of A Location',
    'Back Of A Location',
    'The Traitor Card',
    'Master Of Magic',
    '3 Victory Points For Each Lord',
    'Additional Cards As Rewards',
  ];

  let falsePositives = 0;
  problematic.forEach((item) => {
    const found = components.find((c) => c.name.toLowerCase().includes(item.toLowerCase()));
    if (found) {
      console.log(`❌ FALSE POSITIVE: ${found.name}`);
      falsePositives++;
    } else {
      console.log(`✅ Correctly excluded: ${item}`);
    }
  });

  if (falsePositives === 0) {
    console.log('\n🎉 SUCCESS! No false positives detected');
  } else {
    console.log(`\n⚠️ ${falsePositives} false positives found`);
  }

  // Test section boundary detection
  console.log('\n' + '='.repeat(60));
  console.log('🔍 TESTING SECTION BOUNDARY DETECTION:');
  console.log('='.repeat(60));

  // Test with different section headers
  const testCases = [
    {
      name: 'Box Contents header',
      text: 'Box Contents\n1 Game board\n71 Exploration cards\nGame Overview\n...',
      expectedCount: 2,
    },
    {
      name: 'Components header',
      text: 'Components\n1 Game board\n71 Exploration cards\nSetup\n...',
      expectedCount: 2,
    },
    {
      name: 'Game Components header',
      text: 'Game Components\n1 Game board\n71 Exploration cards\nObject of the Game\n...',
      expectedCount: 2,
    },
    {
      name: 'No section header',
      text: '1 Game board\n71 Exploration cards\nSome other text\n...',
      expectedCount: 0, // Should not extract anything without proper section
    },
  ];

  testCases.forEach((testCase) => {
    const result = extractComponentsFromText(testCase.text);
    const passed = result.length === testCase.expectedCount;
    console.log(
      `${passed ? '✅' : '❌'} ${testCase.name}: ${result.length} components (expected ${testCase.expectedCount})`,
    );
  });

  return { components, correct, expected: expected.length, falsePositives };
}

// Run the comprehensive test
const result = testAbyssComprehensive();

console.log('\n' + '='.repeat(60));
console.log('🏁 FINAL RESULTS SUMMARY');
console.log('='.repeat(60));
console.log(`✅ Components extracted correctly: ${result.correct}/${result.expected}`);
console.log(`❌ False positives: ${result.falsePositives}`);
console.log(
  `🎯 Overall success: ${result.correct === result.expected && result.falsePositives === 0 ? 'YES' : 'NO'}`,
);

if (result.correct === result.expected && result.falsePositives === 0) {
  console.log('\n🎉 ABYSS COMPONENT EXTRACTION FIX IS WORKING PERFECTLY!');
} else {
  console.log('\n⚠️ Some issues remain with the fix.');
}
