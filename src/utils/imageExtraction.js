import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import sharp from 'sharp';

const execAsync = promisify(exec);

/**
 * Image extraction utility with lossless pdfimages (poppler) primary method
 * and pdftoppm fallback for PDF processing
 */

/**
 * Check if poppler-utils (pdfimages) is available
 */
async function checkPopplerAvailability() {
  try {
    await execAsync('pdfimages -v');
    return true;
  } catch (error) {
    console.warn('pdfimages not available, will use fallback method');
    return false;
  }
}

/**
 * Extract images from PDF using pdfimages (lossless method)
 */
async function extractWithPdfImages(pdfPath, outputDir) {
  await fsPromises.mkdir(outputDir, { recursive: true });
  
  const baseOutputPath = path.join(outputDir, 'extracted');
  
  try {
    // Use pdfimages to extract images losslessly
    // -j: extract JPEG images without recompression
    // -jp2: extract JPEG2000 images
    // -png: extract PNG images
    // -tiff: extract TIFF images
    const command = `pdfimages -j -jp2 -png -tiff "${pdfPath}" "${baseOutputPath}"`;
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('Warning')) {
      console.warn('pdfimages warnings:', stderr);
    }
    
    // Find extracted files
    const files = await fsPromises.readdir(outputDir);
    const imageFiles = files
      .filter(file => /\.(jpg|jpeg|png|tiff|jp2)$/i.test(file))
      .map(file => path.join(outputDir, file));
    
    console.log(`Extracted ${imageFiles.length} images using pdfimages`);
    return imageFiles;
    
  } catch (error) {
    console.error('pdfimages extraction failed:', error.message);
    throw error;
  }
}

/**
 * Extract images from PDF using pdftoppm (fallback method)
 */
async function extractWithPdftoppm(pdfPath, outputDir) {
  await fsPromises.mkdir(outputDir, { recursive: true });
  
  try {
    // Use pdftoppm to render pages as PNG images
    // -png: output PNG format
    // -r 300: 300 DPI resolution for high quality
    const baseOutputPath = path.join(outputDir, 'page');
    const command = `pdftoppm -png -r 300 "${pdfPath}" "${baseOutputPath}"`;
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.warn('pdftoppm warnings:', stderr);
    }
    
    // Find generated files
    const files = await fsPromises.readdir(outputDir);
    const imageFiles = files
      .filter(file => file.startsWith('page') && file.endsWith('.png'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.match(/(\d+)/)?.[1] || '0');
        return aNum - bNum;
      })
      .map(file => path.join(outputDir, file));
    
    console.log(`Rendered ${imageFiles.length} pages using pdftoppm`);
    return imageFiles;
    
  } catch (error) {
    console.error('pdftoppm extraction failed:', error.message);
    throw error;
  }
}

/**
 * Main PDF image extraction function with strategy selection
 */
export async function extractImagesFromPDF(pdfPath, outputDir, strategy = 'auto') {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }
  
  const extractionResults = {
    strategy: null,
    images: [],
    metadata: {
      originalPdf: pdfPath,
      outputDirectory: outputDir,
      extractionTime: new Date().toISOString()
    }
  };
  
  try {
    if (strategy === 'auto' || strategy === 'pdfimages') {
      const hasPdfImages = await checkPopplerAvailability();
      
      if (hasPdfImages) {
        try {
          extractionResults.images = await extractWithPdfImages(pdfPath, outputDir);
          extractionResults.strategy = 'pdfimages';
          return extractionResults;
        } catch (error) {
          console.warn('pdfimages failed, falling back to pdftoppm');
        }
      }
    }
    
    // Fallback to pdftoppm
    extractionResults.images = await extractWithPdftoppm(pdfPath, outputDir);
    extractionResults.strategy = 'pdftoppm';
    return extractionResults;
    
  } catch (error) {
    console.error('All extraction methods failed:', error.message);
    throw new Error(`Failed to extract images from PDF: ${error.message}`);
  }
}

/**
 * Validate and filter image files by format and size
 */
export async function validateAndFilterImages(imagePaths, minSizeBytes = 1024) {
  const validImages = [];
  
  for (const imagePath of imagePaths) {
    try {
      const stats = await fsPromises.stat(imagePath);
      
      if (stats.size < minSizeBytes) {
        console.log(`Skipping small image: ${imagePath} (${stats.size} bytes)`);
        continue;
      }
      
      // Validate image using sharp
      const metadata = await sharp(imagePath).metadata();
      
      if (metadata.width && metadata.height) {
        validImages.push({
          path: imagePath,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: stats.size,
          channels: metadata.channels
        });
      }
      
    } catch (error) {
      console.warn(`Invalid image file: ${imagePath}`, error.message);
    }
  }
  
  return validImages;
}

/**
 * Extract images from a directory of PDFs in batch
 */
export async function batchExtractImages(inputDir, outputDir) {
  const pdfFiles = (await fsPromises.readdir(inputDir))
    .filter(file => path.extname(file).toLowerCase() === '.pdf')
    .map(file => path.join(inputDir, file));
  
  const results = [];
  
  for (const pdfFile of pdfFiles) {
    const pdfName = path.basename(pdfFile, '.pdf');
    const pdfOutputDir = path.join(outputDir, pdfName);
    
    try {
      console.log(`Processing: ${pdfFile}`);
      const result = await extractImagesFromPDF(pdfFile, pdfOutputDir);
      results.push({ pdf: pdfFile, ...result });
    } catch (error) {
      console.error(`Failed to process ${pdfFile}:`, error.message);
      results.push({ pdf: pdfFile, error: error.message });
    }
  }
  
  return results;
}