#!/usr/bin/env node

import { harvestImagesFromExtraUrls } from './scripts/harvest-images.js';

/**
 * Comprehensive test for image harvesting functionality
 */
async function testImageHarvesting() {
  console.log('🧪 COMPREHENSIVE IMAGE HARVESTING TEST');
  console.log('='.repeat(50));
  
  // Test with multiple URLs for a game
  const testCases = [
    {
      name: 'Hanamikoji',
      urls: [
        'https://www.ultraboardgames.com/hanamikoji/game-rules.php',
        'https://en.emperors4.com/game/hanamikoji'
      ],
      labels: [
        'Game board',
        'Geisha cards',
        'Item cards',
        'Action markers',
        'Victory markers'
      ]
    },
    {
      name: 'Abyss',
      urls: [
        'https://www.ultraboardgames.com/abyss/game-rules.php'
      ],
      labels: [
        'Game board',
        'Exploration cards',
        'Lord cards',
        'Location tiles',
        'Monster tokens',
        'Key tokens',
        'Pearls',
        'Plastic cups'
      ]
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Testing ${testCase.name} image harvesting...`);
    console.log(`🔗 URLs: ${testCase.urls.join(', ')}`);
    console.log(`🏷️  Labels: ${testCase.labels.join(', ')}`);
    
    try {
      const results = await harvestImagesFromExtraUrls(testCase.urls, { 
        base: '', 
        labels: testCase.labels, 
        verbose: true 
      });
      
      console.log(`\n📊 ${testCase.name} HARVEST RESULTS:`);
      console.log(`Found images from ${results.length} URLs`);
      
      let totalImages = 0;
      for (const result of results) {
        console.log(`\n🌐 ${result.url}:`);
        console.log(`   Total unique images: ${result.images.all.length}`);
        totalImages += result.images.all.length;
        
        // Show images by label
        let labelImages = 0;
        for (const [label, images] of Object.entries(result.images.byLabel)) {
          if (images.length > 0) {
            console.log(`   ${label}: ${images.length} images`);
            labelImages += images.length;
            images.forEach((img, i) => {
              console.log(`     ${i + 1}. ${img.url} (boost: ${img.vicinityBoost}, size: ${img.width}x${img.height})`);
            });
          }
        }
        
        // Show unlabeled images (hero bucket)
        if (result.images.byLabel["hero"] && result.images.byLabel["hero"].length > 0) {
          console.log(`   Hero images: ${result.images.byLabel["hero"].length} images`);
          result.images.byLabel["hero"].forEach((img, i) => {
            console.log(`     ${i + 1}. ${img.url} (boost: ${img.vicinityBoost}, size: ${img.width}x${img.height})`);
          });
        }
      }
      
      console.log(`\n📈 ${testCase.name} SUMMARY:`);
      console.log(`   Total images collected: ${totalImages}`);
      
    } catch (error) {
      console.error(`❌ Error during ${testCase.name} image harvest:`, error.message);
    }
  }
  
  console.log('\n🎉 IMAGE HARVESTING TEST COMPLETE');
}

// Run the test
testImageHarvesting();