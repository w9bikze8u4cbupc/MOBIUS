import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

/**
 * Image processing utilities for creating web derivatives and thumbnails
 * Supports PNG masters, JPEG web derivatives, and thumbnail generation
 */

/**
 * Configuration for image processing
 */
const IMAGE_CONFIG = {
  web: {
    width: 1920,
    quality: 90,
    format: 'jpeg',
    progressive: true
  },
  thumbnail: {
    width: 300,
    height: 300,
    quality: 75,
    format: 'jpeg'
  },
  master: {
    format: 'png',
    compression: 6, // PNG compression level
    quality: 100
  }
};

/**
 * Ensure PNG master copy exists (lossless preservation)
 */
export async function ensurePngMaster(inputPath, outputDir) {
  await fsPromises.mkdir(outputDir, { recursive: true });
  
  const inputBaseName = path.basename(inputPath, path.extname(inputPath));
  const masterPath = path.join(outputDir, `${inputBaseName}_master.png`);
  
  try {
    // Convert to PNG with maximum quality
    await sharp(inputPath)
      .png({ 
        compressionLevel: IMAGE_CONFIG.master.compression,
        quality: IMAGE_CONFIG.master.quality
      })
      .toFile(masterPath);
    
    const metadata = await sharp(masterPath).metadata();
    
    return {
      path: masterPath,
      type: 'master',
      format: 'png',
      width: metadata.width,
      height: metadata.height,
      size: (await fsPromises.stat(masterPath)).size
    };
    
  } catch (error) {
    console.error(`Failed to create PNG master for ${inputPath}:`, error.message);
    throw error;
  }
}

/**
 * Generate web derivative (1920px progressive JPEG at ~90 quality)
 */
export async function generateWebDerivative(inputPath, outputDir) {
  await fsPromises.mkdir(outputDir, { recursive: true });
  
  const inputBaseName = path.basename(inputPath, path.extname(inputPath));
  const webPath = path.join(outputDir, `${inputBaseName}_web.jpg`);
  
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Resize to fit within web dimensions while maintaining aspect ratio
    let resizeOptions = {
      width: IMAGE_CONFIG.web.width,
      withoutEnlargement: true,
      fit: 'inside'
    };
    
    // If image is taller than wide, prioritize height
    if (metadata.height > metadata.width) {
      resizeOptions.height = IMAGE_CONFIG.web.width;
    }
    
    await image
      .resize(resizeOptions)
      .jpeg({ 
        quality: IMAGE_CONFIG.web.quality,
        progressive: IMAGE_CONFIG.web.progressive,
        mozjpeg: true // Use mozjpeg for better compression
      })
      .toFile(webPath);
    
    const finalMetadata = await sharp(webPath).metadata();
    
    return {
      path: webPath,
      type: 'web',
      format: 'jpeg',
      width: finalMetadata.width,
      height: finalMetadata.height,
      size: (await fsPromises.stat(webPath)).size,
      quality: IMAGE_CONFIG.web.quality
    };
    
  } catch (error) {
    console.error(`Failed to create web derivative for ${inputPath}:`, error.message);
    throw error;
  }
}

/**
 * Generate thumbnail (300px square)
 */
export async function generateThumbnail(inputPath, outputDir) {
  await fsPromises.mkdir(outputDir, { recursive: true });
  
  const inputBaseName = path.basename(inputPath, path.extname(inputPath));
  const thumbPath = path.join(outputDir, `${inputBaseName}_thumb.jpg`);
  
  try {
    await sharp(inputPath)
      .resize(IMAGE_CONFIG.thumbnail.width, IMAGE_CONFIG.thumbnail.height, {
        fit: 'cover', // Crop to fill square
        position: 'centre'
      })
      .jpeg({ 
        quality: IMAGE_CONFIG.thumbnail.quality 
      })
      .toFile(thumbPath);
    
    const metadata = await sharp(thumbPath).metadata();
    
    return {
      path: thumbPath,
      type: 'thumbnail',
      format: 'jpeg',
      width: metadata.width,
      height: metadata.height,
      size: (await fsPromises.stat(thumbPath)).size,
      quality: IMAGE_CONFIG.thumbnail.quality
    };
    
  } catch (error) {
    console.error(`Failed to create thumbnail for ${inputPath}:`, error.message);
    throw error;
  }
}

/**
 * Process single image to create all derivatives
 */
export async function processImageDerivatives(inputPath, outputDir) {
  const results = {
    input: inputPath,
    outputs: [],
    errors: []
  };
  
  try {
    // Create directory structure
    const mastersDir = path.join(outputDir, 'masters');
    const webDir = path.join(outputDir, 'web');
    const thumbsDir = path.join(outputDir, 'thumbnails');
    
    await Promise.all([
      fsPromises.mkdir(mastersDir, { recursive: true }),
      fsPromises.mkdir(webDir, { recursive: true }),
      fsPromises.mkdir(thumbsDir, { recursive: true })
    ]);
    
    // Generate all derivatives
    const tasks = [
      ensurePngMaster(inputPath, mastersDir),
      generateWebDerivative(inputPath, webDir),
      generateThumbnail(inputPath, thumbsDir)
    ];
    
    const outputs = await Promise.allSettled(tasks);
    
    outputs.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.outputs.push(result.value);
      } else {
        results.errors.push({
          type: ['master', 'web', 'thumbnail'][index],
          error: result.reason.message
        });
      }
    });
    
  } catch (error) {
    results.errors.push({
      type: 'general',
      error: error.message
    });
  }
  
  return results;
}

/**
 * Batch process multiple images
 */
export async function batchProcessImages(inputPaths, outputDir, options = {}) {
  const {
    concurrency = 3,
    skipExisting = true
  } = options;
  
  const results = [];
  const chunks = [];
  
  // Split into chunks for concurrent processing
  for (let i = 0; i < inputPaths.length; i += concurrency) {
    chunks.push(inputPaths.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (inputPath) => {
      try {
        // Check if outputs already exist
        if (skipExisting) {
          const baseName = path.basename(inputPath, path.extname(inputPath));
          const webPath = path.join(outputDir, 'web', `${baseName}_web.jpg`);
          
          if (fs.existsSync(webPath)) {
            console.log(`Skipping existing: ${inputPath}`);
            return { input: inputPath, skipped: true };
          }
        }
        
        console.log(`Processing: ${inputPath}`);
        return await processImageDerivatives(inputPath, outputDir);
        
      } catch (error) {
        console.error(`Failed to process ${inputPath}:`, error.message);
        return {
          input: inputPath,
          outputs: [],
          errors: [{ type: 'processing', error: error.message }]
        };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }
  
  return results;
}

/**
 * Get processing statistics
 */
export function getProcessingStats(results) {
  const stats = {
    total: results.length,
    successful: 0,
    skipped: 0,
    failed: 0,
    totalOutputs: 0,
    totalErrors: 0,
    outputTypes: {
      master: 0,
      web: 0,
      thumbnail: 0
    }
  };
  
  results.forEach(result => {
    if (result.skipped) {
      stats.skipped++;
    } else if (result.errors && result.errors.length > 0) {
      stats.failed++;
      stats.totalErrors += result.errors.length;
    } else {
      stats.successful++;
    }
    
    if (result.outputs) {
      stats.totalOutputs += result.outputs.length;
      result.outputs.forEach(output => {
        if (stats.outputTypes[output.type] !== undefined) {
          stats.outputTypes[output.type]++;
        }
      });
    }
  });
  
  return stats;
}

/**
 * Clean up temporary files and optimize storage
 */
export async function cleanupTempFiles(outputDir, keepMasters = true) {
  const tempPatterns = [
    /.*\.tmp$/,
    /.*~$/,
    /\._.*$/
  ];
  
  async function cleanDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    const files = await fsPromises.readdir(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fsPromises.stat(filePath);
      
      if (stat.isDirectory()) {
        await cleanDir(filePath);
      } else if (tempPatterns.some(pattern => pattern.test(file))) {
        console.log(`Removing temp file: ${filePath}`);
        await fsPromises.unlink(filePath);
      }
    }
  }
  
  await cleanDir(outputDir);
}