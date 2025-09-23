#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { processImage } = require('../src/utils/imageProcessing');
const { calculatePerceptualHash } = require('../src/utils/imageMatching');

/**
 * Main CLI script for extracting images from PDFs
 * Prefers pdfimages (Poppler) for lossless extraction
 * Falls back to pdftoppm for page rendering if pdfimages is unavailable
 */

function printUsage() {
  console.log(`
Usage: npm run images:extract <input.pdf> <output_dir>

Extract images from a PDF and process them for video production workflows.

Arguments:
  input.pdf    Path to input PDF file
  output_dir   Directory to store extracted images and metadata

Examples:
  npm run images:extract manual.pdf extracted_images
  node scripts/extract_images.js manual.pdf output

Output:
  - output_dir/images/*.png (lossless masters)
  - output_dir/images/*.jpg (web derivatives) 
  - output_dir/images/thumbnails/*.jpg (thumbnails)
  - output_dir/images.json (structured metadata)
`);
}

function checkSystemRequirements() {
  const requirements = {
    pdfimages: false,
    pdftoppm: false,
    sharp: false
  };

  try {
    execSync('pdfimages -v', { stdio: 'ignore' });
    requirements.pdfimages = true;
  } catch (e) {
    // pdfimages not available
  }

  try {
    execSync('pdftoppm -v', { stdio: 'ignore' });
    requirements.pdftoppm = true;
  } catch (e) {
    // pdftoppm not available
  }

  try {
    require('sharp');
    requirements.sharp = true;
  } catch (e) {
    console.error('ERROR: Sharp is required but not installed. Run: npm install sharp');
    process.exit(1);
  }

  if (!requirements.pdfimages && !requirements.pdftoppm) {
    console.error('ERROR: Neither pdfimages nor pdftoppm are available.');
    console.error('Please install poppler-utils: apt-get install poppler-utils');
    process.exit(1);
  }

  return requirements;
}

async function extractImagesWithPdfimages(pdfPath, outputDir) {
  console.log('Using pdfimages for lossless image extraction...');
  
  const tempDir = path.join(outputDir, 'temp_extracted');
  await fs.promises.mkdir(tempDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const prefix = path.join(tempDir, 'img');
    const process = spawn('pdfimages', ['-all', pdfPath, prefix]);

    process.on('close', async (code) => {
      if (code === 0) {
        try {
          const files = await fs.promises.readdir(tempDir);
          const imageFiles = files
            .filter(f => /\.(png|jpg|jpeg|pbm|ppm)$/i.test(f))
            .map(f => path.join(tempDir, f));
          resolve(imageFiles);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`pdfimages failed with code ${code}`));
      }
    });

    process.on('error', reject);
  });
}

async function extractImagesWithPdftoppm(pdfPath, outputDir) {
  console.log('Using pdftoppm for page rendering...');
  
  const tempDir = path.join(outputDir, 'temp_pages');
  await fs.promises.mkdir(tempDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const prefix = path.join(tempDir, 'page');
    const process = spawn('pdftoppm', ['-png', '-r', '300', pdfPath, prefix]);

    process.on('close', async (code) => {
      if (code === 0) {
        try {
          const files = await fs.promises.readdir(tempDir);
          const imageFiles = files
            .filter(f => f.endsWith('.png'))
            .sort()
            .map(f => path.join(tempDir, f));
          resolve(imageFiles);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`pdftoppm failed with code ${code}`));
      }
    });

    process.on('error', reject);
  });
}

async function createOutputDirectories(outputDir) {
  const dirs = [
    outputDir,
    path.join(outputDir, 'images'),
    path.join(outputDir, 'images', 'thumbnails')
  ];

  for (const dir of dirs) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

async function processExtractedImages(extractedFiles, outputDir) {
  const results = [];
  const imagesDir = path.join(outputDir, 'images');
  const thumbnailsDir = path.join(outputDir, 'images', 'thumbnails');

  console.log(`Processing ${extractedFiles.length} extracted images...`);

  for (let i = 0; i < extractedFiles.length; i++) {
    const inputFile = extractedFiles[i];
    const baseName = `image_${i + 1}`;
    
    console.log(`Processing ${baseName}...`);

    try {
      // Process the image to create all variants
      const processed = await processImage(inputFile, imagesDir, thumbnailsDir, baseName);
      
      // Calculate perceptual hash
      const hash = await calculatePerceptualHash(processed.masterPath);
      
      // Get image dimensions and metadata
      const sharp = require('sharp');
      const metadata = await sharp(processed.masterPath).metadata();

      const imageData = {
        id: baseName,
        originalPath: inputFile,
        masterPath: processed.masterPath,
        webPath: processed.webPath,
        thumbnailPath: processed.thumbnailPath,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        density: metadata.density,
        perceptualHash: hash,
        extractedAt: new Date().toISOString()
      };

      results.push(imageData);

    } catch (err) {
      console.error(`Failed to process ${baseName}:`, err.message);
      // Continue with next image
    }
  }

  return results;
}

async function saveMetadata(images, outputDir) {
  const metadata = {
    extractionMethod: images.length > 0 ? 'success' : 'failed',
    totalImages: images.length,
    extractedAt: new Date().toISOString(),
    images: images
  };

  const metadataPath = path.join(outputDir, 'images.json');
  await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  
  console.log(`\nMetadata saved to: ${metadataPath}`);
  return metadataPath;
}

async function cleanupTempFiles(outputDir) {
  const tempDirs = [
    path.join(outputDir, 'temp_extracted'),
    path.join(outputDir, 'temp_pages')
  ];

  for (const dir of tempDirs) {
    try {
      if (fs.existsSync(dir)) {
        await fs.promises.rm(dir, { recursive: true });
      }
    } catch (err) {
      console.warn(`Failed to cleanup temp directory ${dir}:`, err.message);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const [inputPdf, outputDir] = args;

  if (!fs.existsSync(inputPdf)) {
    console.error(`ERROR: Input file not found: ${inputPdf}`);
    process.exit(1);
  }

  if (!inputPdf.toLowerCase().endsWith('.pdf')) {
    console.error('ERROR: Input file must be a PDF');
    process.exit(1);
  }

  console.log('🔍 Checking system requirements...');
  const requirements = checkSystemRequirements();
  
  console.log('📁 Creating output directories...');
  await createOutputDirectories(outputDir);

  try {
    let extractedFiles = [];

    // Try pdfimages first for lossless extraction
    if (requirements.pdfimages) {
      try {
        extractedFiles = await extractImagesWithPdfimages(inputPdf, outputDir);
        if (extractedFiles.length === 0) {
          throw new Error('No images found with pdfimages');
        }
      } catch (err) {
        console.warn('pdfimages failed:', err.message);
        console.log('Falling back to pdftoppm...');
        extractedFiles = [];
      }
    }

    // Fall back to pdftoppm if pdfimages failed or unavailable
    if (extractedFiles.length === 0 && requirements.pdftoppm) {
      extractedFiles = await extractImagesWithPdftoppm(inputPdf, outputDir);
    }

    if (extractedFiles.length === 0) {
      throw new Error('No images could be extracted from the PDF');
    }

    console.log(`✅ Extracted ${extractedFiles.length} images`);

    // Process all extracted images
    const processedImages = await processExtractedImages(extractedFiles, outputDir);

    // Save structured metadata
    await saveMetadata(processedImages, outputDir);

    // Cleanup temporary files
    await cleanupTempFiles(outputDir);

    console.log(`\n🎉 Extraction complete!`);
    console.log(`📄 ${processedImages.length} images processed and saved to: ${outputDir}`);
    console.log(`🖼️  Master PNGs: ${path.join(outputDir, 'images')}/*.png`);
    console.log(`🌐 Web JPEGs: ${path.join(outputDir, 'images')}/*.jpg`);
    console.log(`🔍 Thumbnails: ${path.join(outputDir, 'images', 'thumbnails')}/*.jpg`);
    console.log(`📊 Metadata: ${path.join(outputDir, 'images.json')}`);

  } catch (err) {
    console.error('❌ Extraction failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };