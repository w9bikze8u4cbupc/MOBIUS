#!/usr/bin/env node

import { harvestAllImages } from './scripts/harvest-images.js';

async function testHarvest() {
  console.log('🔍 Testing UBG image harvesting with scoring and deduplication...');
  
  try {
    const results = await harvestAllImages({
      title: 'Love Letter',
      verbose: true
    });
    
    console.log('\n📊 Harvest Results:');
    console.log(`Total unique images: ${results.length}`);
    
    // Show top 5 images with their scores
    console.log('\n🏆 Top 5 Images:');
    results.slice(0, 5).forEach((img, index) => {
      console.log(`${index + 1}. ${img.url}`);
      console.log(`   Provider: ${img.provider}`);
      console.log(`   Score: ${img.finalScore?.toFixed(3)}`);
      console.log(`   Size: ${img.width}x${img.height}`);
      console.log(`   Alt: ${img.alt}`);
      console.log(`   Uniqueness: ${img.uniquenessScore?.toFixed(3)}`);
      console.log('');
    });
    
    // Show provider distribution
    const providerCounts = {};
    results.forEach(img => {
      providerCounts[img.provider] = (providerCounts[img.provider] || 0) + 1;
    });
    
    console.log('🏷️  Provider Distribution:');
    Object.entries(providerCounts).forEach(([provider, count]) => {
      console.log(`   ${provider}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Harvest test failed:', error);
    process.exit(1);
  }
}

testHarvest();