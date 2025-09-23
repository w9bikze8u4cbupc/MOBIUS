#!/usr/bin/env node

/**
 * Match All Images Script
 * Example script to run matching for all extracted images against a library
 */

const fs = require('fs');
const path = require('path');
const { matchImageToLibrary, addHashesToImageData } = require('../src/utils/imageMatching');

async function run() {
  // Parse command line arguments
  const outDir = process.argv[2] || 'extracted_components';
  const libraryPath = process.argv[3] || 'library.json';
  
  console.log(`Processing images from: ${outDir}`);
  console.log(`Using library: ${libraryPath}`);
  
  // Check that output directory exists
  if (!fs.existsSync(outDir)) {
    console.error(`Output directory not found: ${outDir}`);
    console.error('Run image extraction first: node scripts/extract_images.js input.pdf output_dir');
    process.exit(1);
  }
  
  // Check that library file exists
  if (!fs.existsSync(libraryPath)) {
    console.error(`Library file not found: ${libraryPath}`);
    console.error('Create a library.json file with this format:');
    console.error(`{
  "items": [
    {
      "id": "game-001",
      "title": "Wingspan",
      "phash": "a1b2c3d4e5f6..."
    }
  ]
}`);
    process.exit(1);
  }
  
  // Load image metadata
  const metadataPath = path.join(outDir, 'images.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`Metadata file not found: ${metadataPath}`);
    console.error('Run image extraction first to generate metadata');
    process.exit(1);
  }
  
  try {
    console.log('Loading image metadata...');
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    console.log('Loading library...');
    const libData = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
    const lib = libData.items || libData;
    
    console.log(`Found ${meta.images.length} images and ${lib.length} library items`);
    
    // Add paths for hash computation if needed
    const imagesWithPaths = meta.images.map(img => ({
      ...img,
      masterPath: img.masterPath || path.join(outDir, 'masters', img.filename),
      path: img.masterPath || path.join(outDir, 'masters', img.filename)
    }));
    
    // Add hashes to image data if not already present
    console.log('Computing image hashes...');
    const imagesWithHashes = await addHashesToImageData(imagesWithPaths);
    
    console.log('\nMatching images against library...');
    console.log('='.repeat(50));
    
    const results = [];
    
    // Match each image
    for (const img of imagesWithHashes) {
      try {
        const report = await matchImageToLibrary(img, lib, { 
          autoAssignThreshold: 0.9, 
          useEmbedding: false, 
          phashWeight: 1.0,
          returnTopN: 3
        });
        
        results.push(report);
        
        // Display result
        console.log(`\nIMAGE: ${img.filename}`);
        console.log(`  Size: ${img.width}x${img.height}px`);
        
        if (report.auto_assigned) {
          console.log(`  ✓ AUTO-ASSIGNED: ${report.chosen.title}`);
          console.log(`    Confidence: ${report.confidence.toFixed(3)}`);
        } else {
          console.log(`  ? NO AUTO-ASSIGNMENT`);
          if (report.matches.length > 0) {
            const best = report.matches[0];
            console.log(`    Best match: ${best.item.title} (${best.total_score.toFixed(3)})`);
          } else {
            console.log(`    No matches found`);
          }
        }
        
        // Show top matches
        if (report.matches.length > 0) {
          console.log(`  Top matches:`);
          report.matches.slice(0, 3).forEach((match, i) => {
            const marker = i === 0 ? '→' : ' ';
            console.log(`    ${marker} ${match.item.title}: ${match.total_score.toFixed(3)}`);
          });
        }
        
      } catch (error) {
        console.error(`  ✗ ERROR: ${error.message}`);
        results.push({
          target_image: img.filename,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    
    const successful = results.filter(r => !r.error);
    const autoAssigned = successful.filter(r => r.auto_assigned);
    const needsReview = successful.filter(r => !r.auto_assigned);
    const errors = results.filter(r => r.error);
    
    console.log(`Total images: ${results.length}`);
    console.log(`Auto-assigned: ${autoAssigned.length}`);
    console.log(`Need review: ${needsReview.length}`);
    console.log(`Errors: ${errors.length}`);
    
    if (autoAssigned.length > 0) {
      console.log('\nAuto-assigned:');
      autoAssigned.forEach(r => {
        console.log(`  ${r.target_image} → ${r.chosen.title} (${r.confidence.toFixed(3)})`);
      });
    }
    
    if (needsReview.length > 0) {
      console.log('\nNeed manual review:');
      needsReview.forEach(r => {
        const best = r.matches[0];
        const confidence = best ? best.total_score.toFixed(3) : '0.000';
        const suggestion = best ? best.item.title : 'No matches';
        console.log(`  ${r.target_image} (best: ${suggestion}, ${confidence})`);
      });
    }
    
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(r => {
        console.log(`  ${r.target_image}: ${r.error}`);
      });
    }
    
    // Save detailed results
    const resultsPath = path.join(outDir, 'matching_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      source_directory: outDir,
      library_path: libraryPath,
      total_images: results.length,
      auto_assigned: autoAssigned.length,
      needs_review: needsReview.length,
      errors: errors.length,
      results: results
    }, null, 2));
    
    console.log(`\nDetailed results saved to: ${resultsPath}`);
    
  } catch (error) {
    console.error(`Failed to process images: ${error.message}`);
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Image Matching Script

Usage:
  node scripts/match_all.js [output_dir] [library.json]

Arguments:
  output_dir     Directory containing extracted images (default: extracted_components)
  library.json   Library file with image hashes (default: library.json)

Examples:
  node scripts/match_all.js extracted_components
  node scripts/match_all.js my_images my_library.json

Library Format:
  {
    "items": [
      {
        "id": "game-001",
        "title": "Wingspan", 
        "phash": "hash_string_here"
      }
    ]
  }

This script will:
1. Load extracted image metadata
2. Compute pHash for each image if not already present
3. Match against the library using 90% similarity threshold
4. Display results and save detailed report
`);
  process.exit(0);
}

run().catch(e => { 
  console.error('Fatal error:', e); 
  process.exit(1); 
});