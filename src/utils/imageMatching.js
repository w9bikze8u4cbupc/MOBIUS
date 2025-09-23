const { imageHash } = require('image-hash');
const fs = require('fs');

/**
 * Perceptual Matching System
 * 
 * Implements pHash (perceptual hashing) for image similarity detection.
 * Calculates Hamming distance for robust comparison.
 * Supports optional CLIP embedding service integration.
 */

/**
 * Calculate perceptual hash (pHash) for an image
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} Hex-encoded perceptual hash
 */
async function calculatePerceptualHash(imagePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(imagePath)) {
      reject(new Error(`Image not found: ${imagePath}`));
      return;
    }

    imageHash(imagePath, 16, true, (error, data) => {
      if (error) {
        reject(new Error(`Failed to calculate hash for ${imagePath}: ${error.message}`));
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Calculate Hamming distance between two perceptual hashes
 * @param {string} hash1 - First hash (hex string)
 * @param {string} hash2 - Second hash (hex string)  
 * @returns {number} Hamming distance (0-64 for 16-bit hashes)
 */
function calculateHammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    throw new Error('Invalid hashes provided for comparison');
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
 * Calculate similarity percentage between two images
 * @param {string} hash1 - First perceptual hash
 * @param {string} hash2 - Second perceptual hash
 * @returns {number} Similarity percentage (0-100)
 */
function calculateSimilarity(hash1, hash2) {
  const maxDistance = hash1.length; // For hex strings, each character can differ
  const distance = calculateHammingDistance(hash1, hash2);
  const similarity = ((maxDistance - distance) / maxDistance) * 100;
  return Math.max(0, Math.min(100, similarity));
}

/**
 * Compare an image against a library of images
 * @param {string} queryImagePath - Path to query image
 * @param {Array<Object>} library - Array of library images with metadata
 * @param {number} threshold - Minimum confidence threshold (default: 90)
 * @returns {Promise<Object>} Best match result
 */
async function matchImageToLibrary(queryImagePath, library, threshold = 90) {
  if (!library || library.length === 0) {
    return {
      success: false,
      message: 'No library images provided',
      allMatches: [],
      matches: []
    };
  }

  try {
    // Calculate hash for query image
    const queryHash = await calculatePerceptualHash(queryImagePath);
    
    // Compare against all library images
    const matches = [];
    for (const libImage of library) {
      if (!libImage.perceptualHash) {
        console.warn(`Library image ${libImage.id || libImage.path} missing perceptual hash`);
        continue;
      }

      const similarity = calculateSimilarity(queryHash, libImage.perceptualHash);
      matches.push({
        libraryImage: libImage,
        similarity,
        confidence: similarity,
        queryHash,
        libraryHash: libImage.perceptualHash
      });
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    // Find best match above threshold
    const bestMatch = matches.length > 0 ? matches[0] : null;
    const hasGoodMatch = Boolean(bestMatch && bestMatch.confidence >= threshold);

    return {
      success: hasGoodMatch,
      queryHash,
      bestMatch: hasGoodMatch ? bestMatch : null,
      allMatches: matches,
      threshold,
      message: hasGoodMatch 
        ? `Found match with ${bestMatch.confidence.toFixed(1)}% confidence`
        : `No matches above ${threshold}% threshold. Best: ${bestMatch ? bestMatch.confidence.toFixed(1) : 'N/A'}%`
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
      allMatches: [],
      matches: []
    };
  }
}

/**
 * Batch calculate perceptual hashes for multiple images
 * @param {Array<string>} imagePaths - Array of image paths
 * @returns {Promise<Array<Object>>} Array of hash results
 */
async function batchCalculateHashes(imagePaths) {
  const results = [];
  
  console.log(`Calculating perceptual hashes for ${imagePaths.length} images...`);
  
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    
    try {
      console.log(`[${i + 1}/${imagePaths.length}] ${imagePath}...`);
      const hash = await calculatePerceptualHash(imagePath);
      results.push({
        path: imagePath,
        hash,
        success: true
      });
    } catch (err) {
      console.error(`[${i + 1}/${imagePaths.length}] Failed: ${err.message}`);
      results.push({
        path: imagePath,
        hash: null,
        success: false,
        error: err.message
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Successfully calculated hashes for ${successCount}/${imagePaths.length} images`);
  
  return results;
}

/**
 * Create a searchable library from processed images
 * @param {Array<Object>} images - Array of processed image metadata
 * @returns {Array<Object>} Searchable library
 */
function createLibrary(images) {
  return images.map((img, index) => ({
    id: img.id || `image_${index + 1}`,
    path: img.masterPath || img.path,
    webPath: img.webPath,
    thumbnailPath: img.thumbnailPath,
    perceptualHash: img.perceptualHash,
    width: img.width,
    height: img.height,
    format: img.format,
    type: img.type, // Preserve type field
    metadata: {
      size: img.size,
      density: img.density,
      extractedAt: img.extractedAt
    },
    // Preserve any additional fields
    ...img
  }));
}

/**
 * Find duplicate images in a collection
 * @param {Array<Object>} images - Array of images with perceptual hashes
 * @param {number} threshold - Similarity threshold for duplicates (default: 95)
 * @returns {Array<Object>} Groups of duplicate images
 */
function findDuplicates(images, threshold = 95) {
  const duplicateGroups = [];
  const processed = new Set();

  for (let i = 0; i < images.length; i++) {
    if (processed.has(i) || !images[i].perceptualHash) continue;

    const group = [images[i]];
    processed.add(i);

    for (let j = i + 1; j < images.length; j++) {
      if (processed.has(j) || !images[j].perceptualHash) continue;

      const similarity = calculateSimilarity(
        images[i].perceptualHash, 
        images[j].perceptualHash
      );

      if (similarity >= threshold) {
        group.push(images[j]);
        processed.add(j);
      }
    }

    if (group.length > 1) {
      duplicateGroups.push({
        count: group.length,
        similarity: group.length > 2 ? 'multiple' : calculateSimilarity(
          group[0].perceptualHash, 
          group[1].perceptualHash
        ).toFixed(1) + '%',
        images: group
      });
    }
  }

  return duplicateGroups;
}

/**
 * Optional CLIP embedding integration (placeholder for future enhancement)
 * @param {string} imagePath - Path to image
 * @param {string} embeddingServiceUrl - URL to CLIP embedding service
 * @returns {Promise<Array<number>|null>} Embedding vector or null if unavailable
 */
async function calculateCLIPEmbedding(imagePath, embeddingServiceUrl) {
  if (!embeddingServiceUrl) {
    return null; // CLIP service not configured
  }

  try {
    const fetch = require('node-fetch');
    const formData = require('form-data');
    const form = new formData();
    
    form.append('image', fs.createReadStream(imagePath));
    
    const response = await fetch(`${embeddingServiceUrl}/embed`, {
      method: 'POST',
      body: form
    });
    
    if (!response.ok) {
      throw new Error(`CLIP service error: ${response.status}`);
    }
    
    const result = await response.json();
    return result.embedding;
    
  } catch (err) {
    console.warn(`CLIP embedding failed for ${imagePath}:`, err.message);
    return null;
  }
}

/**
 * Combine pHash and CLIP embedding scores for weighted matching
 * @param {number} pHashSimilarity - pHash similarity (0-100)
 * @param {number} clipSimilarity - CLIP cosine similarity (0-100)
 * @param {number} pHashWeight - Weight for pHash score (default: 0.7)
 * @returns {number} Combined weighted score
 */
function combineMatchingScores(pHashSimilarity, clipSimilarity, pHashWeight = 0.7) {
  if (clipSimilarity === null || clipSimilarity === undefined) {
    return pHashSimilarity; // Fall back to pHash only
  }
  
  const clipWeight = 1.0 - pHashWeight;
  return (pHashSimilarity * pHashWeight) + (clipSimilarity * clipWeight);
}

module.exports = {
  calculatePerceptualHash,
  calculateHammingDistance,
  calculateSimilarity,
  matchImageToLibrary,
  batchCalculateHashes,
  createLibrary,
  findDuplicates,
  calculateCLIPEmbedding,
  combineMatchingScores
};