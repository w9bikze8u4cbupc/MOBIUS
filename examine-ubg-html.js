import { resolveUbgRulesUrl } from './src/sources/ultraBoardGames.js';
import * as cheerio from 'cheerio';

async function examineHtml() {
  console.log('Fetching UBG page for Abyss...');
  
  const resolved = await resolveUbgRulesUrl("Abyss");
  console.log('Resolved:', resolved.url);
  
  if (resolved.html) {
    const $ = cheerio.load(resolved.html);
    
    // Look for components section headers
    const compHeaders = $('h1,h2,h3,h4,h5,h6').filter((_, el) => {
      const txt = $(el).text().trim().toLowerCase();
      return txt.includes('components') || txt.includes('contents') || txt.includes('setup') || 
             txt.includes('spielmaterial') || txt.includes('contenu') || txt.includes('componentes') ||
             txt.includes('componenti') || txt.includes('matériel') || txt.includes('composants') ||
             txt.includes('contenidos') || txt.includes('materiale');
    });
    
    console.log('Component-related headers found:', compHeaders.length);
    compHeaders.each((i, el) => {
      console.log(`  ${$(el).prop('tagName')}: ${$(el).text().trim()}`);
    });
    
    // If we found a components header, look at images near it
    if (compHeaders.length > 0) {
      const compHeader = compHeaders.first();
      console.log('\nLooking for images near components section...');
      
      // Look at the next few elements after the header
      let el = compHeader.next();
      let count = 0;
      while (el.length && count < 10) {
        console.log(`\nElement ${count + 1}: ${el.prop('tagName')}`);
        console.log(`  Text: ${el.text().substring(0, 100)}...`);
        
        // Look for images in this element
        const images = el.find('img');
        if (images.length > 0) {
          console.log(`  Found ${images.length} images:`);
          images.each((j, img) => {
            console.log(`    Image ${j + 1}:`);
            console.log(`      src: ${$(img).attr('src')}`);
            console.log(`      width: ${$(img).attr('width')}`);
            console.log(`      height: ${$(img).attr('height')}`);
            console.log(`      srcset: ${$(img).attr('srcset')}`);
            console.log(`      data-src: ${$(img).attr('data-src')}`);
            console.log(`      data-srcset: ${$(img).attr('data-srcset')}`);
          });
        }
        
        el = el.next();
        count++;
      }
    }
    
    // Also look at all images on the page
    console.log('\nAll images on page:');
    $('img').slice(0, 10).each((i, el) => {
      console.log(`\nImage ${i + 1}:`);
      console.log(`  src: ${$(el).attr('src')}`);
      console.log(`  width: ${$(el).attr('width')}`);
      console.log(`  height: ${$(el).attr('height')}`);
      console.log(`  srcset: ${$(el).attr('srcset')}`);
      console.log(`  data-src: ${$(el).attr('data-src')}`);
      console.log(`  data-srcset: ${$(el).attr('data-srcset')}`);
    });
  }
}

examineHtml().catch(console.error);