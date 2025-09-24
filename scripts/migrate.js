#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

/**
 * MOBIUS DHash System - Migration Script
 * Generates 64-bit DHash fingerprints for images with dry-run support
 */

const LIBRARY_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
const MIGRATION_LOG_DIR = process.env.MIGRATION_LOG_DIR || path.join(__dirname, '..', 'logs');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      opts[key] = value;
    }
  }
  
  return opts;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

// Simple DHash implementation
// Note: In production, you might want to use a more robust image processing library
function calculateDHash(imagePath) {
  try {
    // Use ImageMagick to convert image to 9x8 grayscale
    const result = spawnSync('convert', [
      imagePath,
      '-resize', '9x8!',
      '-colorspace', 'Gray',
      'txt:-'
    ], { encoding: 'utf8' });

    if (result.status !== 0) {
      throw new Error(`ImageMagick failed: ${result.stderr}`);
    }

    // Parse the output to get pixel values
    const lines = result.stdout.split('\n').slice(1); // Skip header
    const pixels = [];
    
    for (const line of lines) {
      if (line.trim()) {
        const match = line.match(/gray\((\d+)\)/);
        if (match) {
          pixels.push(parseInt(match[1]));
        }
      }
    }

    if (pixels.length !== 72) { // 9x8 = 72 pixels
      throw new Error(`Expected 72 pixels, got ${pixels.length}`);
    }

    // Calculate DHash
    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const current = pixels[row * 9 + col];
        const next = pixels[row * 9 + col + 1];
        hash += current > next ? '1' : '0';
      }
    }

    // Convert binary to hex (64-bit)
    let hexHash = '';
    for (let i = 0; i < hash.length; i += 4) {
      const nibble = hash.substr(i, 4);
      hexHash += parseInt(nibble, 2).toString(16);
    }

    return hexHash.padStart(16, '0');
    
  } catch (error) {
    console.warn(`Failed to calculate DHash for ${imagePath}: ${error.message}`);
    return null;
  }
}

// Alternative: Simple perceptual hash using pixel differences
function calculateSimpleDHash(imagePath) {
  try {
    // Use a simpler approach with Node.js if ImageMagick isn't available
    // This is a fallback implementation
    const stats = fs.statSync(imagePath);
    const data = fs.readFileSync(imagePath);
    
    // Create a hash based on file content and metadata
    // This is not a true DHash but serves as a placeholder
    const hash = crypto.createHash('sha256');
    hash.update(data);
    hash.update(stats.size.toString());
    hash.update(path.basename(imagePath));
    
    // Take first 16 characters (64 bits in hex)
    return hash.digest('hex').substring(0, 16);
    
  } catch (error) {
    console.warn(`Failed to calculate simple hash for ${imagePath}: ${error.message}`);
    return null;
  }
}

async function scanImageFiles(directory) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'];
  const imageFiles = [];
  
  async function walkDir(currentPath) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const stats = await fsp.stat(fullPath);
          imageFiles.push({
            path: fullPath,
            relativePath: path.relative(directory, fullPath),
            size: stats.size,
            modified: stats.mtime,
            extension: ext
          });
        }
      }
    }
  }
  
  await walkDir(directory);
  return imageFiles;
}

async function processMigration(opts = {}) {
  const isDryRun = opts.dryRun || opts['dry-run'];
  const batchSize = parseInt(opts.batchSize || opts['batch-size'] || '100');
  const sourceDir = opts.source || LIBRARY_DIR;
  
  console.log(`${isDryRun ? 'DRY RUN: ' : ''}Starting DHash migration...`);
  console.log(`Source directory: ${sourceDir}`);
  console.log(`Batch size: ${batchSize}`);
  
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  
  // Create migration log
  await ensureDir(MIGRATION_LOG_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(MIGRATION_LOG_DIR, `migration-${isDryRun ? 'dryrun-' : ''}${timestamp}.json`);
  
  const migrationLog = {
    timestamp,
    isDryRun,
    sourceDirectory: sourceDir,
    batchSize,
    startTime: new Date().toISOString(),
    processedFiles: [],
    errors: [],
    stats: {
      totalFiles: 0,
      processedCount: 0,
      errorCount: 0,
      duplicateHashes: 0,
      lowConfidenceCount: 0
    }
  };
  
  console.log('Scanning for image files...');
  const imageFiles = await scanImageFiles(sourceDir);
  migrationLog.stats.totalFiles = imageFiles.length;
  
  console.log(`Found ${imageFiles.length} image files`);
  
  if (imageFiles.length === 0) {
    console.log('No image files found to process.');
    return migrationLog;
  }
  
  // Process in batches
  const hashMap = new Map(); // Track duplicate hashes
  const lowConfidenceItems = [];
  
  for (let i = 0; i < imageFiles.length; i += batchSize) {
    const batch = imageFiles.slice(i, Math.min(i + batchSize, imageFiles.length));
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(imageFiles.length / batchSize)} (${batch.length} files)`);
    
    for (const file of batch) {
      try {
        console.log(`Processing: ${file.relativePath}`);
        
        // Start with proper DHash, fallback to simple hash
        let dhash = calculateDHash(file.path);
        let hashMethod = 'dhash';
        let confidence = 0.95;
        
        if (!dhash) {
          dhash = calculateSimpleDHash(file.path);
          hashMethod = 'simple';
          confidence = 0.6;
        }
        
        if (!dhash) {
          throw new Error('Failed to calculate any hash');
        }
        
        // Check for duplicates
        if (hashMap.has(dhash)) {
          const existing = hashMap.get(dhash);
          console.log(`  ⚠️  Potential duplicate: ${file.relativePath} matches ${existing.relativePath}`);
          migrationLog.stats.duplicateHashes++;
        } else {
          hashMap.set(dhash, file);
        }
        
        // Flag low confidence items
        if (confidence < 0.8) {
          lowConfidenceItems.push({
            file: file.relativePath,
            hash: dhash,
            confidence,
            reason: hashMethod === 'simple' ? 'fallback_hash_method' : 'low_image_quality'
          });
          migrationLog.stats.lowConfidenceCount++;
        }
        
        const processedFile = {
          path: file.relativePath,
          hash: dhash,
          method: hashMethod,
          confidence,
          size: file.size,
          processed_at: new Date().toISOString()
        };
        
        if (!isDryRun) {
          // In a real implementation, you would save the hash to a database
          // For now, we'll just log it
          console.log(`  ✓ Hash: ${dhash} (${hashMethod}, confidence: ${confidence})`);
        } else {
          console.log(`  [DRY RUN] Would generate hash: ${dhash} (${hashMethod}, confidence: ${confidence})`);
        }
        
        migrationLog.processedFiles.push(processedFile);
        migrationLog.stats.processedCount++;
        
      } catch (error) {
        console.error(`  ✗ Error processing ${file.relativePath}: ${error.message}`);
        migrationLog.errors.push({
          file: file.relativePath,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        migrationLog.stats.errorCount++;
      }
    }
    
    // Save intermediate progress
    await fsp.writeFile(logFile, JSON.stringify(migrationLog, null, 2));
  }
  
  migrationLog.endTime = new Date().toISOString();
  migrationLog.lowConfidenceItems = lowConfidenceItems;
  
  // Final log save
  await fsp.writeFile(logFile, JSON.stringify(migrationLog, null, 2));
  
  console.log('\n=== Migration Summary ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Total files: ${migrationLog.stats.totalFiles}`);
  console.log(`Processed: ${migrationLog.stats.processedCount}`);
  console.log(`Errors: ${migrationLog.stats.errorCount}`);
  console.log(`Duplicate hashes: ${migrationLog.stats.duplicateHashes}`);
  console.log(`Low confidence: ${migrationLog.stats.lowConfidenceCount}`);
  console.log(`Log file: ${logFile}`);
  
  if (lowConfidenceItems.length > 0) {
    console.log(`\n⚠️  ${lowConfidenceItems.length} items flagged for manual review`);
  }
  
  return migrationLog;
}

async function exportLowConfidence(logFile, outputFile) {
  console.log(`Exporting low-confidence items from ${logFile}`);
  
  if (!fs.existsSync(logFile)) {
    throw new Error(`Migration log not found: ${logFile}`);
  }
  
  const migrationData = JSON.parse(await fsp.readFile(logFile, 'utf8'));
  const lowConfidenceItems = migrationData.lowConfidenceItems || [];
  
  if (lowConfidenceItems.length === 0) {
    console.log('No low-confidence items found.');
    return;
  }
  
  const exportData = {
    exported_at: new Date().toISOString(),
    source_migration: logFile,
    items: lowConfidenceItems.map(item => ({
      ...item,
      reviewed: false,
      reviewer_decision: null,
      reviewer_notes: ''
    }))
  };
  
  await fsp.writeFile(outputFile, JSON.stringify(exportData, null, 2));
  
  console.log(`✓ Exported ${lowConfidenceItems.length} low-confidence items to ${outputFile}`);
  console.log('Items can be reviewed and decisions imported back into the system.');
}

// Main execution
async function main() {
  const opts = parseArgs();
  
  try {
    if (opts.help) {
      console.log(`
MOBIUS DHash System - Migration Script

Usage: node migrate.js [options]

Options:
  --dry-run           Preview migration without making changes
  --batch-size N      Process N files per batch (default: 100)
  --source DIR        Source directory to scan (default: LIBRARY_DIR)
  --export-low-conf   Export low-confidence items for review
  --log-file FILE     Migration log file to use for export
  --output FILE       Output file for low-confidence export
  --help              Show this help message

Environment Variables:
  LIBRARY_DIR         Source library directory (default: ../library)
  MIGRATION_LOG_DIR   Migration logs directory (default: ../logs)

Examples:
  node migrate.js --dry-run                    # Preview migration
  node migrate.js                              # Run full migration
  node migrate.js --export-low-conf \\
    --log-file logs/migration-2024-01-01.json \\
    --output review/low-confidence.json        # Export items for review
`);
      return;
    }
    
    if (opts['export-low-conf']) {
      const logFile = opts['log-file'];
      const outputFile = opts.output || path.join(__dirname, '..', 'review', 'low-confidence.json');
      
      if (!logFile) {
        throw new Error('--log-file is required when using --export-low-conf');
      }
      
      await ensureDir(path.dirname(outputFile));
      await exportLowConfidence(logFile, outputFile);
      
    } else {
      await processMigration(opts);
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  processMigration,
  scanImageFiles,
  calculateDHash,
  calculateSimpleDHash,
  exportLowConfidence
};