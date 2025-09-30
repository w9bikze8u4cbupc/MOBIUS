#!/usr/bin/env node
/**
 * verify-clean-genesis.js
 * 
 * Verifies that the tests/golden directory structure is in a clean state
 * before running CI checks. This ensures that debug artifacts and reports
 * from previous runs don't interfere with current test runs.
 * 
 * Exit codes:
 *   0 - Success: Directory is clean
 *   1 - Failure: Found unexpected files or directories
 */

const fs = require('fs');
const path = require('path');

const GOLDEN_BASE_DIR = path.join(__dirname, '..', 'tests', 'golden');

/**
 * Recursively checks if a directory exists and contains files
 */
function hasFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile()) {
        return true;
      }
      if (entry.isDirectory()) {
        const subPath = path.join(dirPath, entry.name);
        if (hasFiles(subPath)) {
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err.message);
    return false;
  }
}

/**
 * Lists all files in a directory recursively
 */
function listFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        listFiles(fullPath, files);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err.message);
  }
  
  return files;
}

/**
 * Main verification function
 */
function verifyCleanGenesis() {
  console.log('🔍 Verifying clean genesis state...');
  console.log(`Base directory: ${GOLDEN_BASE_DIR}`);
  
  if (!fs.existsSync(GOLDEN_BASE_DIR)) {
    console.log('✅ No golden directory found - nothing to verify');
    return true;
  }
  
  const issues = [];
  
  // Check for debug directories (should be cleaned up)
  const gamesDirs = fs.readdirSync(GOLDEN_BASE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  for (const gameDir of gamesDirs) {
    const gamePath = path.join(GOLDEN_BASE_DIR, gameDir);
    
    // Check for debug directory in game root
    const debugDir = path.join(gamePath, 'debug');
    if (hasFiles(debugDir)) {
      const files = listFiles(debugDir);
      issues.push({
        type: 'debug-artifacts',
        path: path.relative(process.cwd(), debugDir),
        files: files.map(f => path.relative(process.cwd(), f))
      });
    }
    
    // Check for debug directories in platform-specific subdirectories
    const platformDirs = ['windows', 'macos', 'linux'];
    for (const platformDir of platformDirs) {
      const platformPath = path.join(gamePath, platformDir);
      if (fs.existsSync(platformPath)) {
        const platformDebugDir = path.join(platformPath, 'debug');
        if (hasFiles(platformDebugDir)) {
          const files = listFiles(platformDebugDir);
          issues.push({
            type: 'debug-artifacts',
            path: path.relative(process.cwd(), platformDebugDir),
            files: files.map(f => path.relative(process.cwd(), f))
          });
        }
      }
    }
  }
  
  // Check for reports directory
  const reportsDir = path.join(GOLDEN_BASE_DIR, 'reports');
  if (hasFiles(reportsDir)) {
    const files = listFiles(reportsDir);
    issues.push({
      type: 'report-artifacts',
      path: path.relative(process.cwd(), reportsDir),
      files: files.map(f => path.relative(process.cwd(), f))
    });
  }
  
  // Report results
  if (issues.length === 0) {
    console.log('✅ Genesis state is clean - no debug or report artifacts found');
    return true;
  }
  
  console.error('\n❌ Genesis state is NOT clean - found artifacts:');
  for (const issue of issues) {
    console.error(`\n  ${issue.type}: ${issue.path}`);
    console.error(`  Files found: ${issue.files.length}`);
    if (issue.files.length <= 5) {
      issue.files.forEach(f => console.error(`    - ${f}`));
    } else {
      issue.files.slice(0, 5).forEach(f => console.error(`    - ${f}`));
      console.error(`    ... and ${issue.files.length - 5} more`);
    }
  }
  
  console.error('\n💡 To fix: Remove debug and report directories before running tests');
  console.error('   git clean -fdx tests/golden/**/debug tests/golden/reports');
  
  return false;
}

// Run the verification
const isClean = verifyCleanGenesis();
process.exit(isClean ? 0 : 1);
