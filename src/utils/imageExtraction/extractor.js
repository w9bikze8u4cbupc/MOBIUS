/**
 * Enhanced Image Extraction Utilities
 * Provides robust image extraction with metadata preservation and multiple fallback options
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import * as pdfToImg from 'pdf-to-img';
// Note: pdf-poppler may not work on all platforms, so we handle gracefully
let pdfPoppler = null;
// Disable pdf-poppler for now since it's not supported on this platform

const execFileAsync = promisify(execFile);

/**
 * Extract images from PDF with comprehensive metadata
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory for extracted images
 * @param {Object} options - Extraction options
 * @returns {Promise<Array>} Array of extracted image objects with metadata
 */
export async function extractImagesFromPDF(pdfPath, outputDir, options = {}) {
  const {
    preferPoppler = true,
    format = 'png',
    dpi = 150,
    preserveNative = true,
    generateThumbnails = true
  } = options;

  await fs.mkdir(outputDir, { recursive: true });
  
  const extractionResult = {
    method: null,
    images: [],
    metadata: {
      sourcePath: pdfPath,
      extractionTime: new Date().toISOString(),
      totalPages: 0,
      options
    }
  };

  try {
    // Try poppler first if available and preferred
    if (preferPoppler) {
      try {
        extractionResult.images = await extractWithPoppler(pdfPath, outputDir, { format, dpi });
        extractionResult.method = 'poppler';
        console.log(`✅ Successfully extracted ${extractionResult.images.length} images using Poppler`);
      } catch (popplerError) {
        console.warn('⚠️ Poppler extraction failed, falling back to pdf-to-img:', popplerError.message);
      }
    }

    // Fallback to pdf-to-img if poppler failed or not preferred
    if (!extractionResult.images.length) {
      extractionResult.images = await extractWithPdfToImg(pdfPath, outputDir, { format });
      extractionResult.method = 'pdf-to-img';
      console.log(`✅ Successfully extracted ${extractionResult.images.length} images using pdf-to-img`);
    }

    // Enhance each image with metadata and processing
    for (let i = 0; i < extractionResult.images.length; i++) {
      const img = extractionResult.images[i];
      await enhanceImageMetadata(img, outputDir, { generateThumbnails, preserveNative });
    }

    extractionResult.metadata.totalPages = extractionResult.images.length;
    
    // Save extraction metadata
    const metadataPath = path.join(outputDir, 'extraction-metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(extractionResult, null, 2));

    return extractionResult;

  } catch (error) {
    console.error('❌ Image extraction failed:', error);
    throw new Error(`Image extraction failed: ${error.message}`);
  }
}

/**
 * Extract images using pdf-poppler (preferred method)
 */
async function extractWithPoppler(pdfPath, outputDir, { format, dpi }) {
  if (!pdfPoppler) {
    throw new Error('pdf-poppler not available on this platform');
  }

  const options = {
    format: format,
    out_dir: outputDir,
    out_prefix: 'page',
    page: null, // Extract all pages
    scale: dpi / 72, // Convert DPI to scale factor
  };

  try {
    const pages = await pdfPoppler.convert(pdfPath, options);
    const images = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNumber = i + 1;
      const filename = `page-${pageNumber}.${format}`;
      const filePath = path.join(outputDir, filename);
      
      images.push({
        path: filePath,
        filename,
        pageNumber,
        width: null, // Will be populated by enhanceImageMetadata
        height: null,
        dpi,
        format,
        size: null,
        hash: null,
        extractionMethod: 'poppler'
      });
    }

    return images;
  } catch (error) {
    throw new Error(`Poppler extraction failed: ${error.message}`);
  }
}

/**
 * Extract images using pdf-to-img (fallback method)
 */
async function extractWithPdfToImg(pdfPath, outputDir, { format }) {
  const pdfResult = await pdfToImg.pdf(pdfPath);
  const images = [];
  let pageIndex = 0;

  for await (const page of pdfResult) {
    pageIndex++;
    const filename = `page-${pageIndex}.${format}`;
    const filePath = path.join(outputDir, filename);
    
    await fs.writeFile(filePath, page);
    
    images.push({
      path: filePath,
      filename,
      pageNumber: pageIndex,
      width: null,
      height: null,
      dpi: null, // pdf-to-img doesn't preserve DPI info
      format,
      size: null,
      hash: null,
      extractionMethod: 'pdf-to-img'
    });
  }

  return images;
}

/**
 * Enhance image object with comprehensive metadata
 */
async function enhanceImageMetadata(imageObj, outputDir, { generateThumbnails, preserveNative }) {
  try {
    // Get file stats
    const stats = await fs.stat(imageObj.path);
    imageObj.size = stats.size;
    imageObj.modifiedTime = stats.mtime.toISOString();

    // Get image dimensions and metadata using Sharp
    const metadata = await sharp(imageObj.path).metadata();
    imageObj.width = metadata.width;
    imageObj.height = metadata.height;
    imageObj.density = metadata.density;
    imageObj.channels = metadata.channels;
    imageObj.hasAlpha = metadata.hasAlpha;
    
    // Generate hash for deduplication
    const imageBuffer = await fs.readFile(imageObj.path);
    imageObj.hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    imageObj.md5 = crypto.createHash('md5').update(imageBuffer).digest('hex');

    // Generate derivatives
    if (generateThumbnails) {
      await generateImageDerivatives(imageObj, outputDir);
    }

    return imageObj;
  } catch (error) {
    console.error(`Failed to enhance metadata for ${imageObj.path}:`, error);
    return imageObj;
  }
}

/**
 * Generate standard derivative images (thumbnails, web-optimized versions)
 */
async function generateImageDerivatives(imageObj, outputDir) {
  const baseNameWithoutExt = path.parse(imageObj.filename).name;
  const thumbnailDir = path.join(outputDir, 'thumbnails');
  const webDir = path.join(outputDir, 'web');
  
  await fs.mkdir(thumbnailDir, { recursive: true });
  await fs.mkdir(webDir, { recursive: true });

  const derivatives = [];

  try {
    // Generate multiple thumbnail sizes
    const thumbnailSizes = [150, 300, 600];
    for (const size of thumbnailSizes) {
      const thumbnailPath = path.join(thumbnailDir, `${baseNameWithoutExt}_${size}.jpg`);
      await sharp(imageObj.path)
        .resize(size, size, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 })
        .toFile(thumbnailPath);
      
      derivatives.push({
        type: 'thumbnail',
        size,
        path: thumbnailPath,
        format: 'jpeg'
      });
    }

    // Generate web-optimized version
    const webPath = path.join(webDir, `${baseNameWithoutExt}_web.jpg`);
    await sharp(imageObj.path)
      .resize(1200, 1200, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 80 })
      .toFile(webPath);
    
    derivatives.push({
      type: 'web',
      path: webPath,
      format: 'jpeg'
    });

    imageObj.derivatives = derivatives;
    
  } catch (error) {
    console.error(`Failed to generate derivatives for ${imageObj.path}:`, error);
    imageObj.derivatives = [];
  }
}

/**
 * Extract images from URL using external API (enhanced version)
 */
export async function extractImagesFromUrl(url, apiKey, options = {}) {
  const { mode = 'basic', includeMetadata = true } = options;
  
  console.log('🔍 Extracting images from URL:', url);
  
  try {
    // Start extraction
    const startRes = await fetch('https://api.extract.pics/v0/extractions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, mode })
    });

    if (!startRes.ok) {
      throw new Error(`API request failed: ${startRes.status}`);
    }

    const startData = await startRes.json();
    const extractionId = startData.data.id;

    // Poll for completion
    let status = startData.data.status;
    let images = [];
    let attempts = 0;
    const maxAttempts = 30; // Increased from 20

    while (status !== 'done' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const pollRes = await fetch(`https://api.extract.pics/v0/extractions/${extractionId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!pollRes.ok) {
        throw new Error(`Polling failed: ${pollRes.status}`);
      }

      const pollData = await pollRes.json();
      status = pollData.data.status;
      images = pollData.data.images || [];
      attempts++;
    }

    if (status === 'done') {
      const enhancedImages = images.map((img, index) => ({
        url: img.url,
        originalUrl: url,
        index,
        width: img.width || null,
        height: img.height || null,
        format: img.format || 'unknown',
        size: img.size || null,
        extractionMethod: 'external-api',
        extractionTime: new Date().toISOString()
      }));

      console.log(`✅ Successfully extracted ${enhancedImages.length} images from URL`);
      return enhancedImages;
    } else {
      throw new Error(`Extraction failed or timed out for ${url}. Status: ${status}`);
    }
  } catch (error) {
    console.error('❌ URL image extraction failed:', error);
    throw error;
  }
}

/**
 * Unified extraction function that handles both PDFs and URLs
 */
export async function extractImages(source, outputDir, options = {}) {
  const isUrl = typeof source === 'string' && (source.startsWith('http') || source.startsWith('https'));
  const isPdf = typeof source === 'string' && (source.endsWith('.pdf') || !isUrl);

  if (isUrl) {
    return await extractImagesFromUrl(source, options.apiKey, options);
  } else if (isPdf) {
    return await extractImagesFromPDF(source, outputDir, options);
  } else {
    throw new Error('Invalid source: must be a PDF file path or URL');
  }
}