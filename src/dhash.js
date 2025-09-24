const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * DHash (Difference Hash) implementation for image similarity detection
 * Production-ready image processing pipeline for MOBIUS project
 */

class DHashProcessor {
  constructor(options = {}) {
    this.options = {
      hashSize: 8, // 8x8 grid produces 64-bit hash
      grayscale: true,
      resizeMethod: 'bicubic',
      tempDir: options.tempDir || '/tmp',
      ...options
    };
  }

  /**
   * Generate DHash from image file
   * @param {string} imagePath - Path to input image
   * @returns {string} - 64-bit hex hash
   */
  generateHash(imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const tempPng = path.join(this.options.tempDir, `dhash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`);
    
    try {
      // Resize to (hashSize+1) x hashSize using FFmpeg for consistency across platforms
      const ffmpegArgs = [
        '-hide_banner', '-loglevel', 'error',
        '-i', imagePath,
        '-vf', `scale=${this.options.hashSize + 1}:${this.options.hashSize}:flags=${this.options.resizeMethod},format=gray`,
        '-y', tempPng
      ];

      const result = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(`FFmpeg failed: ${result.stderr || result.error}`);
      }

      // Extract pixel values and compute difference hash
      const hash = this._computeDHashFromPixels(tempPng);
      return hash;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempPng)) {
        fs.unlinkSync(tempPng);
      }
    }
  }

  /**
   * Compare two DHash values and return Hamming distance
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @returns {number} - Hamming distance (0 = identical, 64 = completely different)
   */
  compareHashes(hash1, hash2) {
    if (hash1.length !== hash2.length || hash1.length !== 16) {
      throw new Error('Invalid hash format - expected 16 hex characters');
    }

    const int1 = BigInt('0x' + hash1);
    const int2 = BigInt('0x' + hash2);
    const xor = int1 ^ int2;
    
    // Count set bits (Hamming distance)
    let distance = 0;
    let temp = xor;
    while (temp > 0n) {
      distance += Number(temp & 1n);
      temp = temp >> 1n;
    }
    return distance;
  }

  /**
   * Determine if two images are similar based on hash comparison
   * @param {string} hash1 
   * @param {string} hash2 
   * @param {number} threshold - Maximum Hamming distance for similarity (default: 10)
   * @returns {boolean}
   */
  areSimilar(hash1, hash2, threshold = 10) {
    const distance = this.compareHashes(hash1, hash2);
    return distance <= threshold;
  }

  /**
   * Extract pixel data and compute difference hash
   * @private
   */
  _computeDHashFromPixels(imagePath) {
    // Use FFprobe to extract pixel values
    const ffprobeArgs = [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', `movie=${imagePath}:s=${this.options.hashSize + 1}x${this.options.hashSize}[out0]`,
      '-vframes', '1',
      '-f', 'rawvideo',
      '-pix_fmt', 'gray',
      '-'
    ];

    const result = spawnSync('ffmpeg', ffprobeArgs, { encoding: null });
    if (result.status !== 0) {
      throw new Error(`Failed to extract pixel data: ${result.stderr}`);
    }

    const pixels = result.stdout;
    if (pixels.length !== (this.options.hashSize + 1) * this.options.hashSize) {
      throw new Error(`Unexpected pixel data length: ${pixels.length}`);
    }

    // Compute difference hash
    let hash = 0n;
    let bitIndex = 0;

    for (let y = 0; y < this.options.hashSize; y++) {
      for (let x = 0; x < this.options.hashSize; x++) {
        const leftPixel = pixels[y * (this.options.hashSize + 1) + x];
        const rightPixel = pixels[y * (this.options.hashSize + 1) + x + 1];
        
        if (leftPixel < rightPixel) {
          hash |= 1n << BigInt(bitIndex);
        }
        bitIndex++;
      }
    }

    return hash.toString(16).padStart(16, '0').toUpperCase();
  }

  /**
   * Batch process multiple images and generate hashes
   * @param {string[]} imagePaths 
   * @returns {Object[]} - Array of {path, hash, error} objects
   */
  batchProcess(imagePaths) {
    const results = [];
    let processed = 0;
    const total = imagePaths.length;

    console.log(`Processing ${total} images for DHash generation...`);

    for (const imagePath of imagePaths) {
      try {
        const hash = this.generateHash(imagePath);
        results.push({ path: imagePath, hash, error: null });
        processed++;
        
        if (processed % 100 === 0 || processed === total) {
          console.log(`Progress: ${processed}/${total} images processed`);
        }
      } catch (error) {
        results.push({ path: imagePath, hash: null, error: error.message });
        console.warn(`Failed to process ${imagePath}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Generate processing statistics
   * @param {Object[]} results - Results from batchProcess
   * @returns {Object} - Statistics object
   */
  generateStats(results) {
    const successful = results.filter(r => r.hash !== null).length;
    const failed = results.filter(r => r.error !== null).length;
    const errorTypes = {};

    results.forEach(r => {
      if (r.error) {
        const errorType = r.error.split(':')[0];
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      }
    });

    return {
      total: results.length,
      successful,
      failed,
      successRate: successful / results.length,
      errorTypes,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { DHashProcessor };