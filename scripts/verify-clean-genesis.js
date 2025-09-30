#!/usr/bin/env node

/**
 * verify-clean-genesis.js
 * 
 * CI smoke test to verify that the repository is in a clean, expected state.
 * This script checks for:
 * - Required dependencies are installed
 * - No uncommitted changes in critical files
 * - Basic directory structure integrity
 * - Package.json validity
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.blue);
}

// Check if package.json exists and is valid
function checkPackageJson() {
  logInfo('Checking package.json validity...');
  const packagePath = path.join(process.cwd(), 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    logError('package.json not found');
    return false;
  }
  
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Check for required fields
    if (!pkg.name || !pkg.version) {
      logError('package.json missing required fields (name or version)');
      return false;
    }
    
    // Check that dependencies are defined
    if (!pkg.dependencies && !pkg.devDependencies) {
      logError('package.json has no dependencies or devDependencies');
      return false;
    }
    
    logSuccess('package.json is valid');
    return true;
  } catch (err) {
    logError(`Failed to parse package.json: ${err.message}`);
    return false;
  }
}

// Check if node_modules exists (dependencies installed)
function checkNodeModules() {
  logInfo('Checking if dependencies are installed...');
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    logError('node_modules not found - run "npm install"');
    return false;
  }
  
  logSuccess('Dependencies are installed');
  return true;
}

// Check required directory structure
function checkDirectoryStructure() {
  logInfo('Checking directory structure...');
  const requiredDirs = ['scripts', 'src', 'tests'];
  let allExist = true;
  
  for (const dir of requiredDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      logError(`Required directory missing: ${dir}`);
      allExist = false;
    }
  }
  
  if (allExist) {
    logSuccess('Directory structure is intact');
  }
  
  return allExist;
}

// Check git status (if in a git repository)
function checkGitStatus() {
  logInfo('Checking git repository status...');
  
  // Skip git checks in CI environment (CI always starts clean)
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    logInfo('Running in CI environment - skipping git checks');
    return true;
  }
  
  // Check if we're in a git repository
  const gitCheck = spawnSync('git', ['rev-parse', '--git-dir'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  if (gitCheck.status !== 0) {
    logInfo('Not in a git repository - skipping git checks');
    return true;
  }
  
  // Check for uncommitted changes in critical files
  const status = spawnSync('git', ['status', '--porcelain', 'package.json', 'package-lock.json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  if (status.status === 0 && status.stdout.trim()) {
    logError('Uncommitted changes detected in package files:');
    console.log(status.stdout);
    return false;
  }
  
  logSuccess('Git repository is clean');
  return true;
}

// Main verification function
async function main() {
  log('\n=== MOBIUS Clean Genesis Verification ===\n', colors.blue);
  
  const checks = [
    checkPackageJson,
    checkNodeModules,
    checkDirectoryStructure,
    checkGitStatus
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    if (!check()) {
      allPassed = false;
    }
  }
  
  console.log('');
  
  if (allPassed) {
    log('=== All checks passed! ===\n', colors.green);
    process.exit(EXIT_SUCCESS);
  } else {
    log('=== Some checks failed ===\n', colors.red);
    process.exit(EXIT_FAILURE);
  }
}

// Run the script
main().catch(err => {
  logError(`Unexpected error: ${err.message}`);
  process.exit(EXIT_FAILURE);
});
