#!/usr/bin/env node
// scripts/verify-clean-genesis.js
// Verifies repository cleanliness and generates verification report

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Configuration
const REQUIRED_FILES = [
  'package.json',
  'src/api/ci-server.mjs',
  'Dockerfile.ci',
  'docker-compose.staging.yml',
  '.dockerignore',
  'scripts/ci/smoke-tests.sh'
];

const REQUIRED_DIRS = [
  'src',
  'src/api',
  'scripts',
  'scripts/ci'
];

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const colorMap = {
    info: colors.blue,
    success: colors.green,
    warn: colors.yellow,
    error: colors.red
  };
  const color = colorMap[level] || colors.reset;
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${timestamp} - ${message}`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log('info', `Created directory: ${dirPath}`);
  }
}

function checkFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    return {
      exists: true,
      size: stats.size,
      modified: stats.mtime
    };
  }
  return { exists: false };
}

function checkGitStatus() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    cwd: process.cwd()
  });
  
  if (result.error) {
    log('warn', 'Git not available or not a git repository');
    return { clean: null, output: '' };
  }
  
  const output = result.stdout.trim();
  return {
    clean: output.length === 0,
    output: output
  };
}

function checkNodeModules() {
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  return fs.existsSync(nodeModulesPath);
}

function generateReport(checks) {
  const reportDir = path.join(process.cwd(), 'verification-reports');
  ensureDir(reportDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(reportDir, `verification-${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      failed: checks.filter(c => c.status === 'fail').length,
      warnings: checks.filter(c => c.status === 'warn').length
    },
    checks: checks,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd()
    }
  };
  
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log('info', `Report written to: ${reportFile}`);
  
  return reportFile;
}

function main() {
  const isCi = process.argv.includes('--ci') || process.env.CI === 'true';
  
  log('info', '=== Repository Verification Starting ===');
  log('info', `Mode: ${isCi ? 'CI' : 'Local'}`);
  log('info', `Working directory: ${process.cwd()}`);
  
  const checks = [];
  
  // Check required files
  log('info', 'Checking required files...');
  for (const file of REQUIRED_FILES) {
    const fileCheck = checkFile(file);
    if (fileCheck.exists) {
      log('success', `✓ File exists: ${file} (${fileCheck.size} bytes)`);
      checks.push({
        type: 'file',
        name: file,
        status: 'pass',
        message: 'File exists',
        details: fileCheck
      });
    } else {
      log('error', `✗ File missing: ${file}`);
      checks.push({
        type: 'file',
        name: file,
        status: 'fail',
        message: 'File missing'
      });
    }
  }
  
  // Check required directories
  log('info', 'Checking required directories...');
  for (const dir of REQUIRED_DIRS) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      log('success', `✓ Directory exists: ${dir}`);
      checks.push({
        type: 'directory',
        name: dir,
        status: 'pass',
        message: 'Directory exists'
      });
    } else {
      log('error', `✗ Directory missing: ${dir}`);
      checks.push({
        type: 'directory',
        name: dir,
        status: 'fail',
        message: 'Directory missing'
      });
    }
  }
  
  // Check git status
  log('info', 'Checking git status...');
  const gitStatus = checkGitStatus();
  if (gitStatus.clean === true) {
    log('success', '✓ Git working tree is clean');
    checks.push({
      type: 'git',
      name: 'working-tree',
      status: 'pass',
      message: 'Working tree is clean'
    });
  } else if (gitStatus.clean === false) {
    log('warn', `⚠ Git working tree has changes:\n${gitStatus.output}`);
    checks.push({
      type: 'git',
      name: 'working-tree',
      status: 'warn',
      message: 'Working tree has uncommitted changes',
      details: gitStatus.output
    });
  } else {
    log('warn', '⚠ Git status could not be determined');
    checks.push({
      type: 'git',
      name: 'working-tree',
      status: 'warn',
      message: 'Git not available'
    });
  }
  
  // Check node_modules
  log('info', 'Checking dependencies...');
  if (checkNodeModules()) {
    log('success', '✓ node_modules exists');
    checks.push({
      type: 'dependencies',
      name: 'node_modules',
      status: 'pass',
      message: 'Dependencies installed'
    });
  } else {
    log('warn', '⚠ node_modules not found (run npm install)');
    checks.push({
      type: 'dependencies',
      name: 'node_modules',
      status: 'warn',
      message: 'Dependencies not installed'
    });
  }
  
  // Generate report
  log('info', 'Generating verification report...');
  const reportFile = generateReport(checks);
  
  // Summary
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  
  log('info', '=== Verification Complete ===');
  log('info', `Total checks: ${checks.length}`);
  log('info', `Passed: ${checks.filter(c => c.status === 'pass').length}`);
  log('info', `Warnings: ${warnCount}`);
  log('info', `Failed: ${failCount}`);
  
  if (failCount > 0) {
    log('error', '✗ Verification FAILED');
    process.exit(1);
  } else if (warnCount > 0 && isCi) {
    log('warn', '⚠ Verification completed with warnings');
    process.exit(0); // Don't fail CI on warnings
  } else {
    log('success', '✓ Verification PASSED');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
