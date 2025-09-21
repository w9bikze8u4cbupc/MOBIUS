import { harvestAllImages } from './scripts/harvest-images.js';

async function testScoring() {
  console.log('Testing scoring function...');

  const result = await harvestAllImages({
    title: 'Abyss',
    verbose: false,
  });

  console.log(`Got ${result.images.length} images`);

  // Show details of first few images
  for (let i = 0; i < Math.min(3, result.images.length); i++) {
    const img = result.images[i];
    console.log(`\nImage ${i + 1}:`);
    console.log(`  URL: ${img.url}`);
    console.log(`  Width: ${img.width || img.w}`);
    console.log(`  Height: ${img.height || img.h}`);
    console.log(`  Section Distance: ${img.sectionDistance}`);
    console.log(`  Size Score: ${img.scores?.sizeScore}`);
    console.log(`  Proximity Score: ${img.scores?.proximityScore}`);
    console.log(`  Final Score: ${img.finalScore}`);
  }
}

testScoring().catch(console.error);
