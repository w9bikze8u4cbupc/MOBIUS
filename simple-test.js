#!/usr/bin/env node

import { harvestAllImages } from './scripts/harvest-images.js';

async function test() {
  console.log('Testing harvestAllImages...');
  try {
    const result = await harvestAllImages({ 
      title: "Abyss", 
      verbose: true 
    });
    console.log('Success! Got results:');
    console.log(`Images count: ${result.images.length}`);
    console.log(`Provider counts:`, result.providerCounts);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test().catch(console.error);