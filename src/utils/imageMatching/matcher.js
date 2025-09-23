/**
 * Image Matching Utilities
 * Provides automated image matching using perceptual hashing and similarity scoring
 */

import imageHash from 'image-hash';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Create a simple wrapper for image-hash since promisify might not work with ES modules
function imageHashAsync(imagePath, bits = 16, precise = true, algorithm = 'phash') {
  return new Promise((resolve, reject) => {
    try {
      if (typeof imageHash === 'function') {
        imageHash(imagePath, bits, precise, algorithm, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      } else if (imageHash.hash) {
        imageHash.hash(imagePath, bits, precise, algorithm, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      } else {
        reject(new Error('image-hash function not found'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate perceptual hash for an image
 * @param {string} imagePath - Path to image file
 * @param {string} algorithm - Hash algorithm ('phash', 'ahash', 'dhash', 'whash')
 * @returns {Promise<Object>} Hash data and metadata
 */
export async function generateImageHash(imagePath, algorithm = 'phash') {
  try {
    const hash = await imageHashAsync(imagePath, 16, true, algorithm);
    const metadata = await sharp(imagePath).metadata();
    
    return {
      path: imagePath,
      hash,
      algorithm,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to generate hash for ${imagePath}: ${error.message}`);
  }
}

/**
 * Calculate Hamming distance between two hashes
 * @param {string} hash1 - First hash (hexadecimal string)
 * @param {string} hash2 - Second hash (hexadecimal string)
 * @returns {number} Hamming distance (0 = identical, higher = more different)
 */
export function calculateHammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match');
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const a = parseInt(hash1[i], 16);
    const b = parseInt(hash2[i], 16);
    let xor = a ^ b;
    
    // Count set bits in XOR result
    while (xor > 0) {
      distance += xor & 1;
      xor >>>= 1;
    }
  }

  return distance;
}

/**
 * Calculate similarity score from Hamming distance
 * @param {number} hammingDistance - Hamming distance between hashes
 * @param {number} hashLength - Length of hash in bits
 * @returns {number} Similarity score (0-1, where 1 = identical)
 */
export function calculateSimilarityScore(hammingDistance, hashLength = 64) {
  return Math.max(0, 1 - (hammingDistance / hashLength));
}

/**
 * Find matching images in a library using perceptual hashing
 * @param {string} queryImagePath - Path to query image
 * @param {Array} libraryImages - Array of library image objects with metadata
 * @param {Object} options - Matching options
 * @returns {Promise<Object>} Match results with candidates and scores
 */
export async function findImageMatches(queryImagePath, libraryImages, options = {}) {
  const {
    algorithm = 'phash',
    maxDistance = 10,
    minSimilarity = 0.8,
    maxCandidates = 5,
    includeMetadata = true
  } = options;

  console.log(`🔍 Finding matches for: ${path.basename(queryImagePath)}`);

  try {
    // Generate hash for query image
    const queryHash = await generateImageHash(queryImagePath, algorithm);
    
    const candidates = [];
    
    // Compare with each library image
    for (const libImage of libraryImages) {
      try {
        // Generate hash for library image if not already present
        let libHash;
        if (libImage.hash && libImage.hash.algorithm === algorithm) {
          libHash = libImage.hash;
        } else {
          libHash = await generateImageHash(libImage.path, algorithm);
          // Cache the hash in the library image object
          libImage.hash = libHash;
        }

        // Calculate similarity
        const hammingDistance = calculateHammingDistance(queryHash.hash, libHash.hash);
        const similarity = calculateSimilarityScore(hammingDistance);

        // Add to candidates if meets criteria
        if (hammingDistance <= maxDistance && similarity >= minSimilarity) {
          const candidate = {
            path: libImage.path,
            id: libImage.id || path.basename(libImage.path),
            name: libImage.name || path.basename(libImage.path, path.extname(libImage.path)),
            similarity,
            hammingDistance,
            method: 'perceptual-hash',
            algorithm
          };

          if (includeMetadata) {
            candidate.metadata = {
              dimensions: {
                query: { width: queryHash.width, height: queryHash.height },
                library: { width: libHash.width, height: libHash.height }
              },
              formats: {
                query: queryHash.format,
                library: libHash.format
              },
              sizes: {
                query: queryHash.size,
                library: libHash.size
              }
            };
          }

          candidates.push(candidate);
        }
      } catch (error) {
        console.warn(`Failed to process library image ${libImage.path}:`, error.message);
      }
    }

    // Sort by similarity (highest first) and limit results
    candidates.sort((a, b) => b.similarity - a.similarity);
    const topCandidates = candidates.slice(0, maxCandidates);

    // Determine confidence level
    let confidence = 'low';
    if (topCandidates.length > 0) {
      const bestMatch = topCandidates[0];
      if (bestMatch.similarity >= 0.95) {
        confidence = 'high';
      } else if (bestMatch.similarity >= 0.85) {
        confidence = 'medium';
      }
    }

    const result = {
      queryImage: {
        path: queryImagePath,
        hash: queryHash.hash,
        algorithm
      },
      totalLibraryImages: libraryImages.length,
      candidatesFound: candidates.length,
      topCandidates,
      confidence,
      bestMatch: topCandidates[0] || null,
      matchingOptions: options,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Found ${candidates.length} potential matches (confidence: ${confidence})`);
    return result;

  } catch (error) {
    console.error('❌ Image matching failed:', error);
    throw error;
  }
}

/**
 * Batch match multiple images against a library
 */
export async function batchMatchImages(queryImages, libraryImages, options = {}) {
  const results = [];
  const { saveReport = true, outputDir = null } = options;

  console.log(`🔍 Batch matching ${queryImages.length} images against ${libraryImages.length} library images`);

  for (let i = 0; i < queryImages.length; i++) {
    const queryImage = queryImages[i];
    console.log(`Processing ${i + 1}/${queryImages.length}: ${path.basename(queryImage)}`);

    try {
      const matchResult = await findImageMatches(queryImage, libraryImages, options);
      results.push({
        ...matchResult,
        index: i,
        success: true
      });
    } catch (error) {
      console.error(`Failed to match ${queryImage}:`, error.message);
      results.push({
        queryImage: { path: queryImage },
        success: false,
        error: error.message,
        index: i
      });
    }
  }

  // Generate batch report
  const summary = {
    timestamp: new Date().toISOString(),
    totalQueries: queryImages.length,
    totalLibrary: libraryImages.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    highConfidence: results.filter(r => r.success && r.confidence === 'high').length,
    mediumConfidence: results.filter(r => r.success && r.confidence === 'medium').length,
    lowConfidence: results.filter(r => r.success && r.confidence === 'low').length,
    options,
    results
  };

  if (saveReport && outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, `batch-match-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
    console.log(`📊 Batch matching report saved to: ${reportPath}`);
  }

  return summary;
}

/**
 * Create enhanced match report with recommendations
 */
export function generateMatchReport(matchResults, options = {}) {
  const { includeRecommendations = true, confidenceThresholds = { high: 0.95, medium: 0.85 } } = options;

  const report = {
    summary: {
      timestamp: new Date().toISOString(),
      totalMatches: matchResults.length,
      distribution: {
        high: 0,
        medium: 0,
        low: 0,
        noMatch: 0
      }
    },
    matches: [],
    recommendations: []
  };

  // Process each match result
  for (const result of matchResults) {
    if (!result.success) {
      report.summary.distribution.noMatch++;
      continue;
    }

    const match = {
      queryImage: result.queryImage.path,
      confidence: result.confidence,
      bestMatch: result.bestMatch,
      alternatives: result.topCandidates.slice(1), // Exclude best match
      metadata: result
    };

    // Update distribution counts
    report.summary.distribution[result.confidence]++;

    // Add recommendation based on confidence
    if (includeRecommendations) {
      let recommendation;
      
      if (result.confidence === 'high') {
        recommendation = {
          action: 'auto-assign',
          reason: `High confidence match (${Math.round(result.bestMatch.similarity * 100)}% similarity)`,
          requiresReview: false
        };
      } else if (result.confidence === 'medium') {
        recommendation = {
          action: 'suggest-with-review',
          reason: `Medium confidence match (${Math.round(result.bestMatch.similarity * 100)}% similarity)`,
          requiresReview: true
        };
      } else if (result.confidence === 'low' && result.bestMatch) {
        recommendation = {
          action: 'manual-review',
          reason: `Low confidence match (${Math.round(result.bestMatch.similarity * 100)}% similarity)`,
          requiresReview: true
        };
      } else {
        recommendation = {
          action: 'no-match',
          reason: 'No suitable matches found',
          requiresReview: true
        };
      }

      match.recommendation = recommendation;
      
      if (recommendation.requiresReview) {
        report.recommendations.push({
          queryImage: result.queryImage.path,
          recommendation,
          candidates: result.topCandidates
        });
      }
    }

    report.matches.push(match);
  }

  return report;
}

/**
 * Load library images from directory with metadata
 */
export async function loadImageLibrary(libraryDir, options = {}) {
  const { 
    supportedFormats = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'],
    includeSubdirs = true,
    generateHashes = true,
    metadataFile = null
  } = options;

  console.log(`📚 Loading image library from: ${libraryDir}`);

  try {
    const libraryImages = [];
    const entries = await fs.readdir(libraryDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(libraryDir, entry.name);

      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedFormats.includes(ext)) {
          const imageObj = {
            path: fullPath,
            name: path.basename(entry.name, ext),
            id: path.basename(entry.name, ext),
            format: ext.slice(1)
          };

          if (generateHashes) {
            try {
              imageObj.hash = await generateImageHash(fullPath);
            } catch (error) {
              console.warn(`Failed to generate hash for ${fullPath}:`, error.message);
            }
          }

          libraryImages.push(imageObj);
        }
      } else if (entry.isDirectory() && includeSubdirs) {
        // Recursively load from subdirectories
        const subLibrary = await loadImageLibrary(fullPath, options);
        libraryImages.push(...subLibrary);
      }
    }

    console.log(`✅ Loaded ${libraryImages.length} images from library`);
    return libraryImages;

  } catch (error) {
    console.error('❌ Failed to load image library:', error);
    throw error;
  }
}