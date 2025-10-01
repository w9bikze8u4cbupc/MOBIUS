#!/usr/bin/env node
/**
 * Repository integrity verification script
 * Checks repository structure, files, and configuration
 * Writes timestamped JSON reports to verification-reports/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const reportsDir = path.join(process.cwd(), 'verification-reports');

// Ensure reports directory exists
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Helper functions
function log(message, level = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  
  const color = colors[level] || colors.info;
  const prefix = level === 'error' ? '✗' : level === 'warning' ? '⚠' : level === 'success' ? '✓' : 'ℹ';
  
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

function checkFileExists(filePath) {
  const exists = fs.existsSync(filePath);
  return { path: filePath, exists };
}

function checkDirectory(dirPath) {
  const exists = fs.existsSync(dirPath);
  const isDirectory = exists && fs.statSync(dirPath).isDirectory();
  return { path: dirPath, exists, isDirectory };
}

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { valid: true, content: JSON.parse(content) };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function getGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    return {
      branch,
      commit: commit.substring(0, 8),
      hasUncommittedChanges: status.length > 0,
      uncommittedFiles: status.split('\n').filter(line => line.trim()).length
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Verification checks
const verificationResults = {
  timestamp: new Date().toISOString(),
  checks: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

function addCheck(name, status, details = {}) {
  verificationResults.checks.push({
    name,
    status,
    ...details
  });
  
  verificationResults.summary.total++;
  if (status === 'passed') {
    verificationResults.summary.passed++;
  } else if (status === 'failed') {
    verificationResults.summary.failed++;
  } else if (status === 'warning') {
    verificationResults.summary.warnings++;
  }
}

// Start verification
log('Starting repository verification...', 'info');
if (verbose) {
  log(`Working directory: ${process.cwd()}`, 'info');
}
console.log();

// Check 1: Required files
log('Checking required files...', 'info');
const requiredFiles = [
  'package.json',
  'README.md',
  'CONTRIBUTING.md',
  '.gitignore'
];

requiredFiles.forEach(file => {
  const result = checkFileExists(file);
  if (result.exists) {
    addCheck(`Required file: ${file}`, 'passed');
    if (verbose) log(`  ${file} exists`, 'success');
  } else {
    addCheck(`Required file: ${file}`, 'failed', { error: 'File not found' });
    log(`  ${file} missing`, 'error');
  }
});

// Check 2: Required directories
log('Checking required directories...', 'info');
const requiredDirs = [
  'scripts',
  'src',
  'tests'
];

requiredDirs.forEach(dir => {
  const result = checkDirectory(dir);
  if (result.exists && result.isDirectory) {
    addCheck(`Required directory: ${dir}`, 'passed');
    if (verbose) log(`  ${dir}/ exists`, 'success');
  } else {
    addCheck(`Required directory: ${dir}`, 'failed', { error: 'Directory not found' });
    log(`  ${dir}/ missing`, 'error');
  }
});

// Check 3: package.json validity
log('Checking package.json...', 'info');
const packageJsonResult = readJsonFile('package.json');
if (packageJsonResult.valid) {
  addCheck('package.json validity', 'passed');
  if (verbose) log('  package.json is valid JSON', 'success');
  
  const pkg = packageJsonResult.content;
  
  // Check for required fields
  const requiredFields = ['name', 'version', 'scripts'];
  requiredFields.forEach(field => {
    if (pkg[field]) {
      addCheck(`package.json field: ${field}`, 'passed');
      if (verbose) log(`  ${field} field present`, 'success');
    } else {
      addCheck(`package.json field: ${field}`, 'warning', { error: 'Field missing' });
      log(`  ${field} field missing`, 'warning');
    }
  });
  
  // Check for verify-clean-genesis script
  if (pkg.scripts && pkg.scripts['verify-clean-genesis']) {
    addCheck('verify-clean-genesis script', 'passed');
    if (verbose) log('  verify-clean-genesis script defined', 'success');
  } else {
    addCheck('verify-clean-genesis script', 'warning', { error: 'Script not defined' });
    log('  verify-clean-genesis script not defined in package.json', 'warning');
  }
} else {
  addCheck('package.json validity', 'failed', { error: packageJsonResult.error });
  log('  package.json is invalid', 'error');
}

// Check 4: Git repository status
log('Checking git status...', 'info');
const gitStatus = getGitStatus();
if (gitStatus.error) {
  addCheck('Git repository', 'warning', { error: gitStatus.error });
  log('  Not a git repository or git not available', 'warning');
} else {
  addCheck('Git repository', 'passed', gitStatus);
  if (verbose) {
    log(`  Branch: ${gitStatus.branch}`, 'success');
    log(`  Commit: ${gitStatus.commit}`, 'success');
    if (gitStatus.hasUncommittedChanges) {
      log(`  Uncommitted files: ${gitStatus.uncommittedFiles}`, 'warning');
    } else {
      log('  Working directory clean', 'success');
    }
  }
}

// Check 5: node_modules
log('Checking node_modules...', 'info');
const nodeModulesResult = checkDirectory('node_modules');
if (nodeModulesResult.exists && nodeModulesResult.isDirectory) {
  addCheck('node_modules', 'passed');
  if (verbose) log('  node_modules/ exists', 'success');
} else {
  addCheck('node_modules', 'warning', { error: 'Dependencies not installed' });
  log('  node_modules/ not found - run npm install', 'warning');
}

// Check 6: Scripts directory structure
log('Checking scripts directory...', 'info');
const scriptsToCheck = [
  'scripts/check_golden.js',
  'scripts/generate_golden.js'
];

scriptsToCheck.forEach(script => {
  const result = checkFileExists(script);
  if (result.exists) {
    addCheck(`Script file: ${script}`, 'passed');
    if (verbose) log(`  ${script} exists`, 'success');
  } else {
    addCheck(`Script file: ${script}`, 'warning', { error: 'File not found' });
    if (verbose) log(`  ${script} missing`, 'warning');
  }
});

// Check 7: Tests directory structure
log('Checking tests directory...', 'info');
const testsResult = checkDirectory('tests');
if (testsResult.exists && testsResult.isDirectory) {
  const goldenDir = checkDirectory('tests/golden');
  if (goldenDir.exists && goldenDir.isDirectory) {
    addCheck('Golden test directory', 'passed');
    if (verbose) log('  tests/golden/ exists', 'success');
  } else {
    addCheck('Golden test directory', 'warning', { error: 'Directory not found' });
    if (verbose) log('  tests/golden/ not found', 'warning');
  }
}

// Final summary
console.log();
log('Verification complete!', 'info');
console.log();
console.log(`Total checks: ${verificationResults.summary.total}`);
console.log(`\x1b[32mPassed: ${verificationResults.summary.passed}\x1b[0m`);
console.log(`\x1b[33mWarnings: ${verificationResults.summary.warnings}\x1b[0m`);
console.log(`\x1b[31mFailed: ${verificationResults.summary.failed}\x1b[0m`);

// Write report
const reportFilename = `verification-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const reportPath = path.join(reportsDir, reportFilename);
fs.writeFileSync(reportPath, JSON.stringify(verificationResults, null, 2));

console.log();
log(`Report saved to: ${reportPath}`, 'info');

// Exit with appropriate code
if (verificationResults.summary.failed > 0) {
  console.log();
  log('Verification failed - see report for details', 'error');
  process.exit(1);
} else if (verificationResults.summary.warnings > 0) {
  console.log();
  log('Verification passed with warnings', 'warning');
  process.exit(0);
} else {
  console.log();
  log('All checks passed!', 'success');
  process.exit(0);
}
