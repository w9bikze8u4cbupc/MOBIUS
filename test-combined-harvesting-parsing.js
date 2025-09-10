#!/usr/bin/env node

import { harvestImagesFromExtraUrls } from './scripts/harvest-images.js';
import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Combined test for image harvesting and content parsing
 */
async function testCombinedHarvestingAndParsing() {
  console.log('🧪 COMBINED IMAGE HARVESTING AND CONTENT PARSING TEST');
  console.log('='.repeat(60));
  
  // Test with Hanamikoji data
  const testCase = {
    name: 'Hanamikoji',
    urls: [
      'https://www.ultraboardgames.com/hanamikoji/game-rules.php',
      'https://en.emperors4.com/game/hanamikoji'
    ],
    componentText: `
Components

7 Geisha Cards
21 Item Cards
8 Action Markers
7 Victory Markers

Setup
Place the game board in the center of the table...

Rules
On your turn, you may...
`,
    labels: [
      'Game board',
      'Geisha cards',
      'Item cards',
      'Action markers',
      'Victory markers'
    ]
  };
  
  console.log(`\n🔍 Testing ${testCase.name}...`);
  
  // Test content parsing
  console.log('\n📄 CONTENT PARSING TEST:');
  const components = extractComponentsFromText(testCase.componentText, true);
  
  console.log(`\n📊 CONTENT PARSING RESULTS:`);
  console.log(`Found ${components.length} components`);
  
  // Validate content parsing results
  const expectedComponents = [
    { label: 'Geisha cards', quantity: 7 },
    { label: 'Item cards', quantity: 21 },
    { label: 'Action markers', quantity: 8 },
    { label: 'Victory markers', quantity: 7 }
  ];
  
  let contentParsingPassed = true;
  for (const exp of expectedComponents) {
    const found = components.find(c => 
      c.name.toLowerCase().includes(exp.label.split(' ')[0].toLowerCase()) && 
      c.count === exp.quantity
    );
    
    if (!found) {
      console.log(`❌ ${exp.label} — not found or incorrect quantity`);
      contentParsingPassed = false;
    }
  }
  
  // Test image harvesting
  console.log('\n🖼️  IMAGE HARVESTING TEST:');
  try {
    const results = await harvestImagesFromExtraUrls(testCase.urls, { 
      base: '', 
      labels: testCase.labels, 
      verbose: true 
    });
    
    console.log(`\n📊 IMAGE HARVESTING RESULTS:`);
    console.log(`Found images from ${results.length} URLs`);
    
    let totalImages = 0;
    let heroImages = 0;
    let labeledImages = 0;
    
    for (const result of results) {
      console.log(`\n🌐 ${result.url}:`);
      console.log(`   Total unique images: ${result.images.all.length}`);
      totalImages += result.images.all.length;
      
      // Count hero images
      if (result.images.byLabel["hero"]) {
        heroImages += result.images.byLabel["hero"].length;
        console.log(`   Hero images: ${result.images.byLabel["hero"].length}`);
      }
      
      // Count labeled images
      for (const [label, images] of Object.entries(result.images.byLabel)) {
        if (label !== "hero" && images.length > 0) {
          labeledImages += images.length;
          console.log(`   ${label}: ${images.length} images`);
        }
      }
    }
    
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total images: ${totalImages}`);
    console.log(`   Hero images: ${heroImages}`);
    console.log(`   Labeled images: ${labeledImages}`);
    
    // Determine if image harvesting passed (at least some images found)
    const imageHarvestingPassed = totalImages > 0;
    
    // Overall test result
    console.log('\n' + '='.repeat(60));
    console.log('🏁 FINAL RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`📄 Content Parsing: ${contentParsingPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🖼️  Image Harvesting: ${imageHarvestingPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`📊 Overall: ${contentParsingPassed && imageHarvestingPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    return {
      contentParsing: contentParsingPassed,
      imageHarvesting: imageHarvestingPassed,
      overall: contentParsingPassed && imageHarvestingPassed
    };
    
  } catch (error) {
    console.error('❌ Error during image harvest:', error.message);
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 FINAL RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`📄 Content Parsing: ${contentParsingPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🖼️  Image Harvesting: ❌ FAILED (Error: ${error.message})`);
    console.log(`📊 Overall: ❌ SOME TESTS FAILED`);
    
    return {
      contentParsing: contentParsingPassed,
      imageHarvesting: false,
      overall: false
    };
  }
}

// Run the test
testCombinedHarvestingAndParsing();