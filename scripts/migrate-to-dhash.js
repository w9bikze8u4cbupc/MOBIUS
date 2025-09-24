#!/usr/bin/env node

/**
 * Migration tool to convert blockhash library entries to dhash format
 * Supports dual-hash transition period and backward compatibility
 */

import fs from 'fs/promises';
import path from 'path';
import { calculateDHash, DHASH_VERSION, DHASH_ALGORITHM, DHASH_BITS } from '../src/api/dhash.js';

const MIGRATION_VERSION = '1.0.0';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: null,
    mode: 'dual', // 'dual', 'replace', 'convert'
    backup: true,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--mode':
      case '-m':
        options.mode = args[++i];
        break;
      case '--no-backup':
        options.backup = false;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Migration Tool: Blockhash to DHash Converter

Usage: node scripts/migrate-to-dhash.js [options]

Options:
  -i, --input <path>     Input library.json file path
  -o, --output <path>    Output file path (defaults to input path)
  -m, --mode <mode>      Migration mode: dual, replace, convert (default: dual)
                         - dual: Keep both hashes during transition
                         - replace: Replace blockhash with dhash
                         - convert: Convert and add metadata only
  --no-backup           Skip creating backup files
  -v, --verbose         Enable verbose logging
  -h, --help           Show this help message

Examples:
  # Dual-hash mode (recommended for production)
  node scripts/migrate-to-dhash.js -i library.json -m dual
  
  # Replace mode (complete migration)
  node scripts/migrate-to-dhash.js -i library.json -m replace
        `);
        process.exit(0);
      default:
        if (!options.input) options.input = arg;
        break;
    }
  }

  return options;
}

/**
 * Create backup of original file
 */
async function createBackup(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup.${timestamp}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Load and validate library JSON
 */
async function loadLibrary(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const library = JSON.parse(content);
    
    if (!Array.isArray(library.images) && !Array.isArray(library.entries)) {
      throw new Error('Library must contain an "images" or "entries" array');
    }
    
    return library;
  } catch (error) {
    throw new Error(`Failed to load library: ${error.message}`);
  }
}

/**
 * Convert blockhash entry to dhash format
 */
async function convertEntry(entry, mode, verbose) {
  const newEntry = { ...entry };
  
  // Add migration metadata
  newEntry.migration = {
    version: MIGRATION_VERSION,
    timestamp: new Date().toISOString(),
    mode: mode,
    original_hash_type: entry.hash_alg || 'blockhash'
  };

  try {
    // Calculate dhash for the image
    let imagePath = entry.path || entry.image_path || entry.url;
    
    if (!imagePath) {
      if (verbose) console.warn(`Skipping entry without image path:`, entry.id || entry.name);
      return newEntry;
    }

    // Handle relative paths
    if (!path.isAbsolute(imagePath) && !imagePath.startsWith('http')) {
      // Assume relative to current working directory
      imagePath = path.resolve(imagePath);
    }

    const dhashResult = await calculateDHash(imagePath);
    
    // Apply migration mode
    switch (mode) {
      case 'dual':
        // Keep original hash and add dhash
        newEntry.dhash = dhashResult.hash;
        newEntry.dhash_metadata = {
          hash_alg: dhashResult.hash_alg,
          version: dhashResult.version,
          bits: dhashResult.bits,
          node_module_version: dhashResult.node_module_version,
          timestamp: dhashResult.timestamp
        };
        // Preserve original hash as legacy
        if (entry.hash) {
          newEntry.legacy_hash = entry.hash;
          newEntry.legacy_hash_alg = entry.hash_alg || 'blockhash';
        }
        break;
        
      case 'replace':
        // Replace with dhash
        newEntry.hash = dhashResult.hash;
        newEntry.hash_alg = dhashResult.hash_alg;
        newEntry.version = dhashResult.version;
        newEntry.bits = dhashResult.bits;
        newEntry.node_module_version = dhashResult.node_module_version;
        newEntry.hash_base64 = dhashResult.hash_base64;
        newEntry.metadata = dhashResult.metadata;
        break;
        
      case 'convert':
        // Add dhash alongside existing data
        newEntry.dhash = dhashResult.hash;
        newEntry.hash_alg = dhashResult.hash_alg;
        newEntry.version = dhashResult.version;
        newEntry.bits = dhashResult.bits;
        newEntry.node_module_version = dhashResult.node_module_version;
        break;
    }

    if (verbose) console.log(`✓ Converted: ${imagePath}`);
    return newEntry;
    
  } catch (error) {
    if (verbose) console.warn(`✗ Failed to convert ${entry.path || entry.id}: ${error.message}`);
    // Return original entry with error information
    newEntry.migration.error = error.message;
    newEntry.migration.status = 'failed';
    return newEntry;
  }
}

/**
 * Process library migration
 */
async function migrateLibrary(library, mode, verbose) {
  const startTime = Date.now();
  let totalEntries = 0;
  let convertedEntries = 0;
  let failedEntries = 0;

  // Determine which array to process
  const entriesKey = library.images ? 'images' : 'entries';
  const entries = library[entriesKey];
  totalEntries = entries.length;

  if (verbose) {
    console.log(`Starting migration of ${totalEntries} entries in ${mode} mode...`);
  }

  // Process entries with concurrency limit
  const concurrencyLimit = 5;
  const results = [];
  
  for (let i = 0; i < entries.length; i += concurrencyLimit) {
    const batch = entries.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(entry => convertEntry(entry, mode, verbose));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update progress
    const processed = Math.min(i + concurrencyLimit, entries.length);
    if (verbose) {
      console.log(`Progress: ${processed}/${totalEntries} (${Math.round(processed/totalEntries*100)}%)`);
    }
  }

  // Count successful conversions
  results.forEach(result => {
    if (result.migration && result.migration.error) {
      failedEntries++;
    } else {
      convertedEntries++;
    }
  });

  // Update library with results
  const migratedLibrary = {
    ...library,
    [entriesKey]: results,
    migration_info: {
      version: MIGRATION_VERSION,
      timestamp: new Date().toISOString(),
      mode: mode,
      stats: {
        total_entries: totalEntries,
        converted_entries: convertedEntries,
        failed_entries: failedEntries,
        processing_time_ms: Date.now() - startTime
      },
      dhash_version: DHASH_VERSION,
      dhash_algorithm: DHASH_ALGORITHM,
      dhash_bits: DHASH_BITS
    }
  };

  return migratedLibrary;
}

/**
 * Main migration function
 */
async function main() {
  const options = parseArgs();
  
  if (!options.input) {
    console.error('Error: Input file path is required');
    process.exit(1);
  }

  try {
    // Load original library
    const library = await loadLibrary(options.input);
    
    // Create backup if requested
    if (options.backup) {
      const backupPath = await createBackup(options.input);
      if (options.verbose) console.log(`Backup created: ${backupPath}`);
    }
    
    // Migrate library
    const migratedLibrary = await migrateLibrary(library, options.mode, options.verbose);
    
    // Write output
    const outputPath = options.output || options.input;
    await fs.writeFile(outputPath, JSON.stringify(migratedLibrary, null, 2));
    
    // Report results
    const stats = migratedLibrary.migration_info.stats;
    console.log(`
Migration completed successfully!
  
Results:
  Total entries: ${stats.total_entries}
  Converted: ${stats.converted_entries}
  Failed: ${stats.failed_entries}
  Processing time: ${stats.processing_time_ms}ms
  
Output written to: ${outputPath}
${options.backup ? `Backup available: ${options.input}.backup.*` : ''}
    `);
    
    if (stats.failed_entries > 0) {
      console.warn(`Warning: ${stats.failed_entries} entries failed to convert. Check the output file for error details.`);
    }
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { migrateLibrary, convertEntry, parseArgs };