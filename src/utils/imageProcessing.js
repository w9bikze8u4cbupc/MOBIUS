import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import Jimp from 'jimp';
import { blockhash } from 'blockhash-core';
import hamming from 'hamming-distance';

/**
 * Configuration constants for image processing
 */
export const IMAGE_CONFIG = {
  // Archive formats
  PNG_MASTER_QUALITY: 9, // PNG compression level
  
  // Web formats  
  WEB_WIDTH: 1920,
  WEB_JPEG_QUALITY: 85,
  WEB_PROGRESSIVE: true,
  
  // Thumbnails
  THUMB_SIZE: 300,
  THUMB_JPEG_QUALITY: 75,
  
  // pHash matching
  PHASH_BITS: 64,
  DEFAULT_AUTO_ASSIGN_THRESHOLD: 0.90,
  HAMMING_MAX_DISTANCE: 64, // Max possible Hamming distance for 64-bit hash
  
  // Processing
  DEFAULT_CONCURRENCY: 4
};

/**
 * Extract images from PDF using multiple methods (pdfimages -> pdftoppm fallback)
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory for extracted images
 * @returns {Promise<Array>} Array of extracted image info
 */
export async function extractImagesFromPDF(pdfPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  
  const extractionResults = {
    method: null,
    images: [],
    stats: {
      extractedCount: 0,
      processingErrors: 0,
      fallbackUsed: false
    }
  };

  try {
    // First try pdfimages for lossless extraction
    const pdfimagesResult = await tryPdfimagesExtraction(pdfPath, outputDir);
    if (pdfimagesResult.images.length > 0) {
      extractionResults.method = 'pdfimages';
      extractionResults.images = pdfimagesResult.images;
      extractionResults.stats.extractedCount = pdfimagesResult.images.length;
      return extractionResults;
    }
    
    console.log('pdfimages extraction yielded no results, falling back to pdftoppm');
    extractionResults.stats.fallbackUsed = true;
    
  } catch (error) {
    console.warn('pdfimages extraction failed:', error.message);
    extractionResults.stats.fallbackUsed = true;
  }

  // Fallback to pdftoppm (renders each page)
  try {
    const pdftoppmResult = await tryPdftoppmExtraction(pdfPath, outputDir);
    extractionResults.method = 'pdftoppm';
    extractionResults.images = pdftoppmResult.images;
    extractionResults.stats.extractedCount = pdftoppmResult.images.length;
    
  } catch (error) {
    console.error('Both extraction methods failed:', error.message);
    throw new Error(`Image extraction failed: ${error.message}`);
  }

  return extractionResults;
}

/**
 * Try extracting using pdfimages (preserves original image data)
 */
async function tryPdfimagesExtraction(pdfPath, outputDir) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  
  const prefix = 'extracted';
  
  try {
    // Run pdfimages to extract embedded images
    await execFileAsync('pdfimages', ['-all', pdfPath, path.join(outputDir, prefix)]);
    
    // List extracted files
    const files = await fs.readdir(outputDir);
    const imageFiles = files.filter(f => f.startsWith(prefix));
    
    const images = [];
    for (const file of imageFiles) {
      const filePath = path.join(outputDir, file);
      const stats = await fs.stat(filePath);
      
      images.push({
        path: filePath,
        filename: file,
        size: stats.size,
        extractionMethod: 'pdfimages',
        originalFormat: path.extname(file).slice(1) || 'unknown'
      });
    }
    
    return { images };
    
  } catch (error) {
    console.warn('pdfimages not available or failed:', error.message);
    return { images: [] };
  }
}

/**
 * Try extracting using pdftoppm (renders pages as images)
 */
async function tryPdftoppmExtraction(pdfPath, outputDir) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  
  const prefix = 'page';
  
  try {
    // Render PDF pages as PNG images at high resolution
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', '300', // 300 DPI for good quality
      pdfPath,
      path.join(outputDir, prefix)
    ]);
    
    // List generated files
    const files = await fs.readdir(outputDir);
    const imageFiles = files
      .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
      .sort();
    
    const images = [];
    for (const file of imageFiles) {
      const filePath = path.join(outputDir, file);
      const stats = await fs.stat(filePath);
      
      images.push({
        path: filePath,
        filename: file,
        size: stats.size,
        extractionMethod: 'pdftoppm',
        originalFormat: 'png',
        pageNumber: extractPageNumber(file)
      });
    }
    
    return { images };
    
  } catch (error) {
    throw new Error(`pdftoppm extraction failed: ${error.message}`);
  }
}

/**
 * Extract page number from pdftoppm filename (e.g., "page-001.png" => 1)
 */
function extractPageNumber(filename) {
  const match = filename.match(/page-?(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Process extracted images through Sharp pipeline
 * Creates PNG masters, JPEG web versions, and thumbnails
 */
export async function processImagePipeline(images, outputDir) {
  const results = {
    processed: [],
    errors: []
  };

  const mastersDir = path.join(outputDir, 'masters');
  const webDir = path.join(outputDir, 'web');
  const thumbsDir = path.join(outputDir, 'thumbs');
  
  await Promise.all([
    fs.mkdir(mastersDir, { recursive: true }),
    fs.mkdir(webDir, { recursive: true }),
    fs.mkdir(thumbsDir, { recursive: true })
  ]);

  // Process images with controlled concurrency
  const processingPromises = images.map(async (image, index) => {
    try {
      const basename = path.parse(image.filename).name;
      
      // Generate all three formats
      const [masterPath, webPath, thumbPath] = await Promise.all([
        generateMaster(image.path, mastersDir, basename),
        generateWebVersion(image.path, webDir, basename),
        generateThumbnail(image.path, thumbsDir, basename)
      ]);
      
      // Calculate pHash for the master version
      const phash = await calculatePHash(masterPath);
      
      const processedImage = {
        original: image,
        master: masterPath,
        web: webPath,
        thumb: thumbPath,
        phash: phash,
        index: index
      };
      
      results.processed.push(processedImage);
      
    } catch (error) {
      console.error(`Failed to process image ${image.filename}:`, error);
      results.errors.push({
        image: image.filename,
        error: error.message
      });
    }
  });

  await Promise.all(processingPromises);
  
  return results;
}

/**
 * Generate PNG master (archival quality)
 */
async function generateMaster(inputPath, outputDir, basename) {
  const outputPath = path.join(outputDir, `${basename}.png`);
  
  await sharp(inputPath)
    .png({ 
      compressionLevel: IMAGE_CONFIG.PNG_MASTER_QUALITY,
      adaptiveFiltering: true
    })
    .toFile(outputPath);
    
  return outputPath;
}

/**
 * Generate web-optimized JPEG
 */
async function generateWebVersion(inputPath, outputDir, basename) {
  const outputPath = path.join(outputDir, `${basename}.jpg`);
  
  await sharp(inputPath)
    .resize(IMAGE_CONFIG.WEB_WIDTH, null, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: IMAGE_CONFIG.WEB_JPEG_QUALITY,
      progressive: IMAGE_CONFIG.WEB_PROGRESSIVE
    })
    .toFile(outputPath);
    
  return outputPath;
}

/**
 * Generate thumbnail
 */
async function generateThumbnail(inputPath, outputDir, basename) {
  const outputPath = path.join(outputDir, `${basename}_thumb.jpg`);
  
  await sharp(inputPath)
    .resize(IMAGE_CONFIG.THUMB_SIZE, IMAGE_CONFIG.THUMB_SIZE, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: IMAGE_CONFIG.THUMB_JPEG_QUALITY
    })
    .toFile(outputPath);
    
  return outputPath;
}

/**
 * Calculate perceptual hash using blockhash algorithm
 * Returns hex string representation
 */
export async function calculatePHash(imagePath) {
  try {
    // Use Jimp to load and process the image
    const image = await Jimp.read(imagePath);
    
    // Convert to grayscale and resize to standard size for hashing
    image.greyscale().resize(32, 32);
    
    // Get image data
    const { data, width, height } = image.bitmap;
    
    // Calculate blockhash (perceptual hash)
    const hash = blockhash(data, width, height, 16); // 16x16 = 256 bits, we'll use first 64
    
    // Convert to 64-bit hex string for consistency
    const hash64 = hash.substring(0, 16); // First 64 bits (16 hex chars)
    
    return {
      hex: hash64,
      bits: IMAGE_CONFIG.PHASH_BITS,
      algorithm: 'blockhash'
    };
    
  } catch (error) {
    console.error(`Failed to calculate pHash for ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Compare two pHashes and return similarity metrics
 */
export function comparePHashes(hash1, hash2) {
  if (!hash1?.hex || !hash2?.hex) {
    throw new Error('Invalid hash objects provided');
  }
  
  // Convert hex to binary for Hamming distance calculation
  const bin1 = hexToBinary(hash1.hex);
  const bin2 = hexToBinary(hash2.hex);
  
  // Calculate Hamming distance
  const hammingDistance = hamming(bin1, bin2);
  
  // Convert to similarity (0-1 scale, where 1 is identical)
  const similarity = 1 - (hammingDistance / IMAGE_CONFIG.PHASH_BITS);
  
  // Calculate confidence based on similarity
  const confidence = Math.max(0, Math.min(1, similarity));
  
  return {
    hammingDistance,
    similarity,
    confidence,
    maxDistance: IMAGE_CONFIG.PHASH_BITS
  };
}

/**
 * Convert hex string to binary string
 */
function hexToBinary(hex) {
  return hex.split('').map(h => 
    parseInt(h, 16).toString(2).padStart(4, '0')
  ).join('');
}

/**
 * Find matches for a component image against a library of images
 */
export function findImageMatches(componentImages, libraryImages, threshold = IMAGE_CONFIG.DEFAULT_AUTO_ASSIGN_THRESHOLD) {
  const matches = [];
  const lowConfidenceCandidates = [];
  
  for (const component of componentImages) {
    if (!component.phash) continue;
    
    const candidates = [];
    
    for (const library of libraryImages) {
      if (!library.phash) continue;
      
      try {
        const comparison = comparePHashes(component.phash, library.phash);
        
        candidates.push({
          libraryImage: library,
          ...comparison
        });
        
      } catch (error) {
        console.warn(`Failed to compare hashes:`, error.message);
      }
    }
    
    // Sort by confidence (highest first)
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    const bestMatch = candidates[0];
    
    if (bestMatch && bestMatch.confidence >= threshold) {
      matches.push({
        component,
        match: bestMatch,
        autoAssigned: true
      });
    } else if (bestMatch && bestMatch.confidence >= 0.5) {
      // Log lower confidence candidates for manual review
      lowConfidenceCandidates.push({
        component,
        candidates: candidates.slice(0, 3), // Top 3 candidates
        requiresReview: true
      });
    }
  }
  
  return {
    matches,
    lowConfidenceCandidates,
    stats: {
      totalComponents: componentImages.length,
      autoMatched: matches.length,
      needsReview: lowConfidenceCandidates.length,
      threshold
    }
  };
}

/**
 * Persist pHash data in canonical format
 */
export function formatPHashForStorage(phash) {
  return {
    hex: phash.hex,
    base64: Buffer.from(phash.hex, 'hex').toString('base64'),
    bits: phash.bits,
    algorithm: phash.algorithm,
    version: '1.0'
  };
}

/**
 * Validate pHash format
 */
export function validatePHash(phash) {
  if (!phash || typeof phash !== 'object') {
    return false;
  }
  
  const required = ['hex', 'bits', 'algorithm'];
  return required.every(field => phash.hasOwnProperty(field));
}