import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Final test for the Abyss fix with exact requirements
 */
function testAbyssFinal() {
  console.log('🧪 FINAL ABYSS COMPONENT EXTRACTION TEST');
  console.log('='.repeat(50));

  // Abyss game component text
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

  console.log('🔍 EXTRACTING COMPONENTS...');
  const components = extractComponentsFromText(abyssText);

  console.log('\n✅ EXTRACTION RESULTS:');
  console.log(`Found ${components.length} components`);

  components.forEach((comp, i) => {
    console.log(
      `${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`,
    );
  });

  // Validate against expected results
  console.log('\n' + '='.repeat(50));
  console.log('🎯 VALIDATION AGAINST GOLDEN TEST');
  console.log('='.repeat(50));

  const expected = [
    { label: 'Game board', quantity: 1 },
    {
      label: 'Exploration cards',
      quantity: 71,
      breakdown: [
        { label: 'Allies', quantity: 65 },
        { label: 'Monsters', quantity: 6 },
      ],
    },
    { label: 'Lord cards', quantity: 35 },
    { label: 'Location tiles', quantity: 20 },
    {
      label: 'Monster tokens',
      quantity: 20,
      breakdown: [
        { count: 2, value: 4 },
        { count: 9, value: 3 },
        { count: 9, value: 2 },
      ],
    },
    { label: 'Key tokens', quantity: 10 },
    { label: 'Pearls', quantity: 'supply' },
    { label: 'Plastic cups', quantity: 'supply' },
  ];

  let correct = 0;
  expected.forEach((exp) => {
    const found = components.find((c) => c.name === exp.label);

    if (found) {
      // Check quantity
      if (found.count === exp.quantity) {
        console.log(`✅ ${exp.label} — ${found.count}`);
        correct++;
      } else {
        console.log(`❌ ${exp.label} — expected ${exp.quantity}, got ${found.count}`);
      }
    } else {
      console.log(`❌ ${exp.label} — not found`);
    }
  });

  // Check that Threat token is NOT included
  const threatToken = components.find((c) => c.name === 'Threat token');
  if (threatToken) {
    console.log('❌ Threat token — should not be included');
  } else {
    console.log('✅ Threat token — correctly excluded');
    correct++; // Add one point for correctly excluding threat token
  }

  console.log(`\n📊 SCORE: ${correct}/${expected.length + 1} correct`); // +1 for threat token exclusion

  // Check that we're NOT extracting the problematic items
  console.log('\n' + '='.repeat(50));
  console.log('🚫 CHECKING FOR PROBLEMATIC EXTRACTIONS:');
  console.log('='.repeat(50));
  const problematic = [
    'On the 6th space, they win 2 Pearls',
    'Draw 1, 2, 3, or 4 Locations',
    'Front of a Location',
    'Back of a Location',
    'The Traitor card',
    'Master of Magic',
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

  return { components, correct, expected: expected.length + 1, falsePositives };
}

// Run the test
const result = testAbyssFinal();

console.log('\n' + '='.repeat(50));
console.log('🏁 FINAL RESULTS SUMMARY');
console.log('='.repeat(50));
console.log(`✅ Components extracted correctly: ${result.correct}/${result.expected}`);
console.log(`❌ False positives: ${result.falsePositives}`);

if (result.correct === result.expected && result.falsePositives === 0) {
  console.log('\n🎉 ABYSS COMPONENT EXTRACTION FIX IS WORKING PERFECTLY!');
} else {
  console.log('\n⚠️ Some issues remain with the fix.');
}
