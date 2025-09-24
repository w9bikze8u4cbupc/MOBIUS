import { imageHash } from 'image-hash';
import hamming from 'hamming-distance';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

// Promisify image-hash functions
const pHashAsync = promisify(imageHash);

/**
 * Perceptual hashing and matching utilities for image comparison
 * Uses pHash for generating perceptual hashes and Hamming distance for similarity
 */

/**
 * Configuration for perceptual hashing and matching
 */
const PHASH_CONFIG = {
  algorithm: 'phash',
  size: 8, // 8x8 = 64-bit hash
  threshold: {
    default: 0.90, // 90% similarity threshold
    strict: 0.95,  // 95% for strict matching
    loose: 0.85    // 85% for loose matching
  }
};

/**
 * Generate perceptual hash for an image
 */
export async function generatePHash(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    const hash = await pHashAsync(imagePath, PHASH_CONFIG.size, PHASH_CONFIG.algorithm);
    
    return {
      imagePath,
      hash,
      algorithm: PHASH_CONFIG.algorithm,
      size: PHASH_CONFIG.size,
      generatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Failed to generate pHash for ${imagePath}:`, error.message);
    throw error;
  }
}

/**
 * Calculate Hamming distance between two hashes
 */
export function calculateHammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) {
    throw new Error('Both hashes must be provided');
  }
  
  if (hash1.length !== hash2.length) {
    throw new Error('Hashes must be the same length');
  }
  
  return hamming(hash1, hash2);
}

/**
 * Calculate similarity percentage from Hamming distance
 */
export function calculateSimilarity(hash1, hash2) {
  const distance = calculateHammingDistance(hash1, hash2);
  const maxDistance = hash1.length * 4; // Each hex character represents 4 bits
  const similarity = (maxDistance - distance) / maxDistance;
  
  return {
    similarity,
    distance,
    maxDistance,
    percentage: Math.round(similarity * 10000) / 100 // Round to 2 decimal places
  };
}

/**
 * Compare two images using perceptual hashing
 */
export async function compareImages(imagePath1, imagePath2) {
  try {
    const [hash1Data, hash2Data] = await Promise.all([
      generatePHash(imagePath1),
      generatePHash(imagePath2)
    ]);
    
    const similarityData = calculateSimilarity(hash1Data.hash, hash2Data.hash);
    
    return {
      image1: hash1Data,
      image2: hash2Data,
      ...similarityData,
      isMatch: similarityData.similarity >= PHASH_CONFIG.threshold.default,
      comparedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Failed to compare images ${imagePath1} and ${imagePath2}:`, error.message);
    throw error;
  }
}

/**
 * Find similar images in a collection
 */
export async function findSimilarImages(targetImagePath, candidateImages, threshold = null) {
  const actualThreshold = threshold || PHASH_CONFIG.threshold.default;
  
  try {
    const targetHash = await generatePHash(targetImagePath);
    const results = [];
    
    // Process candidates in batches to avoid overwhelming memory
    const batchSize = 10;
    
    for (let i = 0; i < candidateImages.length; i += batchSize) {
      const batch = candidateImages.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (candidatePath) => {
        try {
          const candidateHash = await generatePHash(candidatePath);
          const similarityData = calculateSimilarity(targetHash.hash, candidateHash.hash);
          
          return {
            candidatePath,
            candidateHash: candidateHash.hash,
            ...similarityData,
            isMatch: similarityData.similarity >= actualThreshold
          };
          
        } catch (error) {
          console.warn(`Failed to process candidate ${candidatePath}:`, error.message);
          return {
            candidatePath,
            error: error.message,
            isMatch: false,
            similarity: 0
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    // Sort by similarity (highest first)
    results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    
    return {
      targetImage: targetImagePath,
      targetHash: targetHash.hash,
      threshold: actualThreshold,
      totalCandidates: candidateImages.length,
      matches: results.filter(r => r.isMatch),
      allResults: results,
      processedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Failed to find similar images for ${targetImagePath}:`, error.message);
    throw error;
  }
}

/**
 * Build a hash database for efficient matching
 */
export async function buildHashDatabase(imagePaths, outputPath = null) {
  const database = {
    version: '1.0.0',
    algorithm: PHASH_CONFIG.algorithm,
    size: PHASH_CONFIG.size,
    createdAt: new Date().toISOString(),
    images: [],
    totalImages: imagePaths.length,
    successCount: 0,
    errorCount: 0
  };
  
  console.log(`Building hash database for ${imagePaths.length} images...`);
  
  // Process images in batches
  const batchSize = 5;
  
  for (let i = 0; i < imagePaths.length; i += batchSize) {
    const batch = imagePaths.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(imagePaths.length / batchSize)}`);
    
    const batchPromises = batch.map(async (imagePath) => {
      try {
        const hashData = await generatePHash(imagePath);
        database.successCount++;
        return hashData;
      } catch (error) {
        console.warn(`Failed to hash ${imagePath}:`, error.message);
        database.errorCount++;
        return {
          imagePath,
          error: error.message,
          generatedAt: new Date().toISOString()
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    database.images.push(...batchResults);
  }
  
  console.log(`Hash database complete: ${database.successCount} success, ${database.errorCount} errors`);
  
  // Save to file if output path provided
  if (outputPath) {
    await fsPromises.writeFile(outputPath, JSON.stringify(database, null, 2));
    console.log(`Database saved to: ${outputPath}`);
  }
  
  return database;
}

/**
 * Load hash database from file
 */
export async function loadHashDatabase(databasePath) {
  try {
    const data = await fsPromises.readFile(databasePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load hash database from ${databasePath}:`, error.message);
    throw error;
  }
}

/**
 * Find matches in a pre-built hash database
 */
export async function findMatchesInDatabase(targetImagePath, database, threshold = null) {
  const actualThreshold = threshold || PHASH_CONFIG.threshold.default;
  
  try {
    const targetHash = await generatePHash(targetImagePath);
    const matches = [];
    
    for (const dbEntry of database.images) {
      if (dbEntry.error || !dbEntry.hash) {
        continue; // Skip failed entries
      }
      
      const similarityData = calculateSimilarity(targetHash.hash, dbEntry.hash);
      
      if (similarityData.similarity >= actualThreshold) {
        matches.push({
          ...dbEntry,
          ...similarityData,
          isMatch: true
        });
      }
    }
    
    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);
    
    return {
      targetImage: targetImagePath,
      targetHash: targetHash.hash,
      threshold: actualThreshold,
      databaseSize: database.images.length,
      matchCount: matches.length,
      matches,
      processedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Failed to find matches in database for ${targetImagePath}:`, error.message);
    throw error;
  }
}

/**
 * Remove duplicate images based on perceptual hash similarity
 */
export async function deduplicateImages(imagePaths, threshold = null, keepFirst = true) {
  const actualThreshold = threshold || PHASH_CONFIG.threshold.strict; // Use stricter threshold for deduplication
  
  const hashes = new Map();
  const duplicates = [];
  const unique = [];
  
  console.log(`Deduplicating ${imagePaths.length} images with ${actualThreshold * 100}% similarity threshold...`);
  
  for (const imagePath of imagePaths) {
    try {
      const hashData = await generatePHash(imagePath);
      let isDuplicate = false;
      
      // Check against existing hashes
      for (const [existingPath, existingHash] of hashes) {
        const similarity = calculateSimilarity(hashData.hash, existingHash);
        
        if (similarity.similarity >= actualThreshold) {
          duplicates.push({
            duplicate: imagePath,
            duplicateHash: hashData.hash,
            original: existingPath,
            originalHash: existingHash,
            similarity: similarity.similarity,
            distance: similarity.distance
          });
          
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        hashes.set(imagePath, hashData.hash);
        unique.push(imagePath);
      }
      
    } catch (error) {
      console.warn(`Failed to process ${imagePath} for deduplication:`, error.message);
      // Add to unique by default if we can't hash it
      unique.push(imagePath);
    }
  }
  
  console.log(`Deduplication complete: ${unique.length} unique, ${duplicates.length} duplicates found`);
  
  return {
    unique,
    duplicates,
    totalProcessed: imagePaths.length,
    threshold: actualThreshold,
    processedAt: new Date().toISOString()
  };
}

/**
 * Auto-assign images to components based on similarity
 */
export async function autoAssignImages(components, availableImages, threshold = null) {
  const actualThreshold = threshold || PHASH_CONFIG.threshold.default;
  const assignments = [];
  
  for (const component of components) {
    if (!component.referenceImage) {
      console.log(`Skipping component ${component.name} - no reference image`);
      continue;
    }
    
    try {
      const matches = await findSimilarImages(
        component.referenceImage, 
        availableImages, 
        actualThreshold
      );
      
      assignments.push({
        component: component.name,
        referenceImage: component.referenceImage,
        matches: matches.matches,
        bestMatch: matches.matches[0] || null,
        assignmentConfidence: matches.matches[0]?.similarity || 0
      });
      
    } catch (error) {
      console.error(`Failed to assign images for component ${component.name}:`, error.message);
      assignments.push({
        component: component.name,
        referenceImage: component.referenceImage,
        error: error.message,
        matches: [],
        bestMatch: null,
        assignmentConfidence: 0
      });
    }
  }
  
  return {
    assignments,
    threshold: actualThreshold,
    totalComponents: components.length,
    successfulAssignments: assignments.filter(a => a.bestMatch).length,
    processedAt: new Date().toISOString()
  };
}