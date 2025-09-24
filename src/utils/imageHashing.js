import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Hash algorithm configuration
const HASH_ALGORITHM = 'perceptual_dhash';
const HASH_BITS = 64;
const HASH_VERSION = '1.0.0'; // our implementation version

/**
 * Calculate simple perceptual hash (dhash) for deterministic results
 * @param {Buffer} imageData - Image buffer
 * @param {number} size - Hash size (8x8 = 64 bits)
 * @returns {string} Hex hash string
 */
function calculatePerceptualHash(imageData, size = 8) {
  const pixels = [];
  
  // Convert image data to grayscale values
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    // Convert to grayscale
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    pixels.push(gray);
  }

  // Calculate difference hash (dhash)
  const hash = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size - 1; col++) {
      const index = row * size + col;
      const nextIndex = row * size + col + 1;
      hash.push(pixels[index] > pixels[nextIndex] ? 1 : 0);
    }
  }

  // Convert binary to hex
  let hexHash = '';
  for (let i = 0; i < hash.length; i += 4) {
    const nibble = hash[i] * 8 + hash[i + 1] * 4 + hash[i + 2] * 2 + hash[i + 3];
    hexHash += nibble.toString(16);
  }

  return hexHash.padEnd(16, '0'); // Ensure 16 characters for 64 bits
}

/**
 * Calculate deterministic image hash with metadata
 * @param {string|Buffer} imageInput - Path to image or image buffer
 * @returns {Promise<Object>} Hash result with metadata
 */
export async function calculateImageHash(imageInput) {
  try {
    let imageBuffer;
    
    // Handle both file path and buffer input
    if (typeof imageInput === 'string') {
      imageBuffer = await sharp(imageInput).png().toBuffer();
    } else if (Buffer.isBuffer(imageInput)) {
      imageBuffer = await sharp(imageInput).png().toBuffer();
    } else {
      throw new Error('Invalid image input: must be file path or buffer');
    }

    // Get image metadata for processing stats
    const metadata = await sharp(imageBuffer).metadata();
    
    // Resize to 8x8 for consistent hashing and get raw pixel data
    const { data, info } = await sharp(imageBuffer)
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate perceptual hash
    const hashHex = calculatePerceptualHash(data);
    
    // Convert to different formats for storage
    const hashBuffer = Buffer.from(hashHex, 'hex');
    const hashBase64 = hashBuffer.toString('base64');
    const hashRaw = parseInt(hashHex, 16);
    
    return {
      hash: {
        raw: hashRaw,
        hex: hashHex,
        base64: hashBase64
      },
      metadata: {
        algorithm: HASH_ALGORITHM,
        version: HASH_VERSION,
        bits: HASH_BITS,
        imageWidth: metadata.width,
        imageHeight: metadata.height,
        channels: metadata.channels,
        format: metadata.format
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to calculate image hash: ${error.message}`);
  }
}

/**
 * Calculate Hamming distance between two hashes
 * @param {string|number} hash1 - First hash (hex string or number)
 * @param {string|number} hash2 - Second hash (hex string or number)
 * @returns {number} Hamming distance
 */
export function calculateHammingDistance(hash1, hash2) {
  try {
    // Convert to numbers if needed
    const h1 = typeof hash1 === 'string' ? parseInt(hash1, 16) : hash1;
    const h2 = typeof hash2 === 'string' ? parseInt(hash2, 16) : hash2;
    
    // XOR and count bits
    let xor = h1 ^ h2;
    let distance = 0;
    
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
    
    return distance;
  } catch (error) {
    throw new Error(`Failed to calculate Hamming distance: ${error.message}`);
  }
}

/**
 * Calculate confidence score based on Hamming distance
 * Formula: confidence = 1 - (hamming_distance / bit_length)
 * @param {number} hammingDistance - Hamming distance between hashes
 * @param {number} bitLength - Number of bits in hash (default: 64)
 * @returns {number} Confidence score between 0 and 1
 */
export function calculateConfidence(hammingDistance, bitLength = HASH_BITS) {
  if (hammingDistance < 0 || hammingDistance > bitLength) {
    throw new Error(`Invalid Hamming distance: ${hammingDistance} (max: ${bitLength})`);
  }
  
  return 1 - (hammingDistance / bitLength);
}

/**
 * Get maximum Hamming distance for a confidence threshold
 * @param {number} confidenceThreshold - Confidence threshold (0-1)
 * @param {number} bitLength - Number of bits in hash (default: 64)
 * @returns {number} Maximum Hamming distance
 */
export function getMaxHammingDistance(confidenceThreshold, bitLength = HASH_BITS) {
  if (confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error(`Invalid confidence threshold: ${confidenceThreshold} (must be 0-1)`);
  }
  
  return Math.floor((1 - confidenceThreshold) * bitLength);
}

/**
 * Check if two images are similar based on confidence threshold
 * @param {string|number} hash1 - First image hash
 * @param {string|number} hash2 - Second image hash
 * @param {number} confidenceThreshold - Minimum confidence threshold (default: 0.90)
 * @returns {Object} Similarity result with confidence and threshold info
 */
export function checkImageSimilarity(hash1, hash2, confidenceThreshold = 0.90) {
  const hammingDistance = calculateHammingDistance(hash1, hash2);
  const confidence = calculateConfidence(hammingDistance);
  const maxHammingForThreshold = getMaxHammingDistance(confidenceThreshold);
  
  return {
    similar: confidence >= confidenceThreshold,
    confidence,
    hammingDistance,
    threshold: {
      confidence: confidenceThreshold,
      maxHamming: maxHammingForThreshold
    },
    metadata: {
      algorithm: HASH_ALGORITHM,
      bits: HASH_BITS,
      version: HASH_VERSION
    }
  };
}

/**
 * Generate comprehensive extraction statistics
 * @param {Array} images - Array of processed images with hashes
 * @param {string} extractionMethod - Method used for extraction
 * @returns {Object} Detailed extraction statistics
 */
export function generateExtractionStats(images, extractionMethod) {
  const stats = {
    totalImages: images.length,
    extractionMethod,
    processingSteps: [],
    hashMetadata: {
      algorithm: HASH_ALGORITHM,
      version: HASH_VERSION,
      bits: HASH_BITS
    },
    imageFormats: {},
    averageConfidence: 0,
    duplicates: 0,
    timestamp: new Date().toISOString()
  };

  // Count formats and calculate average confidence
  let totalConfidence = 0;
  let duplicateCount = 0;
  const hashSet = new Set();

  images.forEach(image => {
    // Track image formats
    if (image.metadata && image.metadata.format) {
      stats.imageFormats[image.metadata.format] = 
        (stats.imageFormats[image.metadata.format] || 0) + 1;
    }

    // Track confidence if available
    if (image.confidence !== undefined) {
      totalConfidence += image.confidence;
    }

    // Check for duplicates using hash
    if (image.hash && image.hash.hex) {
      if (hashSet.has(image.hash.hex)) {
        duplicateCount++;
      } else {
        hashSet.add(image.hash.hex);
      }
    }
  });

  stats.averageConfidence = images.length > 0 ? 
    Math.round((totalConfidence / images.length) * 100) / 100 : 0;
  stats.duplicates = duplicateCount;

  return stats;
}

/**
 * Configuration constants for easy access
 */
export const HASH_CONFIG = {
  ALGORITHM: HASH_ALGORITHM,
  VERSION: HASH_VERSION,
  BITS: HASH_BITS,
  DEFAULT_CONFIDENCE_THRESHOLD: 0.90
};