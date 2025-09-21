import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Test the enhanced content parsing with Hanamikoji
 */
function testHanamikojiContent() {
  console.log('🧪 HANAMIKOJI CONTENT PARSING TEST');
  console.log('='.repeat(40));

  // Sample Hanamikoji component text
  const hanamikojiText = `
  Components
  
  7 Geisha Cards
  21 Item Cards
  8 Action Markers
  7 Victory Markers
  
  Setup
  Place the game board in the center of the table...
  
  Rules
  On your turn, you may...
  `;

  console.log('🔍 Testing content parsing for Hanamikoji...');
  console.log('📄 Input text:');
  console.log(hanamikojiText);

  const components = extractComponentsFromText(hanamikojiText, true);

  console.log('\n📊 EXTRACTION RESULTS:');
  console.log(`Found ${components.length} components`);

  components.forEach((comp, i) => {
    console.log(
      `${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`,
    );
  });

  // Validate against expected results
  console.log('\n' + '='.repeat(40));
  console.log('🎯 VALIDATION AGAINST EXPECTED RESULTS');
  console.log('='.repeat(40));

  const expected = [
    { label: 'Geisha cards', quantity: 7 },
    { label: 'Item cards', quantity: 21 },
    { label: 'Action markers', quantity: 8 },
    { label: 'Victory markers', quantity: 7 },
  ];

  let correct = 0;
  expected.forEach((exp) => {
    // Try to find a component that matches this expectation
    const found = components.find(
      (c) =>
        c.name.toLowerCase().includes(exp.label.split(' ')[0].toLowerCase()) &&
        c.count === exp.quantity,
    );

    if (found) {
      console.log(`✅ ${exp.label} — ${found.count}`);
      correct++;
    } else {
      console.log(`❌ ${exp.label} — not found or incorrect quantity`);
    }
  });

  console.log(`\n📊 SCORE: ${correct}/${expected.length} correct`);

  console.log('\n🎉 HANAMIKOJI CONTENT PARSING TEST COMPLETE');
  return { components, correct, expected: expected.length };
}

// Run the test
const result = testHanamikojiContent();

console.log('\n' + '='.repeat(40));
console.log('🏁 FINAL RESULTS SUMMARY');
console.log('='.repeat(40));
console.log(`✅ Components extracted correctly: ${result.correct}/${result.expected}`);
