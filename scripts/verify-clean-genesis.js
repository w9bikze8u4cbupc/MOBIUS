// verify-clean-genesis.js - Repository integrity verification script
//
// This script verifies that the repository structure is intact and
// all required files and directories are present.

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

console.log('Verification: Checking repository integrity...');
if (verbose) {
  console.log('Running in verbose mode');
  console.log('');
}

// Directories to check
const requiredDirs = [
  'scripts',
  'scripts/ci',
  'tests/golden',
  'src',
  'docs'
];

// Files to check
const requiredFiles = [
  'package.json',
  '.gitignore',
  'README.md',
  'CONTRIBUTING.md'
];

let allOk = true;

// Check directories
if (verbose) console.log('Checking directories:');
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    console.error(`✗ Missing required directory: ${dir}`);
    allOk = false;
  } else if (verbose) {
    console.log(`  ✓ Directory exists: ${dir}`);
  }
}

if (verbose) console.log('');
if (verbose) console.log('Checking files:');

// Check files
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`✗ Missing required file: ${file}`);
    allOk = false;
  } else if (verbose) {
    console.log(`  ✓ File exists: ${file}`);
  }
}

// Check key scripts
const keyScripts = [
  'scripts/check_golden.js',
  'scripts/generate_golden.js',
  'scripts/ci/smoke-tests.sh',
  'scripts/run_mobius_wsl.sh'
];

if (verbose) console.log('');
if (verbose) console.log('Checking key scripts:');

for (const script of keyScripts) {
  if (!fs.existsSync(script)) {
    console.error(`✗ Missing script: ${script}`);
    allOk = false;
  } else if (verbose) {
    // Check if executable (on Unix-like systems)
    try {
      const stats = fs.statSync(script);
      const isExecutable = (stats.mode & 0o111) !== 0;
      if (isExecutable) {
        console.log(`  ✓ Script exists and is executable: ${script}`);
      } else {
        console.log(`  ⚠ Script exists but may not be executable: ${script}`);
      }
    } catch (err) {
      console.log(`  ✓ Script exists: ${script}`);
    }
  }
}

// Summary
console.log('');
if (allOk) {
  console.log('✓ Repository verification passed');
  console.log('  All required files and directories are present');
  process.exit(0);
} else {
  console.error('✗ Repository verification failed');
  console.error('  Some required files or directories are missing');
  process.exit(1);
}
