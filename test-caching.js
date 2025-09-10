#!/usr/bin/env node

import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';

async function testCaching() {
  console.log('🔍 Testing UBG Caching Functionality...');
  
  const gameTitle = 'Abyss';
  
  console.log(`\n🎮 First request for: ${gameTitle}`);
  const start1 = Date.now();
  const result1 = await fetchUbgAuto(gameTitle);
  const time1 = Date.now() - start1;
  
  console.log(`📊 First request took: ${time1}ms`);
  console.log(`キャッシング Cache status: ${result1.cache || 'MISS'}`);
  console.log(`📄 Found: ${result1.ok ? 'YES' : 'NO'}`);
  
  if (result1.ok) {
    console.log(`🖼️  Images found: ${result1.images.length}`);
  }
  
  console.log(`\n🎮 Second request for: ${gameTitle} (should be cached)`);
  const start2 = Date.now();
  const result2 = await fetchUbgAuto(gameTitle);
  const time2 = Date.now() - start2;
  
  console.log(`📊 Second request took: ${time2}ms`);
  console.log(`キャッシング Cache status: ${result2.cache || 'MISS'}`);
  console.log(`📄 Found: ${result2.ok ? 'YES' : 'NO'}`);
  
  if (result2.ok) {
    console.log(`🖼️  Images found: ${result2.images.length}`);
  }
  
  console.log(`\n⚡ Performance improvement: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
  
  // Test with a different game
  console.log('\n' + '='.repeat(50));
  const gameTitle2 = 'Hanamikoji';
  
  console.log(`\n🎮 Testing cache with different game: ${gameTitle2}`);
  const start3 = Date.now();
  const result3 = await fetchUbgAuto(gameTitle2);
  const time3 = Date.now() - start3;
  
  console.log(`📊 Request took: ${time3}ms`);
  console.log(`キャッシング Cache status: ${result3.cache || 'MISS'}`);
  console.log(`📄 Found: ${result3.ok ? 'YES' : 'NO'}`);
  
  if (result3.ok) {
    console.log(`🖼️  Images found: ${result3.images.length}`);
  }
  
  console.log('\n🏁 Caching test complete!');
}

testCaching();