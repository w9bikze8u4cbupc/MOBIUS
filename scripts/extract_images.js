#!/usr/bin/env node

/**
 * Image extraction script using poppler utilities
 * Extracts PNG masters (lossless) and web JPEG derivatives (1920px) 
 * with fallbacks from pdfimages to pdftoppm
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node extract_images.js <pdf_path> <output_dir>');
    console.error('Example: node extract_images.js "Wingspan Rulebook.pdf" extracted_components');
    process.exit(1);
  }
  return {
    pdfPath: args[0],
    outputDir: args[1]
  };
}

// Ensure output directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Try to extract embedded images first using pdfimages
async function extractEmbeddedImages(pdfPath, outputDir) {
  console.log('Attempting to extract embedded images with pdfimages...');
  
  const tempDir = path.join(outputDir, 'temp_embedded');
  ensureDir(tempDir);
  
  const pdfImagesProcess = spawnSync('pdfimages', [
    '-png',  // Extract as PNG when possible
    '-j',    // Extract JPEG images as JPEG
    pdfPath,
    path.join(tempDir, 'img')
  ], { stdio: 'pipe' });
  
  if (pdfImagesProcess.error) {
    console.log('pdfimages not available, will fallback to pdftoppm');
    return [];
  }
  
  if (pdfImagesProcess.status !== 0) {
    console.log('pdfimages failed or found no embedded images');
    return [];
  }
  
  // Find extracted images
  const extractedFiles = fs.readdirSync(tempDir)
    .filter(f => f.startsWith('img-') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')))
    .map(f => path.join(tempDir, f));
  
  console.log(`Found ${extractedFiles.length} embedded images`);
  return extractedFiles;
}

// Fallback: render PDF pages as images using pdftoppm
async function renderPdfPages(pdfPath, outputDir) {
  console.log('Using pdftoppm fallback to render PDF pages...');
  
  const tempDir = path.join(outputDir, 'temp_pages');
  ensureDir(tempDir);
  
  const pdftoppmProcess = spawnSync('pdftoppm', [
    '-png',              // Output as PNG
    '-r', '150',         // 150 DPI for good quality
    pdfPath,
    path.join(tempDir, 'page')
  ], { stdio: 'pipe' });
  
  if (pdftoppmProcess.error) {
    throw new Error('pdftoppm not available and no embedded images found');
  }
  
  if (pdftoppmProcess.status !== 0) {
    throw new Error('pdftoppm failed to render PDF pages');
  }
  
  // Find rendered pages
  const renderedFiles = fs.readdirSync(tempDir)
    .filter(f => f.startsWith('page-') && f.endsWith('.png'))
    .map(f => path.join(tempDir, f));
  
  console.log(`Rendered ${renderedFiles.length} PDF pages`);
  return renderedFiles;
}

// Process images: create web derivatives and normalize
async function processImages(imageFiles, outputDir) {
  console.log(`Processing ${imageFiles.length} images...`);
  
  const mastersDir = path.join(outputDir, 'masters');
  const webDir = path.join(outputDir, 'web');
  ensureDir(mastersDir);
  ensureDir(webDir);
  
  const processed = [];
  
  for (let i = 0; i < imageFiles.length; i++) {
    const inputFile = imageFiles[i];
    const basename = path.basename(inputFile, path.extname(inputFile));
    const masterFile = path.join(mastersDir, `${basename}.png`);
    const webFile = path.join(webDir, `${basename}.jpg`);
    
    try {
      const image = sharp(inputFile);
      const metadata = await image.metadata();
      
      // Save lossless master (PNG)
      await image
        .png({ quality: 100, compressionLevel: 0 })
        .toFile(masterFile);
      
      // Create web derivative (JPEG, max 1920px width)
      await image
        .resize(1920, 1920, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 })
        .toFile(webFile);
      
      processed.push({
        filename: `${basename}.png`,
        masterPath: masterFile,
        webPath: webFile,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: fs.statSync(inputFile).size
      });
      
      console.log(`Processed: ${basename} (${metadata.width}x${metadata.height})`);
    } catch (error) {
      console.error(`Failed to process ${inputFile}: ${error.message}`);
    }
  }
  
  return processed;
}

// Clean up temporary directories
function cleanup(outputDir) {
  const tempDirs = [
    path.join(outputDir, 'temp_embedded'),
    path.join(outputDir, 'temp_pages')
  ];
  
  tempDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

// Main extraction function
async function extractImages(pdfPath, outputDir) {
  console.log(`Starting image extraction from: ${pdfPath}`);
  console.log(`Output directory: ${outputDir}`);
  
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }
  
  ensureDir(outputDir);
  
  let imageFiles = [];
  
  try {
    // Try embedded images first
    imageFiles = await extractEmbeddedImages(pdfPath, outputDir);
    
    // If no embedded images, fallback to page rendering
    if (imageFiles.length === 0) {
      console.log('No embedded images found, falling back to page rendering...');
      imageFiles = await renderPdfPages(pdfPath, outputDir);
    }
    
    if (imageFiles.length === 0) {
      throw new Error('No images could be extracted from the PDF');
    }
    
    // Process the extracted/rendered images
    const processed = await processImages(imageFiles, outputDir);
    
    // Generate metadata file
    const metadata = {
      source_pdf: pdfPath,
      extraction_date: new Date().toISOString(),
      extraction_method: imageFiles.some(f => f.includes('temp_embedded')) ? 'embedded' : 'rendered',
      total_images: processed.length,
      images: processed
    };
    
    const metadataFile = path.join(outputDir, 'images.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    
    console.log(`\nExtraction complete!`);
    console.log(`- ${processed.length} images extracted`);
    console.log(`- Masters saved to: ${path.join(outputDir, 'masters')}`);
    console.log(`- Web derivatives saved to: ${path.join(outputDir, 'web')}`);
    console.log(`- Metadata saved to: ${metadataFile}`);
    
    return metadata;
    
  } finally {
    // Clean up temporary files
    cleanup(outputDir);
  }
}

// Main execution
async function main() {
  try {
    const { pdfPath, outputDir } = parseArgs();
    await extractImages(pdfPath, outputDir);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  extractImages,
  extractEmbeddedImages,
  renderPdfPages,
  processImages
};

// Run if called directly
if (require.main === module) {
  main();
}