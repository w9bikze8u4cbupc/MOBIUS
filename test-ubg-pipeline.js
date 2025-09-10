#!/usr/bin/env node

import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';
import { loadGameProfile } from './src/utils/game-profiles.js';

async function testFullPipeline() {
  console.log('🚀 Testing Full UBG Pipeline with Game Profiles...');
  
  try {
    // Test UBG fetching
    console.log('\n🔍 Fetching UBG Data for Love Letter...');
    const ubgResult = await fetchUbgAuto('Love Letter');
    
    if (!ubgResult.ok) {
      console.log('❌ UBG fetch failed:', ubgResult.reason);
      return;
    }
    
    console.log('✅ UBG Fetch Success');
    console.log('   Rules URL:', ubgResult.rulesUrl);
    console.log('   Components Found:', ubgResult.components.items.length);
    console.log('   Images Found:', ubgResult.images.length);
    
    // Display components
    console.log('\n📋 Raw Components:');
    ubgResult.components.items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item}`);
    });
    
    // Display images
    console.log('\n🖼️  Top Images:');
    ubgResult.images.slice(0, 5).forEach((img, index) => {
      console.log(`   ${index + 1}. ${img.url} (${img.w}x${img.h}) score=${img.score} context=${img.context}`);
    });
    
    // Test game profile integration
    console.log('\n🎯 Loading Game Profile...');
    const profile = await loadGameProfile('Love Letter');
    console.log('   Profile loaded with', profile.allowlist.length, 'allowlist items');
    console.log('   Expected counts for', Object.keys(profile.expectedCounts).length, 'components');
    
    // Test provider weights
    console.log('\n⚖️  Provider Weights:');
    const providerWeights = {
      'ubg': 0.85,
      'pdf-embedded': 1.0,
      'pdf-snapshot': 0.7,
      'web-general': 0.7
    };
    
    Object.entries(providerWeights).forEach(([provider, weight]) => {
      console.log(`   ${provider}: ${weight}`);
    });
    
    console.log('\n✅ Full Pipeline Test Complete');
    
  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
    process.exit(1);
  }
}

testFullPipeline();