import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test the Abyss fix with the actual component list from the PDF
 */
function testAbyssFix() {
  console.log('🧪 TESTING ABYSS COMPONENT EXTRACTION FIX');
  console.log('='.repeat(50));

  // This is what the Abyss PDF actually lists in the "Contents & Setup" section:
  const abyssPdfText = `
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

  console.log('📄 INPUT TEXT (simulating PDF content):');
  console.log(abyssPdfText);

  console.log('\n🔍 EXTRACTING COMPONENTS...');
  const components = extractComponentsFromText(abyssPdfText);

  console.log('\n✅ EXTRACTION RESULTS:');
  console.log(`Found ${components.length} components`);

  components.forEach((comp, i) => {
    console.log(
      `${i + 1}. ${comp.name}${comp.count ? ` — ${comp.count}` : ' — null'}${comp.note ? ` (note: ${comp.note})` : ''}`,
    );
  });

  // Validate against expected results
  console.log('\n' + '='.repeat(50));
  console.log('🎯 VALIDATION AGAINST GROUND TRUTH');
  console.log('='.repeat(50));

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
  console.log('\n🚫 CHECKING FOR PROBLEMATIC EXTRACTIONS:');
  const problematic = [
    'On The 6Th Space, They Win 2 Pearls',
    'Draw 1, 2, 3, Or 4 Locations',
    'Front Of A Location',
    'Back Of A Location',
    'The Traitor Card',
    'Master Of Magic',
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

  return components;
}

// Run the test
testAbyssFix();
