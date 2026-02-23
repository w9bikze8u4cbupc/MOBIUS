#!/usr/bin/env node

/**
 * Migration script to move legacy data to canonical storage paths
 * 
 * This script safely migrates data from legacy locations to the new
 * canonical data structure under ./data/
 * 
 * Usage: node scripts/migrate-legacy-data.js [--dry-run] [--force]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDataDirs, getDbPath } from '../src/config/storage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const cutover = args.includes('--cutover');

console.log('🔄 MOBIUS Legacy Data Migration Tool');
console.log('=====================================\n');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No files will be moved\n');
}

if (cutover) {
  console.log('⚠️  CUTOVER MODE - Will perform cutover after migration\n');
}

// Get canonical paths
const dataDirs = getDataDirs();
const canonicalDbPath = getDbPath();

// Define legacy paths to check
const legacyMappings = [
  {
    source: path.join(projectRoot, 'src', 'api', 'projects.db'),
    dest: canonicalDbPath,
    type: 'file',
    description: 'Legacy API database'
  },
  {
    source: path.join(projectRoot, 'projects.db'),
    dest: canonicalDbPath,
    type: 'file',
    description: 'Legacy root database'
  },
  {
    source: path.join(projectRoot, 'src', 'api', 'uploads'),
    dest: dataDirs.uploads,
    type: 'directory',
    description: 'Legacy API uploads'
  },
  {
    source: path.join(projectRoot, 'uploads'),
    dest: dataDirs.uploads,
    type: 'directory',
    description: 'Legacy root uploads'
  },
  {
    source: path.join(projectRoot, 'output'),
    dest: dataDirs.outputs,
    type: 'directory',
    description: 'Legacy output directory'
  },
  {
    source: path.join(projectRoot, 'out'),
    dest: dataDirs.outputs,
    type: 'directory',
    description: 'Legacy out directory'
  }
];

/**
 * Copy a file safely
 */
function copyFile(source, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // If destination exists, create backup
  if (fs.existsSync(dest)) {
    const backup = `${dest}.backup.${Date.now()}`;
    console.log(`   ⚠️  Destination exists, creating backup: ${backup}`);
    fs.copyFileSync(dest, backup);
  }
  
  fs.copyFileSync(source, dest);
}

/**
 * Copy a directory recursively
 */
function copyDirectory(source, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      // Check if file already exists
      if (fs.existsSync(destPath)) {
        const sourceStats = fs.statSync(sourcePath);
        const destStats = fs.statSync(destPath);
        
        // Skip if identical
        if (sourceStats.size === destStats.size && 
            sourceStats.mtime.getTime() === destStats.mtime.getTime()) {
          console.log(`   ⏭️  Skipping identical file: ${entry.name}`);
          continue;
        }
        
        // Create backup if different
        const backup = `${destPath}.backup.${Date.now()}`;
        console.log(`   ⚠️  File exists, creating backup: ${backup}`);
        fs.copyFileSync(destPath, backup);
      }
      
      fs.copyFileSync(sourcePath, destPath);
      console.log(`   ✅ Copied: ${entry.name}`);
    }
  }
}

/**
 * Get directory size and file count
 */
function getDirectoryInfo(dirPath) {
  let size = 0;
  let fileCount = 0;
  
  function traverse(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        size += stats.size;
        fileCount++;
      }
    }
  }
  
  traverse(dirPath);
  return { size, fileCount };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Scan for legacy data
console.log('📊 Scanning for legacy data...\n');

const migrationsNeeded = [];

for (const mapping of legacyMappings) {
  if (!fs.existsSync(mapping.source)) {
    continue;
  }
  
  const stats = fs.statSync(mapping.source);
  
  if (mapping.type === 'file' && stats.isFile()) {
    migrationsNeeded.push({
      ...mapping,
      size: stats.size,
      fileCount: 1
    });
    
    console.log(`📄 Found: ${mapping.description}`);
    console.log(`   Source: ${mapping.source}`);
    console.log(`   Size: ${formatBytes(stats.size)}`);
    console.log(`   Dest: ${mapping.dest}\n`);
  } else if (mapping.type === 'directory' && stats.isDirectory()) {
    const info = getDirectoryInfo(mapping.source);
    
    if (info.fileCount > 0) {
      migrationsNeeded.push({
        ...mapping,
        ...info
      });
      
      console.log(`📁 Found: ${mapping.description}`);
      console.log(`   Source: ${mapping.source}`);
      console.log(`   Files: ${info.fileCount}`);
      console.log(`   Size: ${formatBytes(info.size)}`);
      console.log(`   Dest: ${mapping.dest}\n`);
    }
  }
}

if (migrationsNeeded.length === 0) {
  console.log('✅ No legacy data found. Migration not needed.\n');
  process.exit(0);
}

// Summary
console.log('📋 Migration Summary');
console.log('===================');
const totalFiles = migrationsNeeded.reduce((sum, m) => sum + m.fileCount, 0);
const totalSize = migrationsNeeded.reduce((sum, m) => sum + m.size, 0);
console.log(`Total items to migrate: ${migrationsNeeded.length}`);
console.log(`Total files: ${totalFiles}`);
console.log(`Total size: ${formatBytes(totalSize)}\n`);

if (dryRun) {
  console.log('✅ Dry run complete. Run without --dry-run to perform migration.\n');
  process.exit(0);
}

// Confirm migration
if (!force && !dryRun) {
  console.log('⚠️  IMPORTANT: This migration is COPY-ONLY and NON-DESTRUCTIVE');
  console.log('   - Original files will NOT be deleted');
  console.log('   - Data will be copied to canonical locations');
  console.log('   - You must manually remove legacy paths after verification');
  console.log('');
  
  if (cutover) {
    console.log('⚠️  CUTOVER MODE ENABLED');
    console.log('   - After migration, cutover will be performed');
    console.log('   - Legacy writes will be BLOCKED after cutover');
    console.log('');
  }
  
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Perform migration
console.log('🚀 Starting migration...\n');

let successCount = 0;
let errorCount = 0;

for (const migration of migrationsNeeded) {
  try {
    console.log(`📦 Migrating: ${migration.description}`);
    console.log(`   From: ${migration.source}`);
    console.log(`   To: ${migration.dest}`);
    
    if (migration.type === 'file') {
      copyFile(migration.source, migration.dest);
      console.log(`   ✅ File copied successfully\n`);
    } else {
      copyDirectory(migration.source, migration.dest);
      console.log(`   ✅ Directory copied successfully\n`);
    }
    
    successCount++;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    errorCount++;
  }
}

// Final summary
console.log('📊 Migration Complete');
console.log('====================');
console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${errorCount}\n`);

if (errorCount === 0) {
  console.log('✅ All data migrated successfully!\n');
  console.log('📝 Next steps:');
  console.log('   1. Verify the migrated data in the data/ directory');
  console.log('   2. Test your application to ensure everything works');
  
  if (cutover) {
    console.log('   3. Performing cutover...\n');
    
    try {
      const { execSync } = await import('child_process');
      execSync('node scripts/storage-cutover.mjs --force', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
    } catch (error) {
      console.error('❌ Cutover failed:', error.message);
      console.log('   Run cutover manually: npm run storage:cutover\n');
      process.exit(1);
    }
  } else {
    console.log('   3. Run cutover when ready: npm run storage:cutover');
    console.log('   4. After cutover, manually delete legacy paths:');
    console.log('');
    
    for (const migration of migrationsNeeded) {
      console.log(`      rm -rf "${migration.source}"`);
    }
    
    console.log('');
    console.log('   5. Restart your application\n');
  }
} else {
  console.log('⚠️  Some migrations failed. Please review the errors above.\n');
  process.exit(1);
}
