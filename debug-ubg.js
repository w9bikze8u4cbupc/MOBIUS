import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';

async function debugUbg() {
  console.log('Debugging UBG adapter...');

  const result = await fetchUbgAuto('Abyss');
  if (!result.ok) {
    console.log('Failed to fetch UBG data');
    return;
  }

  console.log(`Found ${result.images.length} images`);

  // Show details of first few images
  for (let i = 0; i < Math.min(5, result.images.length); i++) {
    const img = result.images[i];
    console.log(`\nImage ${i + 1}:`);
    console.log(`  URL: ${img.url}`);
    console.log(`  Width: ${img.w}`);
    console.log(`  Height: ${img.h}`);
    console.log(`  Alt: ${img.alt}`);
    console.log(`  Context: ${img.context}`);
    console.log(`  Section Distance: ${img.sectionDistance}`);
    console.log(`  Quality Focus: ${img.qualityFocus}`);
  }
}

debugUbg().catch(console.error);
