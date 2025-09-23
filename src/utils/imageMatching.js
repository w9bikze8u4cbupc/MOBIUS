/**
 * Image Matching Utilities
 * Computes pHash, hamming similarity, and provides library matching functionality
 */

const imageHash = require('image-hash');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Compute pHash for an image
 */
async function computeImageHash(imagePath, hashBits = 16) {
  return new Promise((resolve, reject) => {
    imageHash.imageHash(imagePath, hashBits, true, (err, data) => {
      if (err) {
        reject(new Error(`Failed to compute hash for ${imagePath}: ${err.message}`));
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Compute hamming distance between two hashes
 */
function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must be equal');
  }
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Calculate similarity score from hamming distance (0-1 scale, 1 = identical)
 */
function calculateSimilarity(hash1, hash2) {
  const distance = hammingDistance(hash1, hash2);
  const maxDistance = hash1.length; // Maximum possible distance
  return 1 - (distance / maxDistance);
}

/**
 * Enhanced image matching with multiple algorithms
 */
async function matchImageToLibrary(imageData, libraryItems, options = {}) {
  const {
    autoAssignThreshold = 0.90,
    useEmbedding = false,
    phashWeight = 1.0,
    embeddingWeight = 0.0,
    returnTopN = 5
  } = options;
  
  if (!imageData.phash && !imageData.masterPath && !imageData.path) {
    throw new Error('Image data must include either phash or a path to compute hash');
  }
  
  let targetHash = imageData.phash;
  
  // Compute hash if not provided
  if (!targetHash) {
    const imagePath = imageData.masterPath || imageData.path || imageData.processed_path;
    if (!imagePath || !fs.existsSync(imagePath)) {
      throw new Error(`Image path not found: ${imagePath}`);
    }
    targetHash = await computeImageHash(imagePath);
  }
  
  const matches = [];
  
  // Calculate similarity with each library item
  for (const item of libraryItems) {
    if (!item.phash) {
      console.warn(`Library item ${item.id} missing phash, skipping`);
      continue;
    }
    
    try {
      const phashSimilarity = calculateSimilarity(targetHash, item.phash);
      let totalScore = phashSimilarity * phashWeight;
      
      // Placeholder for embedding similarity (would require actual embedding service)
      let embeddingSimilarity = 0;
      if (useEmbedding && item.embedding && imageData.embedding) {
        // In a real implementation, you would compute cosine similarity between embeddings
        embeddingSimilarity = 0; // Placeholder
        totalScore = (phashSimilarity * phashWeight) + (embeddingSimilarity * embeddingWeight);
        totalScore = totalScore / (phashWeight + embeddingWeight); // Normalize
      }
      
      matches.push({
        item: item,
        phash_similarity: phashSimilarity,
        embedding_similarity: embeddingSimilarity,
        total_score: totalScore,
        hamming_distance: hammingDistance(targetHash, item.phash)
      });
    } catch (error) {
      console.warn(`Error matching against ${item.id}: ${error.message}`);
    }
  }
  
  // Sort by total score (highest first)
  matches.sort((a, b) => b.total_score - a.total_score);
  
  // Determine the best match
  const topMatch = matches[0];
  const autoAssign = topMatch && topMatch.total_score >= autoAssignThreshold;
  
  return {
    target_image: imageData.filename || imageData.basename || 'unknown',
    target_hash: targetHash,
    matches: matches.slice(0, returnTopN),
    chosen: autoAssign ? topMatch.item : null,
    confidence: topMatch ? topMatch.total_score : 0,
    auto_assigned: autoAssign,
    threshold_used: autoAssignThreshold,
    total_library_items: libraryItems.length,
    algorithm_weights: {
      phash: phashWeight,
      embedding: embeddingWeight
    }
  };
}

/**
 * Batch process multiple images against a library
 */
async function batchMatchImages(imageDataArray, libraryItems, options = {}) {
  console.log(`Matching ${imageDataArray.length} images against library of ${libraryItems.length} items...`);
  
  const results = [];
  
  for (let i = 0; i < imageDataArray.length; i++) {
    const imageData = imageDataArray[i];
    console.log(`Matching ${i + 1}/${imageDataArray.length}: ${imageData.filename || imageData.basename}`);
    
    try {
      const result = await matchImageToLibrary(imageData, libraryItems, options);
      results.push(result);
      
      if (result.auto_assigned) {
        console.log(`  ✓ Auto-assigned: ${result.chosen.title} (confidence: ${result.confidence.toFixed(3)})`);
      } else {
        console.log(`  ? No auto-assignment (best: ${result.matches[0]?.item?.title || 'none'}, confidence: ${result.confidence.toFixed(3)})`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      results.push({
        target_image: imageData.filename || imageData.basename || 'unknown',
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
}

/**
 * Create a library from a directory of images
 */
async function buildLibraryFromDirectory(directoryPath, outputPath = null) {
  if (!fs.existsSync(directoryPath)) {
    throw new Error(`Directory not found: ${directoryPath}`);
  }
  
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
  const files = fs.readdirSync(directoryPath)
    .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()));
  
  console.log(`Building library from ${files.length} images in ${directoryPath}...`);
  
  const libraryItems = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(directoryPath, file);
    const basename = path.basename(file, path.extname(file));
    
    console.log(`Processing ${i + 1}/${files.length}: ${file}`);
    
    try {
      const hash = await computeImageHash(filePath);
      const metadata = await sharp(filePath).metadata();
      
      libraryItems.push({
        id: `lib-${basename}`,
        title: basename.replace(/[_-]/g, ' '), // Clean up title
        filename: file,
        path: filePath,
        phash: hash,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        created: new Date().toISOString()
      });
      
    } catch (error) {
      console.warn(`Failed to process ${file}: ${error.message}`);
    }
  }
  
  const library = {
    created: new Date().toISOString(),
    source_directory: directoryPath,
    total_items: libraryItems.length,
    items: libraryItems
  };
  
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(library, null, 2));
    console.log(`Library saved to: ${outputPath}`);
  }
  
  return library;
}

/**
 * Load library from JSON file
 */
function loadLibrary(libraryPath) {
  if (!fs.existsSync(libraryPath)) {
    throw new Error(`Library file not found: ${libraryPath}`);
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
    return data.items || data; // Handle both wrapped and unwrapped formats
  } catch (error) {
    throw new Error(`Failed to parse library file ${libraryPath}: ${error.message}`);
  }
}

/**
 * Add computed hashes to image metadata array
 */
async function addHashesToImageData(imageDataArray) {
  console.log(`Computing hashes for ${imageDataArray.length} images...`);
  
  const results = [];
  
  for (let i = 0; i < imageDataArray.length; i++) {
    const imageData = { ...imageDataArray[i] };
    
    try {
      const imagePath = imageData.masterPath || imageData.processed_path || imageData.path;
      if (imagePath && fs.existsSync(imagePath)) {
        imageData.phash = await computeImageHash(imagePath);
        console.log(`  ✓ Hash computed for: ${imageData.filename}`);
      } else {
        console.warn(`  ⚠ No valid path found for: ${imageData.filename}`);
      }
    } catch (error) {
      console.warn(`  ✗ Failed to hash: ${imageData.filename} - ${error.message}`);
    }
    
    results.push(imageData);
  }
  
  return results;
}

module.exports = {
  computeImageHash,
  hammingDistance,
  calculateSimilarity,
  matchImageToLibrary,
  batchMatchImages,
  buildLibraryFromDirectory,
  loadLibrary,
  addHashesToImageData
};