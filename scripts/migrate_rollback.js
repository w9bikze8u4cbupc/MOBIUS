#!/usr/bin/env node

/**
 * DHash Migration Rollback Tool for MOBIUS Pipeline
 * Rolls back DHash migration by restoring from backup or removing DHash data
 */

const fs = require('fs');
const path = require('path');

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
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  
  return args;
}

function printUsage() {
  console.log(`
Usage: npm run migrate:rollback [options]

Options:
  -i, --input <file>      Input library file to rollback (required)
  -b, --backup <file>     Specific backup file to restore from
  --list-backups          List available backup files
  --remove-dhash          Remove DHash data without restoring from backup
  --dry-run              Preview rollback without making changes
  --force                 Force rollback even if no DHash data found

Examples:
  npm run migrate:rollback -i library.dhash.json --list-backups
  npm run migrate:rollback -i library.dhash.json -b library.json.bak.2024-01-15T10-30-00Z
  npm run migrate:rollback -i library.dhash.json --remove-dhash
  npm run migrate:rollback -i library.dhash.json --dry-run
  `);
}

function findBackupFiles(originalPath) {
  const dir = path.dirname(originalPath);
  const baseName = path.basename(originalPath);
  
  const backupPattern = new RegExp(`^${baseName.replace('.', '\\.')}\\.bak\\.(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z)$`);
  
  const files = fs.readdirSync(dir);
  const backups = files
    .filter(file => backupPattern.test(file))
    .map(file => {
      const match = file.match(backupPattern);
      return {
        filename: file,
        path: path.join(dir, file),
        timestamp: match[1].replace(/-/g, ':').replace('T', 'T').replace('Z', 'Z')
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Most recent first
  
  return backups;
}

function listBackups(inputPath) {
  console.log(`Searching for backup files for: ${inputPath}\n`);
  
  const backups = findBackupFiles(inputPath);
  
  if (backups.length === 0) {
    console.log('No backup files found.');
    return;
  }
  
  console.log('Available backup files:');
  backups.forEach((backup, index) => {
    const stats = fs.statSync(backup.path);
    const size = (stats.size / 1024).toFixed(2);
    const date = new Date(backup.timestamp).toLocaleString();
    console.log(`  ${index + 1}. ${backup.filename}`);
    console.log(`     Created: ${date}`);
    console.log(`     Size: ${size} KB`);
    console.log(`     Path: ${backup.path}`);
    console.log();
  });
}

function validateBackup(backupPath, originalPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  
  console.log(`Validating backup: ${backupPath}`);
  
  // Check if backup is valid JSON
  try {
    const content = fs.readFileSync(backupPath, 'utf8');
    const backup = JSON.parse(content);
    
    if (!backup.images || !Array.isArray(backup.images)) {
      throw new Error('Backup file has invalid format - missing images array');
    }
    
    console.log(`✓ Backup validation passed - ${backup.images.length} images found`);
    return backup;
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Backup file is corrupted - invalid JSON: ${error.message}`);
    }
    throw error;
  }
}

function removeDHashData(library) {
  console.log('Removing DHash data from library...');
  
  let removedCount = 0;
  
  // Remove DHash fields from images
  if (library.images && Array.isArray(library.images)) {
    library.images.forEach(image => {
      if (image.dhash) {
        delete image.dhash;
        delete image.dhash_generated_at;
        removedCount++;
      }
    });
  }
  
  // Remove migration metadata
  const metadataFields = ['dhash_migration', 'dhash_duplicates', 'dhash_errors'];
  metadataFields.forEach(field => {
    if (library[field]) {
      delete library[field];
    }
  });
  
  console.log(`✓ Removed DHash data from ${removedCount} images`);
  return library;
}

function generateRollbackReport(originalLibrary, restoredLibrary, method) {
  console.log(`\n=== DHash Rollback Report ===`);
  console.log(`Rollback method: ${method}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  if (method === 'backup-restore') {
    console.log(`Original images: ${originalLibrary.images?.length || 0}`);
    console.log(`Restored images: ${restoredLibrary.images?.length || 0}`);
    
    const hadDHash = originalLibrary.images?.filter(img => img.dhash).length || 0;
    console.log(`Images with DHash removed: ${hadDHash}`);
    
    if (originalLibrary.dhash_migration) {
      console.log(`Migration timestamp: ${originalLibrary.dhash_migration.migration_timestamp}`);
      console.log(`Duplicates found in migration: ${originalLibrary.dhash_migration.duplicates_found || 0}`);
    }
    
  } else if (method === 'remove-dhash') {
    const originalWithDHash = originalLibrary.images?.filter(img => img.dhash).length || 0;
    const restoredWithDHash = restoredLibrary.images?.filter(img => img.dhash).length || 0;
    
    console.log(`Total images: ${restoredLibrary.images?.length || 0}`);
    console.log(`Images with DHash before: ${originalWithDHash}`);
    console.log(`Images with DHash after: ${restoredWithDHash}`);
    console.log(`DHash data removed from: ${originalWithDHash - restoredWithDHash} images`);
  }
  
  console.log(`=== Rollback Complete ===\n`);
}

async function rollbackMigration(inputPath, options = {}) {
  const { backupPath, removeDHashOnly, isDryRun, force } = options;
  
  // Load current library
  console.log(`Loading library: ${inputPath}`);
  const originalLibrary = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  // Check if library has DHash data
  const hasDHashData = originalLibrary.images?.some(img => img.dhash) || 
                       originalLibrary.dhash_migration || 
                       originalLibrary.dhash_duplicates || 
                       originalLibrary.dhash_errors;
  
  if (!hasDHashData && !force) {
    console.log('No DHash data found in library. Use --force to proceed anyway.');
    return;
  }
  
  let restoredLibrary;
  let method;
  
  if (removeDHashOnly) {
    // Remove DHash data but keep the rest of the library
    method = 'remove-dhash';
    restoredLibrary = removeDHashData(JSON.parse(JSON.stringify(originalLibrary)));
    
  } else if (backupPath) {
    // Restore from specific backup
    method = 'backup-restore';
    restoredLibrary = validateBackup(backupPath, inputPath);
    
  } else {
    // Find and use most recent backup
    method = 'backup-restore';
    const backups = findBackupFiles(inputPath);
    
    if (backups.length === 0) {
      throw new Error('No backup files found. Use --remove-dhash to remove DHash data only, or specify --backup path.');
    }
    
    const latestBackup = backups[0];
    console.log(`Using most recent backup: ${latestBackup.filename}`);
    restoredLibrary = validateBackup(latestBackup.path, inputPath);
  }
  
  // Generate rollback report
  generateRollbackReport(originalLibrary, restoredLibrary, method);
  
  if (isDryRun) {
    console.log(`DRY RUN: Would restore library to ${inputPath}`);
    console.log(`DRY RUN: No files were modified`);
    return;
  }
  
  // Create safety backup of current state before rollback
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preRollbackBackup = `${inputPath}.pre-rollback.${timestamp}`;
  console.log(`Creating pre-rollback backup: ${preRollbackBackup}`);
  fs.copyFileSync(inputPath, preRollbackBackup);
  
  // Write restored library
  console.log(`Writing restored library to ${inputPath}...`);
  fs.writeFileSync(inputPath, JSON.stringify(restoredLibrary, null, 2));
  console.log(`✓ Rollback complete`);
}

async function main() {
  const args = parseArgs();
  
  if (args.help || args.h) {
    printUsage();
    process.exit(0);
  }
  
  const inputPath = args.input || args.i;
  
  if (!inputPath) {
    console.error('Error: Input file is required\n');
    printUsage();
    process.exit(1);
  }
  
  try {
    if (args['list-backups']) {
      listBackups(inputPath);
      return;
    }
    
    await rollbackMigration(inputPath, {
      backupPath: args.backup || args.b,
      removeDHashOnly: args['remove-dhash'],
      isDryRun: args['dry-run'],
      force: args.force
    });
    
  } catch (error) {
    console.error(`Rollback failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, rollbackMigration, findBackupFiles, validateBackup };