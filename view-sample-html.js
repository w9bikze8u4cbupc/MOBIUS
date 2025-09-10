import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';
import * as cheerio from 'cheerio';

async function viewSampleHtml() {
  console.log('Fetching UBG page for Abyss...');
  
  const result = await fetchUbgAuto("Abyss");
  if (!result.ok) {
    console.log('Failed to fetch UBG data');
    return;
  }
  
  console.log('Found images:');
  result.images.forEach((img, i) => {
    console.log(`\nImage ${i + 1}:`);
    console.log(`  URL: ${img.url}`);
    console.log(`  Width: ${img.w}`);
    console.log(`  Height: ${img.h}`);
    console.log(`  Context: ${img.context}`);
    console.log(`  Section Distance: ${img.sectionDistance}`);
  });
  
  // Test size extraction on these URLs
  console.log('\n\nTesting size extraction on UBG URLs:');
  const { parseSizeFromUrl } = await import('./src/utils/sizeExtract.js');
  
  result.images.forEach((img, i) => {
    const sizeInfo = parseSizeFromUrl(img.url);
    console.log(`  ${img.url} ->`, sizeInfo);
  });
}

viewSampleHtml().catch(console.error);