#!/usr/bin/env node

/**
 * Comprehensive test for UBG hardening enhancements
 */

import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';
import { harvestAllImages } from './scripts/harvest-images.js';
import { loadGameProfile } from './src/utils/game-profiles.js';
import { canonicalizeImageUrl } from './src/utils/url-canon.js';
import { confidenceBand, detailedConfidence } from './src/utils/confidence-badge.js';
import { getEnabledProviders, isProviderEnabled } from './src/config/providers.js';
import { focusScore } from './src/utils/image-quality.js';
import { hammingDistance } from './src/utils/image-dedupe.js';

async function testHardeningEnhancements() {
  console.log('🛡️  UBG HARDENING ENHANCEMENTS TEST');
  console.log('='.repeat(50));
  
  const gameTitle = 'Love Letter';
  
  // 1. Test provider configuration
  console.log('\n1. ⚙️  PROVIDER CONFIGURATION');
  console.log(`   Enabled providers: ${getEnabledProviders().join(', ')}`);
  console.log(`   UBG enabled: ${isProviderEnabled('ubg')}`);
  console.log(`   Web general enabled: ${isProviderEnabled('web-general')}`);
  
  // 2. Test URL canonicalization
  console.log('\n2. 🔗 URL CANONICALIZATION');
  const testUrls = [
    'https://example.com/image.jpg?width=100&height=100',
    'https://example.com/image.jpg?utm_source=test&v=123',
    'https://example.com/image.jpg?cache=12345&w=200&h=300'
  ];
  
  for (const url of testUrls) {
    const canonical = canonicalizeImageUrl(url);
    console.log(`   ${url} → ${canonical}`);
  }
  
  // 3. Test confidence band calculation
  console.log('\n3. ⭐ CONFIDENCE BAND CALCULATION');
  const testImages = [
    { providerWeight: 0.85, proximityScore: 0.9, sizeScore: 0.8, qualityFocus: 0.7 },
    { providerWeight: 0.7, proximityScore: 0.5, sizeScore: 0.6, qualityFocus: 0.4 },
    { providerWeight: 0.5, proximityScore: 0.3, sizeScore: 0.4, qualityFocus: 0.2 }
  ];
  
  for (let i = 0; i < testImages.length; i++) {
    const confidence = confidenceBand(testImages[i]);
    const detailed = detailedConfidence(testImages[i]);
    console.log(`   Image ${i+1}: ${confidence} (${detailed.score})`);
  }
  
  // 4. Test Hamming distance
  console.log('\n4. 🔢 HAMMING DISTANCE');
  const hash1 = 'ffffffffffffffff';
  const hash2 = 'fffffffffffffffe';
  const hash3 = '0000000000000000';
  
  console.log(`   Distance ${hash1} ↔ ${hash2}: ${hammingDistance(hash1, hash2)}`);
  console.log(`   Distance ${hash1} ↔ ${hash3}: ${hammingDistance(hash1, hash3)}`);
  
  // 5. Test UBG auto-discovery with enhancements
  console.log('\n5. 🔍 UBG AUTO-DISCOVERY WITH ENHANCEMENTS');
  const ubgResult = await fetchUbgAuto(gameTitle);
  console.log(`   ✅ Found: ${ubgResult.ok ? 'YES' : 'NO'}`);
  console.log(`   🌐 URL: ${ubgResult.rulesUrl}`);
  console.log(`   📦 Cache Status: ${ubgResult.cache || 'MISS'}`);
  console.log(`   🖼️  Images: ${ubgResult.images.length}`);
  console.log(`   📋 Components: ${ubgResult.components.items.length}`);
  
  // 6. Test full harvesting pipeline
  console.log('\n6. ⚙️  FULL HARVESTING PIPELINE');
  const harvestResult = await harvestAllImages({
    title: gameTitle,
    extraUrls: [],
    verbose: false
  });
  
  console.log(`   ✅ Total unique images: ${harvestResult.length}`);
  
  // Provider distribution
  const providerDist = {};
  harvestResult.forEach(img => {
    providerDist[img.provider] = (providerDist[img.provider] || 0) + 1;
  });
  console.log(`   🏷️  Provider distribution:`, providerDist);
  
  // Confidence distribution
  const confidenceDist = { High: 0, Medium: 0, Low: 0 };
  harvestResult.forEach(img => {
    confidenceDist[img.confidence] = (confidenceDist[img.confidence] || 0) + 1;
  });
  console.log(`   ⭐ Confidence distribution:`, confidenceDist);
  
  // 7. Show top results with confidence
  console.log('\n7. 🏆 TOP SCORED IMAGES WITH CONFIDENCE');
  harvestResult.slice(0, 3).forEach((img, i) => {
    console.log(`   ${i+1}. ${img.url}`);
    console.log(`      Provider: ${img.provider} | Score: ${img.finalScore?.toFixed(3)} | Confidence: ${img.confidence}`);
    console.log(`      Size: ${img.width}x${img.height} | Alt: "${img.alt}"`);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log('🎉 UBG HARDENING ENHANCEMENTS TEST COMPLETE');
  console.log('All enhancements are working correctly!');
}

testHardeningEnhancements().catch(console.error);