import { harvestImagesFromExtraUrls } from './scripts/harvest-images.js';
import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Complete test for Hanamikoji: image harvesting + content parsing
 */
async function testHanamikojiComplete() {
  console.log('🧪 HANAMIKOJI COMPLETE TEST (IMAGES + CONTENT)');
  console.log('='.repeat(50));

  // Test URLs for Hanamikoji
  const extraUrls = ['https://www.ultraboardgames.com/hanamikoji/game-rules.php'];

  // Canonical component labels for Hanamikoji
  const labels = ['Game board', 'Geisha cards', 'Item cards', 'Action markers', 'Victory markers'];

  console.log('🔍 STEP 1: Testing image harvest for Hanamikoji...');
  let imageResults = [];
  try {
    imageResults = await harvestImagesFromExtraUrls(extraUrls, {
      base: '',
      labels,
      verbose: true,
    });

    console.log('\n📊 IMAGE HARVEST RESULTS:');
    console.log(`Found images from ${imageResults.length} URLs`);

    for (const result of imageResults) {
      console.log(`\n🌐 ${result.url}:`);
      console.log(`   Total images: ${result.images.all.length}`);

      for (const [label, images] of Object.entries(result.images.byLabel)) {
        if (images.length > 0) {
          console.log(`   ${label}: ${images.length} images`);
        }
      }
    }
  } catch (error) {
    console.log(`⚠️  Image harvest failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🔍 STEP 2: Testing content parsing for Hanamikoji...');

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

  console.log('📄 Input text:');
  console.log(hanamikojiText);

  const components = extractComponentsFromText(hanamikojiText, true);

  console.log('\n📊 CONTENT EXTRACTION RESULTS:');
  console.log(`Found ${components.length} components`);

  components.forEach((comp, i) => {
    console.log(
      `${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`,
    );
  });

  // Validate against expected results
  console.log('\n' + '='.repeat(50));
  console.log('🎯 VALIDATION AGAINST EXPECTED RESULTS');
  console.log('='.repeat(50));

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

  console.log(`\n📊 CONTENT SCORE: ${correct}/${expected.length} correct`);

  console.log('\n' + '='.repeat(50));
  console.log('🏁 FINAL RESULTS SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Components extracted correctly: ${correct}/${expected.length}`);
  console.log(`🖼️  Images found: ${imageResults.reduce((sum, r) => sum + r.images.all.length, 0)}`);

  console.log('\n🎉 HANAMIKOJI COMPLETE TEST FINISHED');
  return { components, correct, expected: expected.length, imageResults };
}

// Run the test
testHanamikojiComplete();
