import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as pdfToImg from 'pdf-to-img';
import { calculateImageHash, generateExtractionStats } from './imageHashing.js';

// PDF processing security limits
const MAX_PDF_SIZE_MB = 50; // Maximum PDF file size in MB
const PDF_PROCESSING_TIMEOUT = 120000; // 2 minutes timeout per PDF operation
const MAX_CONCURRENT_EXTRACTIONS = 3; // Limit concurrent PDF extractions

// Image processing settings
const PREVIEW_SIZE = 300;
const THUMBNAIL_SIZE = 150;
const JPEG_QUALITY = 75;
const PNG_COMPRESSION = 6;

/**
 * Security check for PDF file
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<boolean>} True if PDF passes security checks
 */
async function validatePdfSecurity(pdfPath) {
  try {
    const stats = await fsPromises.stat(pdfPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB > MAX_PDF_SIZE_MB) {
      throw new Error(`PDF file too large: ${fileSizeMB.toFixed(1)}MB (max: ${MAX_PDF_SIZE_MB}MB)`);
    }
    
    // Additional security checks could be added here
    // e.g., file signature validation, malware scanning
    
    return true;
  } catch (error) {
    throw new Error(`PDF security validation failed: ${error.message}`);
  }
}

/**
 * Execute command with timeout
 * @param {string} command - Command to execute
 * @param {Array} args - Command arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Command result
 */
function executeWithTimeout(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || PDF_PROCESSING_TIMEOUT;
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (!timedOut) {
        reject(new Error(`Command execution error: ${error.message}`));
      }
    });
  });
}

/**
 * Extract images using pdfimages (first stage - lossless)
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory
 * @returns {Promise<Array>} Array of extracted image paths
 */
async function extractWithPdfImages(pdfPath, outputDir) {
  const stats = {
    method: 'pdfimages',
    imagesFound: 0,
    errors: []
  };

  try {
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    // Use pdfimages to extract embedded images (lossless)
    const outputPrefix = path.join(outputDir, 'img');
    
    await executeWithTimeout('pdfimages', [
      '-all',  // Extract all image formats
      '-p',    // Include page numbers in filenames
      pdfPath,
      outputPrefix
    ]);

    // Find extracted files
    const files = await fsPromises.readdir(outputDir);
    const imageFiles = files
      .filter(file => /\.(png|jpg|jpeg|ppm|pbm|pgm)$/i.test(file))
      .map(file => path.join(outputDir, file));

    stats.imagesFound = imageFiles.length;
    
    if (imageFiles.length > 0) {
      console.log(`✅ pdfimages extracted ${imageFiles.length} images`);
      return { images: imageFiles, stats };
    } else {
      console.log('⚠️ pdfimages found no embedded images, will try pdftoppm');
      return { images: [], stats };
    }
    
  } catch (error) {
    console.log(`⚠️ pdfimages failed: ${error.message}, will try pdftoppm`);
    stats.errors.push(error.message);
    return { images: [], stats };
  }
}

/**
 * Extract images using pdftoppm (second stage - fallback)
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory
 * @returns {Promise<Array>} Array of extracted image paths
 */
async function extractWithPdfToPpm(pdfPath, outputDir) {
  const stats = {
    method: 'pdftoppm',
    imagesFound: 0,
    errors: []
  };

  try {
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    // Use pdftoppm to render PDF pages as images
    const outputPrefix = path.join(outputDir, 'page');
    
    await executeWithTimeout('pdftoppm', [
      '-png',      // Output as PNG
      '-r', '300', // 300 DPI for good quality
      pdfPath,
      outputPrefix
    ]);

    // Find generated files
    const files = await fsPromises.readdir(outputDir);
    const imageFiles = files
      .filter(file => file.startsWith('page') && file.endsWith('.png'))
      .map(file => path.join(outputDir, file));

    stats.imagesFound = imageFiles.length;
    
    if (imageFiles.length > 0) {
      console.log(`✅ pdftoppm rendered ${imageFiles.length} pages`);
    } else {
      throw new Error('pdftoppm produced no output');
    }
    
    return { images: imageFiles, stats };
    
  } catch (error) {
    console.log(`❌ pdftoppm failed: ${error.message}`);
    stats.errors.push(error.message);
    return { images: [], stats };
  }
}

/**
 * Fallback using pdf-to-img library
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory
 * @returns {Promise<Array>} Array of extracted image paths
 */
async function extractWithPdfToImg(pdfPath, outputDir) {
  const stats = {
    method: 'pdf-to-img',
    imagesFound: 0,
    errors: []
  };

  try {
    const pdfResult = await pdfToImg.pdf(pdfPath);
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    const images = [];
    let pageIndex = 0;
    
    for await (const page of pdfResult) {
      try {
        pageIndex++;
        const pageFileName = `page${pageIndex}.png`;
        const pagePath = path.join(outputDir, pageFileName);
        await fsPromises.writeFile(pagePath, page);
        images.push(pagePath);
      } catch (err) {
        console.error(`Failed to save page ${pageIndex}:`, err);
        stats.errors.push(`Page ${pageIndex}: ${err.message}`);
      }
    }
    
    stats.imagesFound = images.length;
    console.log(`✅ pdf-to-img extracted ${images.length} pages`);
    
    return { images, stats };
    
  } catch (error) {
    console.log(`❌ pdf-to-img failed: ${error.message}`);
    stats.errors.push(error.message);
    return { images: [], stats };
  }
}

/**
 * Two-stage PDF image extraction with comprehensive statistics
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Extraction result with statistics
 */
export async function extractImagesFromPDF(pdfPath, outputDir, options = {}) {
  const startTime = Date.now();
  const extractionStats = {
    startTime: new Date().toISOString(),
    pdfPath,
    outputDir,
    processingSteps: [],
    extractionAttempts: [],
    finalMethod: null,
    totalImages: 0,
    processingTime: 0,
    securityChecks: {
      passed: false,
      fileSizeMB: 0
    }
  };

  try {
    // Security validation
    extractionStats.processingSteps.push('Starting security validation');
    await validatePdfSecurity(pdfPath);
    const pdfStats = await fsPromises.stat(pdfPath);
    extractionStats.securityChecks.passed = true;
    extractionStats.securityChecks.fileSizeMB = Math.round((pdfStats.size / (1024 * 1024)) * 100) / 100;
    extractionStats.processingSteps.push(`✅ Security validation passed (${extractionStats.securityChecks.fileSizeMB}MB)`);

    // Stage 1: Try pdfimages (lossless extraction of embedded images)
    extractionStats.processingSteps.push('Stage 1: Attempting pdfimages (lossless extraction)');
    const pdfImagesResult = await extractWithPdfImages(pdfPath, outputDir);
    extractionStats.extractionAttempts.push(pdfImagesResult.stats);

    if (pdfImagesResult.images.length > 0) {
      extractionStats.finalMethod = 'pdfimages';
      extractionStats.totalImages = pdfImagesResult.images.length;
      extractionStats.processingSteps.push(`✅ Stage 1 successful: ${pdfImagesResult.images.length} images extracted`);
      
      const processedImages = await processExtractedImages(pdfImagesResult.images, outputDir, options);
      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        images: processedImages,
        extractionMethod: extractionStats.finalMethod,
        extractionStats: {
          ...extractionStats,
          processingTime,
          endTime: new Date().toISOString()
        }
      };
    }

    // Stage 2: Try pdftoppm (page rendering)
    extractionStats.processingSteps.push('Stage 2: Attempting pdftoppm (page rendering)');
    const pdfToPpmResult = await extractWithPdfToPpm(pdfPath, outputDir);
    extractionStats.extractionAttempts.push(pdfToPpmResult.stats);

    if (pdfToPpmResult.images.length > 0) {
      extractionStats.finalMethod = 'pdftoppm';
      extractionStats.totalImages = pdfToPpmResult.images.length;
      extractionStats.processingSteps.push(`✅ Stage 2 successful: ${pdfToPpmResult.images.length} images extracted`);
      
      const processedImages = await processExtractedImages(pdfToPpmResult.images, outputDir, options);
      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        images: processedImages,
        extractionMethod: extractionStats.finalMethod,
        extractionStats: {
          ...extractionStats,
          processingTime,
          endTime: new Date().toISOString()
        }
      };
    }

    // Fallback: Try pdf-to-img library
    extractionStats.processingSteps.push('Fallback: Attempting pdf-to-img library');
    const pdfToImgResult = await extractWithPdfToImg(pdfPath, outputDir);
    extractionStats.extractionAttempts.push(pdfToImgResult.stats);

    if (pdfToImgResult.images.length > 0) {
      extractionStats.finalMethod = 'pdf-to-img';
      extractionStats.totalImages = pdfToImgResult.images.length;
      extractionStats.processingSteps.push(`✅ Fallback successful: ${pdfToImgResult.images.length} images extracted`);
      
      const processedImages = await processExtractedImages(pdfToImgResult.images, outputDir, options);
      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        images: processedImages,
        extractionMethod: extractionStats.finalMethod,
        extractionStats: {
          ...extractionStats,
          processingTime,
          endTime: new Date().toISOString()
        }
      };
    }

    // All methods failed
    extractionStats.processingSteps.push('❌ All extraction methods failed');
    const processingTime = Date.now() - startTime;
    
    return {
      success: false,
      images: [],
      extractionMethod: 'failed',
      extractionStats: {
        ...extractionStats,
        processingTime,
        endTime: new Date().toISOString()
      },
      error: 'All PDF extraction methods failed'
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    extractionStats.processingSteps.push(`❌ Fatal error: ${error.message}`);
    
    return {
      success: false,
      images: [],
      extractionMethod: 'error',
      extractionStats: {
        ...extractionStats,
        processingTime,
        endTime: new Date().toISOString()
      },
      error: error.message
    };
  }
}

/**
 * Process extracted images with hashing and derivative generation
 * @param {Array} imagePaths - Array of image file paths
 * @param {string} outputDir - Output directory
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of processed image objects
 */
async function processExtractedImages(imagePaths, outputDir, options = {}) {
  const processedImages = [];
  const derivativesDir = path.join(outputDir, 'derivatives');
  await fsPromises.mkdir(derivativesDir, { recursive: true });

  for (const imagePath of imagePaths) {
    try {
      const fileName = path.basename(imagePath, path.extname(imagePath));
      
      // Calculate deterministic hash
      const hashResult = await calculateImageHash(imagePath);
      
      // Generate derivatives
      const previewPath = path.join(derivativesDir, `${fileName}_preview.jpg`);
      const thumbnailPath = path.join(derivativesDir, `${fileName}_thumb.jpg`);
      
      // Create optimized JPEG preview (300x300)
      await sharp(imagePath)
        .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(previewPath);
      
      // Create thumbnail (150x150)
      await sharp(imagePath)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(thumbnailPath);

      // Build processed image object
      const processedImage = {
        original: {
          path: imagePath,
          name: path.basename(imagePath),
          size: (await fsPromises.stat(imagePath)).size
        },
        derivatives: {
          preview: previewPath,
          thumbnail: thumbnailPath
        },
        hash: hashResult.hash,
        hashMetadata: hashResult.metadata,
        confidence: 1.0, // Full confidence for direct extraction
        timestamp: hashResult.timestamp
      };

      processedImages.push(processedImage);

    } catch (error) {
      console.error(`Failed to process image ${imagePath}:`, error);
      // Include failed image with error info
      processedImages.push({
        original: { path: imagePath, name: path.basename(imagePath) },
        error: error.message,
        confidence: 0,
        timestamp: new Date().toISOString()
      });
    }
  }

  return processedImages;
}

/**
 * Health check for PDF processing capabilities
 * @returns {Promise<Object>} Health check result
 */
export async function healthCheckPdfProcessing() {
  const checks = {
    pdfimages: false,
    pdftoppm: false,
    pdfToImgLibrary: false,
    sharp: false,
    overall: false
  };

  try {
    // Check pdfimages
    try {
      await executeWithTimeout('pdfimages', ['-v'], { timeout: 5000 });
      checks.pdfimages = true;
    } catch (e) {
      console.warn('pdfimages not available:', e.message);
    }

    // Check pdftoppm
    try {
      await executeWithTimeout('pdftoppm', ['-v'], { timeout: 5000 });
      checks.pdftoppm = true;
    } catch (e) {
      console.warn('pdftoppm not available:', e.message);
    }

    // Check pdf-to-img library
    try {
      checks.pdfToImgLibrary = typeof pdfToImg.pdf === 'function';
    } catch (e) {
      console.warn('pdf-to-img library issue:', e.message);
    }

    // Check Sharp
    try {
      await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } })
        .png()
        .toBuffer();
      checks.sharp = true;
    } catch (e) {
      console.warn('Sharp not working:', e.message);
    }

    // Overall health
    checks.overall = checks.sharp && (checks.pdfimages || checks.pdftoppm || checks.pdfToImgLibrary);

    return {
      healthy: checks.overall,
      checks,
      timestamp: new Date().toISOString(),
      recommendations: generateHealthRecommendations(checks)
    };

  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      checks,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Generate health check recommendations
 * @param {Object} checks - Health check results
 * @returns {Array} Array of recommendation strings
 */
function generateHealthRecommendations(checks) {
  const recommendations = [];

  if (!checks.sharp) {
    recommendations.push('Install Sharp: npm install sharp');
  }

  if (!checks.pdfimages && !checks.pdftoppm) {
    recommendations.push('Install Poppler tools for optimal PDF processing:');
    recommendations.push('  - Ubuntu/Debian: sudo apt-get install poppler-utils');
    recommendations.push('  - macOS: brew install poppler');
    recommendations.push('  - Windows: choco install poppler or use winget install poppler');
  }

  if (!checks.pdfToImgLibrary) {
    recommendations.push('pdf-to-img library issue - check Node.js version compatibility');
  }

  if (recommendations.length === 0) {
    recommendations.push('All systems operational ✅');
  }

  return recommendations;
}

// Export configuration constants
export const PDF_CONFIG = {
  MAX_PDF_SIZE_MB,
  PDF_PROCESSING_TIMEOUT,
  MAX_CONCURRENT_EXTRACTIONS,
  PREVIEW_SIZE,
  THUMBNAIL_SIZE,
  JPEG_QUALITY,
  PNG_COMPRESSION
};