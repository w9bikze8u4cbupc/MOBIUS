#!/usr/bin/env node
/**
 * verify-clean-genesis.js
 * 
 * Verifies that the project is in a clean state for testing:
 * - All dependencies are installed
 * - No obvious configuration issues
 * - Required directories exist
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Configuration
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const projectRoot = process.cwd();

// Test results
let checks = 0;
let passed = 0;
let failed = 0;
let warnings = 0;

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function info(message) {
  if (verbose) {
    log(`ℹ INFO: ${message}`, 'blue');
  }
}

function success(message) {
  checks++;
  passed++;
  log(`✓ PASS: ${message}`, 'green');
}

function fail(message) {
  checks++;
  failed++;
  log(`✗ FAIL: ${message}`, 'red');
}

function warn(message) {
  warnings++;
  log(`⚠ WARN: ${message}`, 'yellow');
}

function checkFileExists(filePath, description) {
  const fullPath = path.join(projectRoot, filePath);
  if (fs.existsSync(fullPath)) {
    success(`${description} exists: ${filePath}`);
    return true;
  } else {
    fail(`${description} not found: ${filePath}`);
    return false;
  }
}

function checkDirectoryExists(dirPath, description, createIfMissing = false) {
  const fullPath = path.join(projectRoot, dirPath);
  if (fs.existsSync(fullPath)) {
    success(`${description} exists: ${dirPath}`);
    return true;
  } else if (createIfMissing) {
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      warn(`${description} created: ${dirPath}`);
      return true;
    } catch (err) {
      fail(`Failed to create ${description}: ${dirPath} - ${err.message}`);
      return false;
    }
  } else {
    fail(`${description} not found: ${dirPath}`);
    return false;
  }
}

function checkNodeModules() {
  const nodeModulesPath = path.join(projectRoot, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    const stats = fs.statSync(nodeModulesPath);
    if (stats.isDirectory()) {
      const contents = fs.readdirSync(nodeModulesPath);
      if (contents.length > 0) {
        success(`Root node_modules installed (${contents.length} packages)`);
        return true;
      }
    }
  }
  fail('Root node_modules not installed or empty');
  return false;
}

function checkClientNodeModules() {
  const clientModulesPath = path.join(projectRoot, 'client', 'node_modules');
  if (fs.existsSync(clientModulesPath)) {
    const stats = fs.statSync(clientModulesPath);
    if (stats.isDirectory()) {
      const contents = fs.readdirSync(clientModulesPath);
      if (contents.length > 0) {
        success(`Client node_modules installed (${contents.length} packages)`);
        return true;
      }
    }
  }
  warn('Client node_modules not installed - run: cd client && npm ci');
  return false;
}

function checkNodeVersion() {
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    
    info(`Node.js version: ${nodeVersion}`);
    
    if (majorVersion >= 20) {
      success(`Node.js version compatible: ${nodeVersion}`);
      return true;
    } else {
      fail(`Node.js version too old: ${nodeVersion} (need >= 20.14.0)`);
      return false;
    }
  } catch (err) {
    fail(`Could not determine Node.js version: ${err.message}`);
    return false;
  }
}

function checkNpmVersion() {
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    info(`npm version: ${npmVersion}`);
    success(`npm is available: ${npmVersion}`);
    return true;
  } catch (err) {
    fail('npm is not available in PATH');
    return false;
  }
}

function checkFFmpeg() {
  try {
    const ffmpegVersion = execSync('ffmpeg -version 2>&1 | head -1', { 
      encoding: 'utf8',
      shell: '/bin/bash'
    }).trim();
    info(`FFmpeg: ${ffmpegVersion.split('\n')[0]}`);
    success('FFmpeg is installed');
    return true;
  } catch (err) {
    warn('FFmpeg not found in PATH (required for video processing)');
    return false;
  }
}

function checkEnvFile() {
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('OPENAI_API_KEY')) {
      success('.env file exists with OPENAI_API_KEY');
      return true;
    } else {
      warn('.env file exists but OPENAI_API_KEY not found');
      return false;
    }
  } else {
    warn('.env file not found (AI features may not work)');
    return false;
  }
}

function checkPackageJson() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (checkFileExists('package.json', 'Root package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.name && pkg.version) {
        info(`Project: ${pkg.name} v${pkg.version}`);
        return true;
      }
    } catch (err) {
      fail(`Invalid package.json: ${err.message}`);
      return false;
    }
  }
  return false;
}

function checkGitStatus() {
  try {
    execSync('git status --porcelain', { encoding: 'utf8', stdio: 'pipe' });
    success('Git repository is valid');
    return true;
  } catch (err) {
    warn('Not a git repository or git not available');
    return false;
  }
}

function main() {
  log('═══════════════════════════════════════════════════════', 'blue');
  log('  MOBIUS - Clean Genesis Verification', 'blue');
  log('═══════════════════════════════════════════════════════', 'blue');
  console.log();
  
  info(`Project root: ${projectRoot}`);
  info(`Verbose mode: ${verbose}`);
  console.log();
  
  // Core checks
  log('Checking environment...', 'blue');
  checkNodeVersion();
  checkNpmVersion();
  checkFFmpeg();
  console.log();
  
  // File structure checks
  log('Checking project structure...', 'blue');
  checkPackageJson();
  checkFileExists('package-lock.json', 'Root package-lock.json');
  checkFileExists('client/package.json', 'Client package.json');
  checkGitStatus();
  console.log();
  
  // Dependency checks
  log('Checking dependencies...', 'blue');
  checkNodeModules();
  checkClientNodeModules();
  console.log();
  
  // Directory checks
  log('Checking required directories...', 'blue');
  checkDirectoryExists('src', 'Source directory');
  checkDirectoryExists('src/api', 'API directory');
  checkDirectoryExists('client', 'Client directory');
  checkDirectoryExists('scripts', 'Scripts directory');
  checkDirectoryExists('tests', 'Tests directory');
  checkDirectoryExists('src/api/uploads', 'Uploads directory', true);
  console.log();
  
  // Optional checks
  log('Checking optional configuration...', 'blue');
  checkEnvFile();
  console.log();
  
  // Summary
  log('═══════════════════════════════════════════════════════', 'blue');
  log('  Verification Results', 'blue');
  log('═══════════════════════════════════════════════════════', 'blue');
  console.log(`Total checks: ${checks}`);
  log(`Passed: ${passed}`, 'green');
  if (failed > 0) {
    log(`Failed: ${failed}`, 'red');
  } else {
    console.log(`Failed: ${failed}`);
  }
  if (warnings > 0) {
    log(`Warnings: ${warnings}`, 'yellow');
  } else {
    console.log(`Warnings: ${warnings}`);
  }
  log('═══════════════════════════════════════════════════════', 'blue');
  console.log();
  
  if (failed > 0) {
    log('❌ Verification FAILED - please fix the errors above', 'red');
    console.log();
    console.log('Quick fixes:');
    console.log('  - Install dependencies: npm ci');
    console.log('  - Install client deps: cd client && npm ci');
    console.log('  - Check Node version: node -v (need >= 20.14)');
    console.log('  - Install FFmpeg: https://ffmpeg.org/');
    console.log();
    process.exit(1);
  } else if (warnings > 0) {
    log('⚠️  Verification passed with warnings', 'yellow');
    console.log();
    console.log('Consider addressing the warnings above for full functionality.');
    console.log();
    process.exit(0);
  } else {
    log('✅ Verification PASSED - project is ready!', 'green');
    console.log();
    process.exit(0);
  }
}

// Run verification
main();
