import sharp from 'sharp';
import fs from 'fs';
import { pickClusterCenter } from './image-dedupe-choose.js';

/**
 * Compute average hash (aHash) for perceptual image deduplication
 * @param {Buffer|string} input - Image buffer or file path
 * @returns {Promise<string>} 16-character hex hash
 */
export async function computeAHashHex(input) {
  try {
    // Handle both buffer and file path inputs
    let buffer;
    if (typeof input === 'string') {
      buffer = await fs.promises.readFile(input);
    } else {
      buffer = input;
    }

    // 8x8 grayscale average hash
    const img = await sharp(buffer)
      .grayscale()
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer();

    // Compute average luminance
    let sum = 0;
    for (let i = 0; i < img.length; i++) sum += img[i];
    const avg = sum / img.length;

    // Build 64-bit hash
    let bits = '';
    for (let i = 0; i < img.length; i++) bits += img[i] >= avg ? '1' : '0';

    // Convert to hex (16 hex chars for 64 bits)
    const hex = BigInt('0b' + bits).toString(16).padStart(16, '0');
    return hex;
  } catch (error) {
    console.warn('Failed to compute aHash:', error.message);
    // Return a default hash to prevent breaking the pipeline
    return '0000000000000000';
  }
}

/**
 * Calculate Hamming distance between two hex hashes
 * @param {string} hexA - First hex hash
 * @param {string} hexB - Second hex hash
 * @returns {number} Hamming distance (0-64)
 */
export function hammingDistance(hexA, hexB) {
  try {
    // Ensure both hex strings are valid
    if (!hexA || !hexB) return 64;
    
    const a = BigInt('0x' + (hexA || '0000000000000000'));
    const b = BigInt('0x' + (hexB || '0000000000000000'));
    let x = a ^ b;
    let count = 0;
    while (x) { 
      count += Number(x & 1n); 
      x >>= 1n; 
    }
    return count;
  } catch (error) {
    console.warn('Failed to calculate Hamming distance:', error.message);
    return 64; // Maximum distance to ensure no false matches
  }
}

/**
 * Deduplicate image candidates by perceptual hash
 * @param {Array} candidates - Array of image objects with buffer or path
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Hamming distance threshold for deduplication
 * @returns {Promise<Array>} Deduplicated image array
 */
export async function dedupeByPerceptualHash(candidates, { threshold = 6 } = {}) {
  // Compute hashes lazily
  for (const c of candidates) {
    if (!c.buffer && !c.path) continue; // ensure you can load bytes upstream
    if (!c._ahash) {
      try {
        // Only compute hash if we have actual image data
        if (c.buffer || (c.path && fs.existsSync(c.path))) {
          const bytes = c.buffer ?? await fs.promises.readFile(c.path);
          c._ahash = await computeAHashHex(bytes);
        } else {
          c._ahash = '0000000000000000'; // Default hash
        }
      } catch (error) {
        console.warn('Failed to compute hash for image:', error.message);
        c._ahash = '0000000000000000'; // Default hash
      }
    }
  }

  // Cluster near-duplicates: greedy group by closest hash
  const clusters = [];
  const used = new Set();
  
  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    const base = candidates[i];
    const members = [base];
    used.add(i);

    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(j)) continue;
      // Only compare if both have valid hashes
      if (base._ahash && candidates[j]._ahash) {
        const dist = hammingDistance(base._ahash, candidates[j]._ahash);
        if (dist <= threshold) {
          members.push(candidates[j]);
          used.add(j);
        }
      }
    }
    
    // Pick the best representative from this cluster
    const center = pickClusterCenter(members);
    center.clusterMembers = members.length;
    center.uniquenessScore = 1.0 / members.length; // Inverse of cluster size
    clusters.push(center);
  }
  
  return clusters;
}