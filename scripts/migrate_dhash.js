#!/usr/bin/env node

/**
 * DHash Migration Tool for MOBIUS Pipeline
 * Migrates existing image library to include DHash fingerprints
 */

const fs = require('fs');
const path = require('path');
const { DHashProcessor } = require('../src/dhash.js');

// CLI argument parsing
function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        args[key] = nextArg;
        i++; // Skip next arg since we consumed it
      } else {
        args[key] = true;
      }
    }
  }
  
  return args;
}

function printUsage() {
  console.log(`
Usage: npm run migrate:dhash [options]

Options:
  -i, --input <file>     Input library JSON file (required)
  -o, --output <file>    Output library JSON file (default: input file with .dhash suffix)
  --dry-run             Preview changes without writing output
  --batch-size <num>    Process images in batches (default: 100)
  --parallel <num>      Number of parallel workers (default: 4)
  --threshold <num>     Similarity threshold for duplicate detection (default: 10)
  --backup              Create backup of input file before migration
  --temp-dir <dir>      Temporary directory for processing (default: /tmp)

Examples:
  npm run migrate:dhash -i library.json -o library.dhash.json
  npm run migrate:dhash -i library.json --dry-run
  npm run migrate:dhash -i library.json --backup --batch-size 50
  `);
}

async function createBackup(inputPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${inputPath}.bak.${timestamp}`;
  
  console.log(`Creating backup: ${backupPath}`);
  fs.copyFileSync(inputPath, backupPath);
  
  // Verify backup integrity
  const originalSize = fs.statSync(inputPath).size;
  const backupSize = fs.statSync(backupPath).size;
  
  if (originalSize !== backupSize) {
    throw new Error(`Backup verification failed - size mismatch`);
  }
  
  console.log(`✓ Backup created and verified: ${backupPath}`);
  return backupPath;
}

async function loadLibrary(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Library file not found: ${filePath}`);
  }
  
  console.log(`Loading library: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const library = JSON.parse(content);
  
  console.log(`✓ Loaded library with ${library.images?.length || 0} images`);
  return library;
}

function validateLibraryFormat(library) {
  if (!library.images || !Array.isArray(library.images)) {
    throw new Error('Invalid library format - missing or invalid images array');
  }
  
  const requiredFields = ['path', 'filename'];
  const missingFields = [];
  
  library.images.forEach((img, index) => {
    requiredFields.forEach(field => {
      if (!img[field]) {
        missingFields.push(`images[${index}].${field}`);
      }
    });
  });
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  console.log(`✓ Library format validation passed`);
}

async function migrateLibrary(library, options = {}) {
  const processor = new DHashProcessor({
    tempDir: options.tempDir || '/tmp'
  });
  
  const batchSize = parseInt(options.batchSize || '100');
  const threshold = parseInt(options.threshold || '10');
  
  console.log(`Starting DHash migration...`);
  console.log(`- Processing ${library.images.length} images`);
  console.log(`- Batch size: ${batchSize}`);
  console.log(`- Similarity threshold: ${threshold}`);
  
  const startTime = Date.now();
  let processedCount = 0;
  const results = [];
  const duplicates = [];
  const errors = [];
  const hashIndex = new Map(); // For duplicate detection
  
  // Process images in batches
  for (let i = 0; i < library.images.length; i += batchSize) {
    const batch = library.images.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(library.images.length/batchSize)}...`);
    
    for (const image of batch) {
      try {
        const imagePath = path.resolve(image.path);
        
        if (!fs.existsSync(imagePath)) {
          errors.push({
            image: image.filename,
            error: `File not found: ${imagePath}`
          });
          continue;
        }
        
        // Generate DHash
        const hash = processor.generateHash(imagePath);
        
        // Check for duplicates
        const existing = hashIndex.get(hash);
        if (existing) {
          duplicates.push({
            original: existing,
            duplicate: image.filename,
            hash: hash,
            hammingDistance: 0 // Exact match
          });
        } else {
          // Check for near-duplicates
          for (const [existingHash, existingImage] of hashIndex.entries()) {
            const distance = processor.compareHashes(hash, existingHash);
            if (distance <= threshold && distance > 0) {
              duplicates.push({
                original: existingImage,
                duplicate: image.filename,
                hash: hash,
                originalHash: existingHash,
                hammingDistance: distance
              });
              break;
            }
          }
        }
        
        hashIndex.set(hash, image.filename);
        
        // Add DHash to image record
        image.dhash = hash;
        image.dhash_generated_at = new Date().toISOString();
        
        results.push({
          filename: image.filename,
          hash: hash,
          success: true
        });
        
        processedCount++;
        
      } catch (error) {
        errors.push({
          image: image.filename,
          error: error.message
        });
        console.warn(`Failed to process ${image.filename}: ${error.message}`);
      }
    }
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Generate migration statistics
  const stats = {
    migration_timestamp: new Date().toISOString(),
    total_images: library.images.length,
    processed_successfully: processedCount,
    processing_errors: errors.length,
    duplicates_found: duplicates.length,
    processing_time_seconds: duration,
    average_time_per_image: duration / library.images.length,
    dhash_threshold: threshold,
    batch_size: batchSize
  };
  
  // Add migration metadata to library
  library.dhash_migration = stats;
  library.dhash_duplicates = duplicates;
  library.dhash_errors = errors;
  
  return { library, stats, duplicates, errors };
}

function generateMigrationReport(stats, duplicates, errors) {
  console.log(`\n=== DHash Migration Report ===`);
  console.log(`Total images: ${stats.total_images}`);
  console.log(`Successfully processed: ${stats.processed_successfully}`);
  console.log(`Errors: ${stats.processing_errors}`);
  console.log(`Duplicates found: ${stats.duplicates_found}`);
  console.log(`Processing time: ${stats.processing_time_seconds.toFixed(2)}s`);
  console.log(`Average time per image: ${(stats.average_time_per_image * 1000).toFixed(2)}ms`);
  
  if (duplicates.length > 0) {
    console.log(`\n--- Duplicates Detected ---`);
    duplicates.forEach((dup, index) => {
      console.log(`${index + 1}. "${dup.duplicate}" similar to "${dup.original}" (distance: ${dup.hammingDistance})`);
    });
  }
  
  if (errors.length > 0) {
    console.log(`\n--- Processing Errors ---`);
    errors.forEach((err, index) => {
      console.log(`${index + 1}. ${err.image}: ${err.error}`);
    });
  }
  
  console.log(`\n=== Migration Complete ===\n`);
}

async function main() {
  const args = parseArgs();
  
  if (args.help || args.h || !args.input && !args.i) {
    printUsage();
    process.exit(args.help || args.h ? 0 : 1);
  }
  
  const inputPath = args.input || args.i;
  const outputPath = args.output || args.o || `${inputPath.replace(/\.json$/, '')}.dhash.json`;
  const isDryRun = args['dry-run'];
  
  try {
    // Create backup if requested
    if (args.backup && !isDryRun) {
      await createBackup(inputPath);
    }
    
    // Load and validate library
    const library = await loadLibrary(inputPath);
    validateLibraryFormat(library);
    
    // Migrate library
    const { library: migratedLibrary, stats, duplicates, errors } = await migrateLibrary(library, args);
    
    // Generate report
    generateMigrationReport(stats, duplicates, errors);
    
    if (isDryRun) {
      console.log(`DRY RUN: Would write migrated library to ${outputPath}`);
      console.log(`DRY RUN: No files were modified`);
    } else {
      // Write migrated library
      console.log(`Writing migrated library to ${outputPath}...`);
      fs.writeFileSync(outputPath, JSON.stringify(migratedLibrary, null, 2));
      console.log(`✓ Migration complete: ${outputPath}`);
    }
    
    // Exit with error if there were processing failures
    if (errors.length > 0) {
      console.warn(`Migration completed with ${errors.length} errors`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, migrateLibrary, loadLibrary, validateLibraryFormat };