#!/usr/bin/env node

/**
 * CLI Script for Enhanced Image Extraction
 * Usage: node scripts/extract-images.js <source> <output-dir> [options]
 */

import { extractImages } from '../src/utils/imageExtraction/extractor.js';
import { processImage, batchProcessImages } from '../src/utils/imageProcessing/processor.js';
import { findImageMatches, loadImageLibrary, batchMatchImages } from '../src/utils/imageMatching/matcher.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    source: null,
    outputDir: null,
    mode: 'extract', // extract, process, match, all
    apiKey: process.env.IMAGE_EXTRACTOR_API_KEY,
    libraryDir: null,
    preferPoppler: true,
    dpi: 150,
    format: 'png',
    autoProcess: false,
    autoMatch: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--mode') {
      options.mode = args[++i];
    } else if (arg === '--api-key') {
      options.apiKey = args[++i];
    } else if (arg === '--library') {
      options.libraryDir = args[++i];
    } else if (arg === '--dpi') {
      options.dpi = parseInt(args[++i]);
    } else if (arg === '--format') {
      options.format = args[++i];
    } else if (arg === '--no-poppler') {
      options.preferPoppler = false;
    } else if (arg === '--process') {
      options.autoProcess = true;
    } else if (arg === '--match') {
      options.autoMatch = true;
    } else if (!options.source) {
      options.source = arg;
    } else if (!options.outputDir) {
      options.outputDir = arg;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Enhanced Image Extraction CLI

USAGE:
  node scripts/extract-images.js <source> <output-dir> [options]

ARGUMENTS:
  source      PDF file path or URL to extract images from
  output-dir  Directory to save extracted images

OPTIONS:
  --mode <mode>        Operation mode: extract, process, match, all (default: extract)
  --api-key <key>      API key for URL extraction (or set IMAGE_EXTRACTOR_API_KEY env var)
  --library <dir>      Library directory for image matching
  --dpi <number>       DPI for PDF extraction (default: 150)
  --format <format>    Output format: png, jpg (default: png)
  --no-poppler         Disable poppler, use pdf-to-img only
  --process            Auto-process extracted images for quality improvements
  --match              Auto-match extracted images against library
  --help, -h           Show this help message

EXAMPLES:
  # Extract images from PDF
  node scripts/extract-images.js rulebook.pdf ./extracted

  # Extract and process images with quality improvements
  node scripts/extract-images.js rulebook.pdf ./extracted --process

  # Extract, process, and match against library
  node scripts/extract-images.js rulebook.pdf ./extracted --process --match --library ./game-library

  # Extract from URL
  node scripts/extract-images.js https://example.com/page ./extracted --api-key YOUR_KEY

  # Full pipeline
  node scripts/extract-images.js rulebook.pdf ./extracted --mode all --library ./game-library

ENVIRONMENT VARIABLES:
  IMAGE_EXTRACTOR_API_KEY  API key for URL extraction
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.source || !options.outputDir) {
    console.error('❌ Error: Source and output directory are required');
    showHelp();
    process.exit(1);
  }

  console.log('🚀 Enhanced Image Extraction Pipeline');
  console.log('=====================================');
  console.log(`Source: ${options.source}`);
  console.log(`Output: ${options.outputDir}`);
  console.log(`Mode: ${options.mode}`);
  console.log('');

  try {
    let extractionResult = null;
    let processingResults = null;
    let matchingResults = null;

    // Phase 1: Extraction
    if (options.mode === 'extract' || options.mode === 'all' || options.autoProcess || options.autoMatch) {
      console.log('📦 Phase 1: Image Extraction');
      console.log('----------------------------');
      
      const extractionOptions = {
        preferPoppler: options.preferPoppler,
        dpi: options.dpi,
        format: options.format,
        generateThumbnails: true,
        apiKey: options.apiKey
      };

      extractionResult = await extractImages(options.source, options.outputDir, extractionOptions);
      
      console.log(`✅ Extracted ${extractionResult.images.length} images using ${extractionResult.method}`);
      console.log(`📁 Images saved to: ${options.outputDir}`);
      console.log('');
    }

    // Phase 2: Processing (if enabled)
    if (options.autoProcess || options.mode === 'process' || options.mode === 'all') {
      console.log('🔧 Phase 2: Image Processing');
      console.log('----------------------------');
      
      const imagePaths = extractionResult ? 
        extractionResult.images.map(img => img.path) :
        await getImagePathsFromDirectory(options.outputDir);

      if (imagePaths.length === 0) {
        console.log('⚠️ No images found for processing');
      } else {
        const processedDir = path.join(options.outputDir, 'processed');
        const processingOptions = {
          autoCrop: true,
          autoContrast: true,
          deskew: true,
          quality: 95
        };

        processingResults = await batchProcessImages(imagePaths, processedDir, processingOptions);
        
        const successful = processingResults.filter(r => r.success).length;
        console.log(`✅ Processed ${successful}/${imagePaths.length} images`);
        console.log(`📁 Processed images saved to: ${processedDir}`);
        console.log('');
      }
    }

    // Phase 3: Matching (if enabled)
    if (options.autoMatch || options.mode === 'match' || options.mode === 'all') {
      if (!options.libraryDir) {
        console.log('⚠️ Library directory not specified, skipping matching phase');
      } else {
        console.log('🔍 Phase 3: Image Matching');
        console.log('-------------------------');
        
        // Load library images
        console.log(`📚 Loading library from: ${options.libraryDir}`);
        const libraryImages = await loadImageLibrary(options.libraryDir, {
          generateHashes: true,
          includeSubdirs: true
        });

        if (libraryImages.length === 0) {
          console.log('⚠️ No images found in library directory');
        } else {
          console.log(`✅ Loaded ${libraryImages.length} library images`);

          // Get query images (use processed if available, otherwise extracted)
          const queryImages = processingResults ? 
            processingResults.filter(r => r.success).map(r => r.outputPath) :
            extractionResult ? 
              extractionResult.images.map(img => img.path) :
              await getImagePathsFromDirectory(options.outputDir);

          if (queryImages.length === 0) {
            console.log('⚠️ No query images found for matching');
          } else {
            const matchingOptions = {
              algorithm: 'phash',
              maxDistance: 10,
              minSimilarity: 0.75,
              maxCandidates: 5,
              saveReport: true,
              outputDir: options.outputDir
            };

            matchingResults = await batchMatchImages(queryImages, libraryImages, matchingOptions);
            
            console.log(`✅ Matched ${matchingResults.successful}/${queryImages.length} images`);
            console.log(`🎯 High confidence: ${matchingResults.highConfidence}`);
            console.log(`🎯 Medium confidence: ${matchingResults.mediumConfidence}`);
            console.log(`🎯 Low confidence: ${matchingResults.lowConfidence}`);
            console.log('');
          }
        }
      }
    }

    // Summary Report
    console.log('📊 Pipeline Summary');
    console.log('==================');
    
    if (extractionResult) {
      console.log(`📦 Extraction: ${extractionResult.images.length} images (${extractionResult.method})`);
    }
    
    if (processingResults) {
      const successful = processingResults.filter(r => r.success).length;
      console.log(`🔧 Processing: ${successful}/${processingResults.length} images enhanced`);
    }
    
    if (matchingResults) {
      console.log(`🔍 Matching: ${matchingResults.successful}/${matchingResults.totalQueries} images matched`);
      console.log(`   - High confidence: ${matchingResults.highConfidence}`);
      console.log(`   - Medium confidence: ${matchingResults.mediumConfidence}`);
      console.log(`   - Low confidence: ${matchingResults.lowConfidence}`);
    }

    console.log('');
    console.log('🎉 Pipeline completed successfully!');
    console.log(`📁 Results saved to: ${options.outputDir}`);

  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Helper function to get image paths from directory
async function getImagePathsFromDirectory(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const imagePaths = [];
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.bmp', '.tiff'].includes(ext)) {
          imagePaths.push(path.join(dir, entry.name));
        }
      }
    }
    
    return imagePaths;
  } catch (error) {
    console.error(`Failed to read directory ${dir}:`, error.message);
    return [];
  }
}

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}