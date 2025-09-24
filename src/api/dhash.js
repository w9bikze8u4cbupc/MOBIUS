/**
 * Deterministic DHash (Difference Hash) Implementation - CommonJS Version
 * Production-ready dhash with full metadata support
 */

const sharp = require('sharp');
const crypto = require('crypto');

// Version and configuration constants
const DHASH_VERSION = '1.0.0';
const DHASH_ALGORITHM = 'perceptual_dhash';
const DHASH_BITS = 64;

/**
 * Calculate deterministic dhash for an image
 * @param {string|Buffer} imageInput - Path to image file or image buffer
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Hash result with metadata
 */
async function calculateDHash(imageInput, options = {}) {
  const {
    size = 9, // 9x8 for 64-bit hash
    bits = DHASH_BITS
  } = options;

  try {
    // Load and process image with Sharp
    let image = sharp(imageInput);
    
    // Get image metadata for validation
    const metadata = await image.metadata();
    
    // Convert to grayscale and resize to (size)x(size-1) for difference calculation
    const { data, info } = await image
      .grayscale()
      .resize(size, size - 1, { 
        fit: 'fill',
        kernel: sharp.kernel.lanczos3 // Deterministic kernel for consistent results
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate horizontal differences to create hash
    let hash = 0n; // Use BigInt for 64-bit precision
    let bitPosition = 0;

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const leftPixel = data[y * size + x];
        const rightPixel = data[y * size + x + 1];
        
        if (leftPixel > rightPixel) {
          hash |= 1n << BigInt(bitPosition);
        }
        bitPosition++;
      }
    }

    // Convert to hex string (deterministic)
    const hexHash = hash.toString(16).padStart(16, '0');
    
    // Generate base64 encoding for alternative storage
    const base64Hash = Buffer.from(hexHash, 'hex').toString('base64');

    // Create timestamp for metadata
    const timestamp = new Date().toISOString();

    return {
      hash: hexHash,
      hash_base64: base64Hash,
      hash_alg: DHASH_ALGORITHM,
      version: DHASH_VERSION,
      bits: bits,
      node_module_version: process.version,
      timestamp,
      metadata: {
        original_width: metadata.width,
        original_height: metadata.height,
        original_format: metadata.format,
        channels: metadata.channels,
        processing_size: `${size}x${size-1}`
      }
    };
  } catch (error) {
    throw new Error(`DHash calculation failed: ${error.message}`);
  }
}

/**
 * Calculate Hamming distance between two dhash values
 * @param {string} hash1 - First hash (hex string)
 * @param {string} hash2 - Second hash (hex string)
 * @returns {number} Hamming distance (0-64 for 64-bit hashes)
 */
function calculateHammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) {
    throw new Error('Both hashes must be provided');
  }

  // Convert hex strings to BigInt for XOR operation
  const bigInt1 = BigInt('0x' + hash1);
  const bigInt2 = BigInt('0x' + hash2);
  
  // XOR to find different bits
  const xor = bigInt1 ^ bigInt2;
  
  // Count set bits (Hamming distance)
  let distance = 0;
  let temp = xor;
  while (temp > 0n) {
    distance += Number(temp & 1n);
    temp >>= 1n;
  }
  
  return distance;
}

/**
 * Convert confidence percentage to maximum hamming distance
 * Formula: max_hamming = ⌊(1−confidence) × bit_length⌋
 * @param {number} confidence - Confidence threshold (0.0 to 1.0)
 * @param {number} bitLength - Hash bit length (default 64)
 * @returns {number} Maximum hamming distance for the confidence level
 */
function confidenceToMaxHamming(confidence, bitLength = DHASH_BITS) {
  if (confidence < 0 || confidence > 1) {
    throw new Error('Confidence must be between 0.0 and 1.0');
  }
  
  return Math.floor((1 - confidence) * bitLength);
}

/**
 * Convert hamming distance to confidence percentage
 * @param {number} hammingDistance - Hamming distance
 * @param {number} bitLength - Hash bit length (default 64)
 * @returns {number} Confidence level (0.0 to 1.0)
 */
function hammingToConfidence(hammingDistance, bitLength = DHASH_BITS) {
  if (hammingDistance < 0 || hammingDistance > bitLength) {
    throw new Error(`Hamming distance must be between 0 and ${bitLength}`);
  }
  
  return 1 - (hammingDistance / bitLength);
}

/**
 * Check if two hashes match within a confidence threshold
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @param {number} confidence - Minimum confidence (0.0 to 1.0)
 * @param {number} bitLength - Hash bit length
 * @returns {Object} Match result with confidence and distance
 */
function matchHashes(hash1, hash2, confidence = 0.9, bitLength = DHASH_BITS) {
  const hammingDistance = calculateHammingDistance(hash1, hash2);
  const maxDistance = confidenceToMaxHamming(confidence, bitLength);
  const actualConfidence = hammingToConfidence(hammingDistance, bitLength);
  
  return {
    match: hammingDistance <= maxDistance,
    hamming_distance: hammingDistance,
    confidence: actualConfidence,
    threshold_confidence: confidence,
    max_distance: maxDistance
  };
}

/**
 * Batch process multiple images and return their dhashes
 * @param {string[]} imagePaths - Array of image paths
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of hash results
 */
async function batchCalculateDHash(imagePaths, options = {}) {
  const results = [];
  
  for (const imagePath of imagePaths) {
    try {
      const result = await calculateDHash(imagePath, options);
      results.push({
        path: imagePath,
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        path: imagePath,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Validate dhash metadata structure
 * @param {Object} hashData - Hash data object to validate
 * @returns {boolean} True if valid
 */
function validateHashMetadata(hashData) {
  const required = ['hash', 'hash_alg', 'version', 'bits', 'node_module_version'];
  return required.every(field => hashData.hasOwnProperty(field));
}

module.exports = {
  calculateDHash,
  calculateHammingDistance,
  confidenceToMaxHamming,
  hammingToConfidence,
  matchHashes,
  batchCalculateDHash,
  validateHashMetadata,
  DHASH_VERSION,
  DHASH_ALGORITHM,
  DHASH_BITS
};