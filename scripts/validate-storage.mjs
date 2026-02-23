#!/usr/bin/env node

/**
 * Storage validation script
 * 
 * Validates that the canonical storage structure is correctly configured
 * and no legacy paths exist with data.
 * 
 * Usage: node scripts/validate-storage.js [--fix]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { 
  getDataDirs, 
  getDbPath, 
  ensureDataDirs,
  validateNoLegacyPaths 
} from '../src/config/storage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const fix = args.includes('--fix');

console.log('🔍 MOBIUS Storage Validation');
console.log('============================\n');

// Step 1: Validate canonical directories
console.log('📂 Checking canonical directory structure...');
try {
  ensureDataDirs();
  const dirs = getDataDirs();
  
  console.log('✅ Canonical directories:');
  console.log(`   Root:    ${dirs.root}`);
  console.log(`   DB:      ${dirs.db}`);
  console.log(`   Uploads: ${dirs.uploads}`);
  console.log(`   Outputs: ${dirs.outputs}`);
  console.log(`   Tmp:     ${dirs.tmp}\n`);
  
  // Verify all directories exist
  const allExist = [
    dirs.root,
    dirs.db,
    dirs.uploads,
    dirs.outputs,
    dirs.tmp
  ].every(dir => fs.existsSync(dir));
  
  if (allExist) {
    console.log('✅ All canonical directories exist\n');
  } else {
    console.log('⚠️  Some directories were created\n');
  }
} catch (error) {
  console.error('❌ Error creating canonical directories:', error.message);
  process.exit(1);
}

// Step 2: Validate database path
console.log('🗄️  Checking database configuration...');
try {
  const dbPath = getDbPath();
  console.log(`   Database path: ${dbPath}`);
  
  // Check if database file exists
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`   ✅ Database exists (${stats.size} bytes)`);
  } else {
    console.log(`   ℹ️  Database will be created on first use`);
  }
  
  // Verify database is in correct location
  if (dbPath.includes(path.join('db', 'projects.sqlite'))) {
    console.log('   ✅ Database is in canonical location\n');
  } else {
    console.log('   ⚠️  Database path may not be canonical\n');
  }
} catch (error) {
  console.error('❌ Error checking database:', error.message);
  process.exit(1);
}

// Step 3: Check for legacy paths
console.log('🔎 Checking for legacy data paths...');
try {
  validateNoLegacyPaths();
  console.log('✅ No legacy paths detected\n');
} catch (error) {
  console.log('⚠️  Legacy paths detected:\n');
  console.log(error.message);
  console.log('');
  
  if (fix) {
    console.log('🔧 Running migration...');
    console.log('   Use: node scripts/migrate-legacy-data.js\n');
  } else {
    console.log('💡 To migrate legacy data, run:');
    console.log('   node scripts/migrate-legacy-data.js\n');
  }
  
  process.exit(1);
}

// Step 4: Verify no duplicate databases
console.log('🔍 Checking for duplicate databases...');
const possibleDbLocations = [
  path.join(projectRoot, 'projects.db'),
  path.join(projectRoot, 'projects.sqlite'),
  path.join(projectRoot, 'data', 'projects.db'),
  path.join(projectRoot, 'src', 'api', 'projects.db'),
  path.join(projectRoot, 'src', 'api', 'projects.sqlite'),
];

const canonicalDbPath = getDbPath();
const foundDatabases = possibleDbLocations
  .filter(loc => fs.existsSync(loc))
  .filter(loc => path.resolve(loc) !== path.resolve(canonicalDbPath));

if (foundDatabases.length > 0) {
  console.log('⚠️  Found databases in non-canonical locations:');
  foundDatabases.forEach(db => {
    const stats = fs.statSync(db);
    console.log(`   📄 ${db} (${stats.size} bytes)`);
  });
  console.log('\n   These should be migrated or removed.\n');
} else {
  console.log('✅ No duplicate databases found\n');
}

// Step 5: Check for duplicate upload directories
console.log('🔍 Checking for duplicate upload directories...');
const possibleUploadLocations = [
  path.join(projectRoot, 'uploads'),
  path.join(projectRoot, 'src', 'api', 'uploads'),
];

const canonicalUploadsPath = getDataDirs().uploads;
const foundUploadDirs = possibleUploadLocations
  .filter(loc => fs.existsSync(loc))
  .filter(loc => path.resolve(loc) !== path.resolve(canonicalUploadsPath))
  .filter(loc => {
    // Only flag if directory has contents
    const contents = fs.readdirSync(loc);
    return contents.length > 0;
  });

if (foundUploadDirs.length > 0) {
  console.log('⚠️  Found upload directories in non-canonical locations:');
  foundUploadDirs.forEach(dir => {
    const contents = fs.readdirSync(dir);
    console.log(`   📁 ${dir} (${contents.length} files)`);
  });
  console.log('\n   These should be migrated or removed.\n');
} else {
  console.log('✅ No duplicate upload directories found\n');
}

// Step 6: Environment variable check
console.log('🔧 Checking environment configuration...');
if (process.env.MOBIUS_DATA_ROOT) {
  console.log(`   ✅ MOBIUS_DATA_ROOT: ${process.env.MOBIUS_DATA_ROOT}`);
} else if (process.env.DATA_DIR) {
  console.log(`   ℹ️  DATA_DIR: ${process.env.DATA_DIR} (legacy)`);
  console.log(`   💡 Consider using MOBIUS_DATA_ROOT instead`);
} else {
  console.log(`   ℹ️  Using default data directory: ./data`);
}

if (process.env.SKIP_LEGACY_CHECK === 'true') {
  console.log(`   ⚠️  SKIP_LEGACY_CHECK is enabled (not recommended for production)`);
}

console.log('');

// Final summary
console.log('📊 Validation Summary');
console.log('====================');

if (foundDatabases.length === 0 && foundUploadDirs.length === 0) {
  console.log('✅ Storage configuration is valid');
  console.log('✅ No legacy paths detected');
  console.log('✅ Ready to run\n');
  process.exit(0);
} else {
  console.log('⚠️  Issues detected that should be resolved');
  console.log('💡 Run: node scripts/migrate-legacy-data.js\n');
  process.exit(1);
}
