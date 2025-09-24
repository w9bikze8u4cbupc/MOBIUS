#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { extractImagesFromPDF, batchExtractImages, validateAndFilterImages } from '../utils/imageExtraction.js';
import { processImageDerivatives, batchProcessImages, getProcessingStats } from '../utils/imageProcessing.js';
import { buildHashDatabase, findSimilarImages, deduplicateImages, loadHashDatabase, findMatchesInDatabase } from '../utils/perceptualHashing.js';

const program = new Command();

/**
 * Bulk pHash Utility
 * Command-line tool for batch processing images with perceptual hashing
 */

program
  .name('bulk-phash')
  .description('Bulk perceptual hashing utility for image processing and matching')
  .version('1.0.0');

// Extract images from PDFs
program
  .command('extract')
  .description('Extract images from PDF files')
  .argument('<input>', 'PDF file or directory containing PDFs')
  .option('-o, --output <dir>', 'Output directory', './extracted')
  .option('-s, --strategy <strategy>', 'Extraction strategy: auto, pdfimages, pdftoppm', 'auto')
  .option('-m, --min-size <bytes>', 'Minimum image size in bytes', '1024')
  .action(async (input, options) => {
    try {
      console.log(`Starting extraction from: ${input}`);
      console.log(`Output directory: ${options.output}`);
      console.log(`Strategy: ${options.strategy}`);
      
      const inputStat = await fsPromises.stat(input);
      let results;
      
      if (inputStat.isDirectory()) {
        // Batch extract from directory
        results = await batchExtractImages(input, options.output);
        
        console.log('\n=== Batch Extraction Results ===');
        results.forEach((result, index) => {
          console.log(`\n${index + 1}. ${path.basename(result.pdf)}`);
          if (result.error) {
            console.log(`   ERROR: ${result.error}`);
          } else {
            console.log(`   Strategy: ${result.strategy}`);
            console.log(`   Images: ${result.images.length}`);
          }
        });
        
      } else if (path.extname(input).toLowerCase() === '.pdf') {
        // Single PDF extraction
        results = await extractImagesFromPDF(input, options.output, options.strategy);
        
        console.log('\n=== Extraction Results ===');
        console.log(`Strategy: ${results.strategy}`);
        console.log(`Images extracted: ${results.images.length}`);
        
        if (results.images.length > 0) {
          const validImages = await validateAndFilterImages(results.images, parseInt(options.minSize));
          console.log(`Valid images: ${validImages.length}`);
          
          console.log('\nExtracted images:');
          validImages.forEach((img, index) => {
            console.log(`  ${index + 1}. ${path.basename(img.path)} (${img.width}x${img.height}, ${img.format})`);
          });
        }
        
      } else {
        throw new Error('Input must be a PDF file or directory containing PDFs');
      }
      
      console.log('\nExtraction completed successfully!');
      
    } catch (error) {
      console.error('Extraction failed:', error.message);
      process.exit(1);
    }
  });

// Process images to create derivatives
program
  .command('process')
  .description('Process images to create web derivatives and thumbnails')
  .argument('<input>', 'Image file, directory, or glob pattern')
  .option('-o, --output <dir>', 'Output directory', './processed')
  .option('-c, --concurrency <num>', 'Number of concurrent processes', '3')
  .option('--skip-existing', 'Skip files that already have outputs', true)
  .action(async (input, options) => {
    try {
      console.log(`Starting image processing: ${input}`);
      console.log(`Output directory: ${options.output}`);
      
      // Find input images
      let imagePaths = [];
      const inputStat = await fsPromises.stat(input);
      
      if (inputStat.isDirectory()) {
        const files = await fsPromises.readdir(input);
        imagePaths = files
          .filter(file => /\.(jpg|jpeg|png|tiff|bmp|webp)$/i.test(file))
          .map(file => path.join(input, file));
      } else {
        imagePaths = [input];
      }
      
      console.log(`Found ${imagePaths.length} images to process`);
      
      // Process images
      const results = await batchProcessImages(imagePaths, options.output, {
        concurrency: parseInt(options.concurrency),
        skipExisting: options.skipExisting
      });
      
      // Display statistics
      const stats = getProcessingStats(results);
      
      console.log('\n=== Processing Results ===');
      console.log(`Total: ${stats.total}`);
      console.log(`Successful: ${stats.successful}`);
      console.log(`Skipped: ${stats.skipped}`);
      console.log(`Failed: ${stats.failed}`);
      console.log(`Total outputs: ${stats.totalOutputs}`);
      console.log('\nOutput types:');
      console.log(`  Masters: ${stats.outputTypes.master}`);
      console.log(`  Web derivatives: ${stats.outputTypes.web}`);
      console.log(`  Thumbnails: ${stats.outputTypes.thumbnail}`);
      
      if (stats.failed > 0) {
        console.log('\nErrors:');
        results.filter(r => r.errors?.length > 0).forEach(result => {
          console.log(`  ${path.basename(result.input)}:`);
          result.errors.forEach(err => {
            console.log(`    ${err.type}: ${err.error}`);
          });
        });
      }
      
      console.log('\nProcessing completed!');
      
    } catch (error) {
      console.error('Processing failed:', error.message);
      process.exit(1);
    }
  });

// Build hash database
program
  .command('hash')
  .description('Build perceptual hash database for images')
  .argument('<input>', 'Directory containing images')
  .option('-o, --output <file>', 'Output database file', './hash-database.json')
  .option('-r, --recursive', 'Scan directories recursively', false)
  .action(async (input, options) => {
    try {
      console.log(`Building hash database from: ${input}`);
      
      // Find all images
      const imagePaths = [];
      
      async function scanDirectory(dir) {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && options.recursive) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && /\.(jpg|jpeg|png|tiff|bmp|webp)$/i.test(entry.name)) {
            imagePaths.push(fullPath);
          }
        }
      }
      
      const inputStat = await fsPromises.stat(input);
      if (inputStat.isDirectory()) {
        await scanDirectory(input);
      } else {
        throw new Error('Input must be a directory');
      }
      
      console.log(`Found ${imagePaths.length} images`);
      
      // Build database
      const database = await buildHashDatabase(imagePaths, options.output);
      
      console.log('\n=== Hash Database Results ===');
      console.log(`Images processed: ${database.totalImages}`);
      console.log(`Successful hashes: ${database.successCount}`);
      console.log(`Errors: ${database.errorCount}`);
      console.log(`Database saved: ${options.output}`);
      
    } catch (error) {
      console.error('Hashing failed:', error.message);
      process.exit(1);
    }
  });

// Find similar images
program
  .command('match')
  .description('Find similar images using perceptual hashing')
  .argument('<target>', 'Target image to match against')
  .argument('<candidates>', 'Directory or database file containing candidate images')
  .option('-t, --threshold <num>', 'Similarity threshold (0.0-1.0)', '0.90')
  .option('-d, --database', 'Treat candidates as database file instead of directory', false)
  .option('-o, --output <file>', 'Save results to JSON file')
  .action(async (target, candidates, options) => {
    try {
      console.log(`Finding matches for: ${target}`);
      console.log(`Searching in: ${candidates}`);
      console.log(`Threshold: ${options.threshold}`);
      
      let results;
      const threshold = parseFloat(options.threshold);
      
      if (options.database) {
        // Load database and search
        const database = await loadHashDatabase(candidates);
        results = await findMatchesInDatabase(target, database, threshold);
        
      } else {
        // Directory scan
        const candidatePaths = [];
        
        async function scanDir(dir) {
          const entries = await fsPromises.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              await scanDir(fullPath);
            } else if (/\.(jpg|jpeg|png|tiff|bmp|webp)$/i.test(entry.name)) {
              candidatePaths.push(fullPath);
            }
          }
        }
        
        const candidateStat = await fsPromises.stat(candidates);
        if (candidateStat.isDirectory()) {
          await scanDir(candidates);
        } else {
          throw new Error('Candidates must be a directory or database file (use --database flag)');
        }
        
        results = await findSimilarImages(target, candidatePaths, threshold);
      }
      
      console.log('\n=== Match Results ===');
      console.log(`Target: ${results.targetImage}`);
      console.log(`Hash: ${results.targetHash}`);
      console.log(`Candidates: ${results.totalCandidates || results.databaseSize}`);
      console.log(`Matches found: ${results.matches.length}`);
      
      if (results.matches.length > 0) {
        console.log('\nTop matches:');
        results.matches.slice(0, 10).forEach((match, index) => {
          const imagePath = match.candidatePath || match.imagePath;
          console.log(`  ${index + 1}. ${path.basename(imagePath)} (${match.percentage}% similar)`);
        });
      }
      
      // Save results if requested
      if (options.output) {
        await fsPromises.writeFile(options.output, JSON.stringify(results, null, 2));
        console.log(`\nResults saved to: ${options.output}`);
      }
      
    } catch (error) {
      console.error('Matching failed:', error.message);
      process.exit(1);
    }
  });

// Deduplicate images
program
  .command('dedupe')
  .description('Remove duplicate images using perceptual hashing')
  .argument('<input>', 'Directory containing images to deduplicate')
  .option('-t, --threshold <num>', 'Similarity threshold (0.0-1.0)', '0.95')
  .option('-o, --output <file>', 'Save deduplication report to JSON file')
  .option('--dry-run', 'Show what would be removed without actually deleting', false)
  .action(async (input, options) => {
    try {
      console.log(`Deduplicating images in: ${input}`);
      console.log(`Threshold: ${options.threshold}`);
      
      // Find all images
      const imagePaths = [];
      
      async function scanDir(dir) {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (/\.(jpg|jpeg|png|tiff|bmp|webp)$/i.test(entry.name)) {
            imagePaths.push(fullPath);
          }
        }
      }
      
      await scanDir(input);
      console.log(`Found ${imagePaths.length} images to analyze`);
      
      // Perform deduplication analysis
      const results = await deduplicateImages(imagePaths, parseFloat(options.threshold));
      
      console.log('\n=== Deduplication Results ===');
      console.log(`Total processed: ${results.totalProcessed}`);
      console.log(`Unique images: ${results.unique.length}`);
      console.log(`Duplicates found: ${results.duplicates.length}`);
      
      if (results.duplicates.length > 0) {
        console.log('\nDuplicates:');
        results.duplicates.forEach((dup, index) => {
          console.log(`  ${index + 1}. ${path.basename(dup.duplicate)} -> ${path.basename(dup.original)} (${dup.similarity * 100}% similar)`);
        });
        
        if (!options.dryRun) {
          console.log('\nRemoving duplicate files...');
          for (const dup of results.duplicates) {
            await fsPromises.unlink(dup.duplicate);
            console.log(`Removed: ${dup.duplicate}`);
          }
        } else {
          console.log('\n(Dry run - no files were actually removed)');
        }
      }
      
      // Save report if requested
      if (options.output) {
        await fsPromises.writeFile(options.output, JSON.stringify(results, null, 2));
        console.log(`\nReport saved to: ${options.output}`);
      }
      
    } catch (error) {
      console.error('Deduplication failed:', error.message);
      process.exit(1);
    }
  });

program.parse();