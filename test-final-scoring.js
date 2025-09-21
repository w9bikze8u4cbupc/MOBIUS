import { harvestAllImages } from './scripts/harvest-images.js';

async function testFinalScoring() {
  console.log('🔍 Testing Final Scoring with Optimized Weights...');

  const result = await harvestAllImages({
    title: 'Abyss',
    verbose: false,
  });

  console.log(`📊 Found ${result.images.length} images`);

  // Show scoring details for first few images
  result.images.slice(0, 3).forEach((img, i) => {
    console.log(`\n🖼️  Image ${i + 1}: ${img.url}`);
    console.log(`   Width: ${img.width || img.w}, Height: ${img.height || img.h}`);
    console.log(`   Section Distance: ${img.sectionDistance}`);
    console.log(`   Size Score: ${img.scores?.sizeScore?.toFixed(4)}`);
    console.log(`   Proximity Score: ${img.scores?.proximityScore?.toFixed(4)}`);
    console.log(`   Source Score: ${img.scores?.sourceScore?.toFixed(4)}`);
    console.log(`   Focus Score: ${img.scores?.focusScore?.toFixed(4)}`);
    console.log(`   Unique Score: ${img.scores?.uniqueScore?.toFixed(4)}`);
    console.log(`   Final Score: ${img.finalScore?.toFixed(4)}`);
    console.log('   Weights Used:', img.weights);
  });

  // Check if scores are using the optimized weights
  const firstImg = result.images[0];
  if (firstImg && firstImg.weights) {
    console.log('\n🎯 Optimized Weights Check:');
    console.log(`   Size Weight: ${firstImg.weights.size} (expected: 0.20)`);
    console.log(`   Proximity Weight: ${firstImg.weights.proximity} (expected: 0.20)`);
    console.log(`   Source Weight: ${firstImg.weights.source} (expected: 0.25)`);
    console.log(`   Focus Weight: ${firstImg.weights.focus} (expected: 0.30)`);
    console.log(`   Unique Weight: ${firstImg.weights.unique} (expected: 0.20)`);
  }
}

testFinalScoring().catch(console.error);
