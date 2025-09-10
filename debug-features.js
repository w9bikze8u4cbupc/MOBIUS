import { harvestAllImages } from './scripts/harvest-images.js';

async function debugFeatures() {
  console.log('Debugging feature extraction...');
  
  const result = await harvestAllImages({ 
    title: "Abyss", 
    verbose: false 
  });
  
  console.log(`Total images: ${result.images.length}`);
  
  // Show details of first few images
  for (let i = 0; i < Math.min(3, result.images.length); i++) {
    const img = result.images[i];
    console.log(`\nImage ${i + 1}:`);
    console.log(`  URL: ${img.url}`);
    console.log(`  Width: ${img.width}`);
    console.log(`  Height: ${img.height}`);
    console.log(`  Provider: ${img.provider}`);
    console.log(`  Provider Weight: ${img.providerWeight}`);
    console.log(`  Section Distance: ${img.sectionDistance}`);
    console.log(`  Quality Focus: ${img.qualityFocus}`);
    console.log(`  Uniqueness Score: ${img.uniquenessScore}`);
    console.log(`  Size Score: ${img.sizeScore}`);
    console.log(`  Proximity Score: ${img.proximityScore}`);
    console.log(`  Final Score: ${img.finalScore}`);
    console.log(`  Confidence: ${img.confidence}`);
    if (img.scores) {
      console.log(`  Scores:`, img.scores);
    }
    if (img.weights) {
      console.log(`  Weights:`, img.weights);
    }
  }
}

debugFeatures().catch(console.error);