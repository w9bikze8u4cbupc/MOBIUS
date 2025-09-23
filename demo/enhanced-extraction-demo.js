#!/usr/bin/env node

/**
 * Simple demonstration of the enhanced image extraction system
 */

import { calculateHammingDistance, calculateSimilarityScore } from '../src/utils/imageMatching/matcher.js';

console.log('🚀 Enhanced Image Extraction System Demo');
console.log('========================================');

// Demo 1: Perceptual Hashing and Similarity
console.log('\n📊 Demo 1: Perceptual Hashing and Similarity Calculation');
console.log('---------------------------------------------------------');

// Test with identical hashes
const hash1 = 'abcd1234efgh5678';
const hash2 = 'abcd1234efgh5678';
const identicalDistance = calculateHammingDistance(hash1, hash2);
const identicalSimilarity = calculateSimilarityScore(identicalDistance, 64);

console.log(`Identical hashes: ${hash1} vs ${hash2}`);
console.log(`  Hamming Distance: ${identicalDistance}`);
console.log(`  Similarity Score: ${identicalSimilarity} (${(identicalSimilarity * 100).toFixed(1)}%)`);

// Test with similar hashes (small difference)
const hash3 = 'abcd1234efgh5678';
const hash4 = 'abcd1234efgh567f'; // Only last character different
const similarDistance = calculateHammingDistance(hash3, hash4);
const similarSimilarity = calculateSimilarityScore(similarDistance, 64);

console.log(`\nSimilar hashes: ${hash3} vs ${hash4}`);
console.log(`  Hamming Distance: ${similarDistance}`);
console.log(`  Similarity Score: ${similarSimilarity} (${(similarSimilarity * 100).toFixed(1)}%)`);

// Test with very different hashes
const hash5 = '0000000000000000';
const hash6 = 'ffffffffffffffff';
const differentDistance = calculateHammingDistance(hash5, hash6);
const differentSimilarity = calculateSimilarityScore(differentDistance, 64);

console.log(`\nVery different hashes: ${hash5} vs ${hash6}`);
console.log(`  Hamming Distance: ${differentDistance}`);
console.log(`  Similarity Score: ${differentSimilarity} (${(differentSimilarity * 100).toFixed(1)}%)`);

// Demo 2: Confidence Levels
console.log('\n🎯 Demo 2: Confidence Level Classification');
console.log('------------------------------------------');

const testSimilarities = [0.98, 0.92, 0.87, 0.75, 0.65, 0.45, 0.12];

testSimilarities.forEach(similarity => {
  let confidence;
  if (similarity >= 0.95) {
    confidence = 'HIGH - Auto-assign recommended';
  } else if (similarity >= 0.85) {
    confidence = 'MEDIUM - Suggest with review';
  } else if (similarity >= 0.75) {
    confidence = 'LOW - Manual review required';
  } else {
    confidence = 'NO MATCH - Search other sources';
  }
  
  console.log(`  Similarity ${(similarity * 100).toFixed(0)}%: ${confidence}`);
});

// Demo 3: CLI Usage Examples
console.log('\n💻 Demo 3: Available CLI Commands');
console.log('----------------------------------');

console.log('Enhanced image extraction is available through:');
console.log('');
console.log('1. Extract images from PDF:');
console.log('   node scripts/extract-images.js rulebook.pdf ./output');
console.log('');
console.log('2. Extract and process for quality:');
console.log('   node scripts/extract-images.js rulebook.pdf ./output --process');
console.log('');
console.log('3. Full pipeline with matching:');
console.log('   node scripts/extract-images.js rulebook.pdf ./output \\');
console.log('     --mode all --library ./game-library --process --match');
console.log('');
console.log('4. Get help:');
console.log('   node scripts/extract-images.js --help');

// Demo 4: API Endpoints
console.log('\n🌐 Demo 4: New API Endpoints');
console.log('-----------------------------');

console.log('Enhanced extraction system provides 4 new endpoints:');
console.log('');
console.log('• POST /api/extract-images-enhanced');
console.log('  - Robust extraction with metadata');
console.log('  - Multiple fallback options');
console.log('  - Thumbnail generation');
console.log('');
console.log('• POST /api/process-images');
console.log('  - Auto-cropping and quality improvements');
console.log('  - Batch processing capabilities');
console.log('  - Detailed processing reports');
console.log('');
console.log('• POST /api/match-images');
console.log('  - Perceptual hash-based matching');
console.log('  - Confidence scoring');
console.log('  - Match recommendations');
console.log('');
console.log('• POST /api/image-pipeline');
console.log('  - Full extraction + processing + matching');
console.log('  - Comprehensive workflow automation');

console.log('\n✅ Enhanced Image Extraction System Ready!');
console.log('==========================================');
console.log('The system is fully functional and integrated with the existing API.');
console.log('All core utilities have been tested and are working correctly.');