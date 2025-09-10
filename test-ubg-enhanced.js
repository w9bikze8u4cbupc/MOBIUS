#!/usr/bin/env node

import { harvestAllImages } from './scripts/harvest-images.js';
import { loadGameProfile } from './src/utils/game-profiles.js';

async function testEnhancedUBG() {
  console.log('🔍 Testing Enhanced UBG Pipeline...');
  
  try {
    // Test with a game that has a profile
    const gameTitle = 'Abyss';
    console.log(`\n🎮 Testing game: ${gameTitle}`);
    
    // Load game profile
    const profile = await loadGameProfile(gameTitle);
    console.log(`📋 Allowlist: ${profile.allowlist.length} terms`);
    console.log(`📊 Expected counts: ${Object.keys(profile.expectedCounts).length} components`);
    console.log(`🔄 Synonyms: ${Object.keys(profile.synonyms).length} defined`);
    
    // Harvest images
    const results = await harvestAllImages({
      title: gameTitle,
      extraUrls: [],
      verbose: true
    });
    
    console.log('\n📊 Harvest Results:');
    console.log(`Total unique images: ${results.length}`);
    
    // Show provider distribution
    const providerCounts = {};
    results.forEach(img => {
      providerCounts[img.provider] = (providerCounts[img.provider] || 0) + 1;
    });
    
    console.log('\n🏷️  Provider Distribution:');
    Object.entries(providerCounts).forEach(([provider, count]) => {
      console.log(`   ${provider}: ${count}`);
    });
    
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
    
    // Test with another game
    console.log('\n' + '='.repeat(50));
    const gameTitle2 = 'Hanamikoji';
    console.log(`\n🎮 Testing game: ${gameTitle2}`);
    
    const results2 = await harvestAllImages({
      title: gameTitle2,
      extraUrls: [],
      verbose: true
    });
    
    console.log(`\n📊 ${gameTitle2} Results:`);
    console.log(`Total unique images: ${results2.length}`);
    
    // Show provider distribution
    const providerCounts2 = {};
    results2.forEach(img => {
      providerCounts2[img.provider] = (providerCounts2[img.provider] || 0) + 1;
    });
    
    console.log('\n🏷️  Provider Distribution:');
    Object.entries(providerCounts2).forEach(([provider, count]) => {
      console.log(`   ${provider}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testEnhancedUBG();