#!/usr/bin/env node

import { harvestAllImages } from './scripts/harvest-images.js';

async function testProviderHeaders() {
  console.log('Testing provider headers functionality...');

  try {
    // Test with a known game
    const result = await harvestAllImages({
      title: 'Abyss',
      verbose: true,
    });

    console.log('\n=== Provider Headers ===');
    console.log('Headers:', result.headers);

    console.log('\n=== Provider Counts ===');
    console.log('Provider Counts:', result.providerCounts);

    console.log('\n=== Provider Metrics ===');
    console.log('Provider Metrics:', result.providerMetrics);

    console.log('\n=== Sample Images ===');
    result.images.slice(0, 3).forEach((img, index) => {
      console.log(`${index + 1}. ${img.url}`);
      console.log(`   Provider: ${img.provider}`);
      console.log(`   Confidence: ${img.confidence}`);
      console.log(`   Final Score: ${img.finalScore}`);
      console.log(`   Cluster ID: ${img.clusterId}`);
      if (img.scores) {
        console.log('   Scores:', img.scores);
      }
      if (img.weights) {
        console.log('   Weights:', img.weights);
      }
      console.log('');
    });

    console.log('✅ Provider headers test completed successfully');
  } catch (error) {
    console.error('❌ Provider headers test failed:', error);
    process.exit(1);
  }
}

testProviderHeaders().catch(console.error);
