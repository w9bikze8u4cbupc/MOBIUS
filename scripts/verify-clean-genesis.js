#!/usr/bin/env node
/**
 * verify-clean-genesis.js — Repository integrity verification
 * 
 * Verifies the MOBIUS repository is in a clean, functional state by:
 * - Checking required files and directories exist
 * - Validating package.json and dependencies
 * - Checking for required tools (node, npm, ffmpeg, docker)
 * - Writing timestamped JSON reports
 * 
 * Usage:
 *   node scripts/verify-clean-genesis.js [--verbose] [--report-dir <dir>]
 *   npm run verify-clean-genesis
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Configuration
const REPORT_DIR = path.join(process.cwd(), 'verification-reports');
const REQUIRED_FILES = [
  'package.json',
  'package-lock.json',
  'scripts/check_golden.js',
  'scripts/generate_golden.js',
];

const REQUIRED_DIRS = [
  'src',
  'scripts',
  'tests',
  'client',
];

// Parse arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const reportDirArg = args.findIndex(arg => arg === '--report-dir');
const reportDir = reportDirArg >= 0 && args[reportDirArg + 1] 
  ? args[reportDirArg + 1] 
  : REPORT_DIR;

// Output helpers
function log(message, level = 'info') {
  const colors = {
    info: '\x1b[34m',
    success: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
  };
  const reset = '\x1b[0m';
  const prefix = {
    info: '[INFO]',
    success: '[PASS]',
    warn: '[WARN]',
    error: '[FAIL]',
  };
  
  console.log(`${colors[level]}${prefix[level]}${reset} ${message}`);
}

function verboseLog(message) {
  if (verbose) {
    log(message, 'info');
  }
}

// Ensure report directory exists
function ensureReportDir() {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
    verboseLog(`Created report directory: ${reportDir}`);
  }
}

// Check if command exists
function commandExists(cmd) {
  try {
    const result = spawnSync('which', [cmd], { encoding: 'utf8' });
    return result.status === 0;
  } catch (err) {
    return false;
  }
}

// Get command version
function getVersion(cmd, args = ['--version']) {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf8' });
    if (result.status === 0) {
      return (result.stdout || result.stderr).split('\n')[0].trim();
    }
    return 'unknown';
  } catch (err) {
    return 'error';
  }
}

// Check required files
function checkRequiredFiles() {
  const results = [];
  
  verboseLog('Checking required files...');
  
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(process.cwd(), file);
    const exists = fs.existsSync(filePath);
    
    results.push({
      path: file,
      exists,
      type: 'file',
    });
    
    if (exists) {
      verboseLog(`  ✓ ${file}`);
    } else {
      log(`  ✗ Missing: ${file}`, 'error');
    }
  }
  
  return results;
}

// Check required directories
function checkRequiredDirs() {
  const results = [];
  
  verboseLog('Checking required directories...');
  
  for (const dir of REQUIRED_DIRS) {
    const dirPath = path.join(process.cwd(), dir);
    const exists = fs.existsSync(dirPath);
    
    results.push({
      path: dir,
      exists,
      type: 'directory',
    });
    
    if (exists) {
      verboseLog(`  ✓ ${dir}/`);
    } else {
      log(`  ✗ Missing: ${dir}/`, 'error');
    }
  }
  
  return results;
}

// Check required tools
function checkRequiredTools() {
  const tools = [
    { name: 'node', required: true },
    { name: 'npm', required: true },
    { name: 'ffmpeg', required: true },
    { name: 'docker', required: false },
    { name: 'git', required: false },
  ];
  
  const results = [];
  
  verboseLog('Checking required tools...');
  
  for (const tool of tools) {
    const exists = commandExists(tool.name);
    const version = exists ? getVersion(tool.name) : null;
    
    results.push({
      name: tool.name,
      exists,
      version,
      required: tool.required,
    });
    
    if (exists) {
      verboseLog(`  ✓ ${tool.name}: ${version}`);
    } else {
      const level = tool.required ? 'error' : 'warn';
      log(`  ✗ Missing: ${tool.name}${tool.required ? ' (required)' : ' (optional)'}`, level);
    }
  }
  
  return results;
}

// Validate package.json
function validatePackageJson() {
  verboseLog('Validating package.json...');
  
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const checks = {
      hasName: !!pkg.name,
      hasVersion: !!pkg.version,
      hasScripts: !!pkg.scripts && Object.keys(pkg.scripts).length > 0,
      hasDependencies: !!pkg.dependencies || !!pkg.devDependencies,
    };
    
    verboseLog(`  ✓ Package name: ${pkg.name}`);
    verboseLog(`  ✓ Package version: ${pkg.version}`);
    verboseLog(`  ✓ Scripts defined: ${Object.keys(pkg.scripts || {}).length}`);
    
    return {
      valid: Object.values(checks).every(Boolean),
      name: pkg.name,
      version: pkg.version,
      checks,
    };
  } catch (err) {
    log('  ✗ Invalid package.json', 'error');
    return {
      valid: false,
      error: err.message,
    };
  }
}

// Check node_modules
function checkNodeModules() {
  verboseLog('Checking node_modules...');
  
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  const exists = fs.existsSync(nodeModulesPath);
  
  if (exists) {
    try {
      const dirs = fs.readdirSync(nodeModulesPath);
      const count = dirs.filter(d => !d.startsWith('.')).length;
      verboseLog(`  ✓ node_modules exists (${count} packages)`);
      return { exists: true, packageCount: count };
    } catch (err) {
      log('  ✗ Error reading node_modules', 'warn');
      return { exists: true, error: err.message };
    }
  } else {
    log('  ✗ node_modules not found (run npm ci)', 'warn');
    return { exists: false };
  }
}

// Check git status
function checkGitStatus() {
  if (!commandExists('git')) {
    return { available: false };
  }
  
  verboseLog('Checking git status...');
  
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    
    verboseLog(`  ✓ Branch: ${branch}`);
    verboseLog(`  ✓ Commit: ${commit.substring(0, 7)}`);
    verboseLog(`  ${dirty ? '⚠' : '✓'} Working tree: ${dirty ? 'modified' : 'clean'}`);
    
    return {
      available: true,
      branch,
      commit,
      dirty,
    };
  } catch (err) {
    return {
      available: true,
      error: err.message,
    };
  }
}

// Generate report
function generateReport(results) {
  const timestamp = new Date().toISOString();
  const reportFilename = `verification-${timestamp.replace(/:/g, '-').split('.')[0]}.json`;
  const reportPath = path.join(reportDir, reportFilename);
  
  const report = {
    timestamp,
    passed: results.passed,
    summary: results.summary,
    details: {
      files: results.files,
      directories: results.directories,
      tools: results.tools,
      packageJson: results.packageJson,
      nodeModules: results.nodeModules,
      git: results.git,
    },
  };
  
  ensureReportDir();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`Report written to: ${reportPath}`, 'info');
  
  return reportPath;
}

// Main verification
function main() {
  console.log('========================================');
  console.log('  MOBIUS Repository Verification');
  console.log('========================================');
  console.log('');
  
  const files = checkRequiredFiles();
  const directories = checkRequiredDirs();
  const tools = checkRequiredTools();
  const packageJson = validatePackageJson();
  const nodeModules = checkNodeModules();
  const git = checkGitStatus();
  
  console.log('');
  
  // Determine if verification passed
  const filesOk = files.every(f => f.exists);
  const dirsOk = directories.every(d => d.exists);
  const toolsOk = tools.filter(t => t.required).every(t => t.exists);
  const packageOk = packageJson.valid;
  
  const passed = filesOk && dirsOk && toolsOk && packageOk;
  
  // Summary
  const summary = {
    files: files.filter(f => f.exists).length,
    filesTotal: files.length,
    directories: directories.filter(d => d.exists).length,
    directoriesTotal: directories.length,
    tools: tools.filter(t => t.exists).length,
    toolsTotal: tools.length,
    packageJsonValid: packageJson.valid,
    nodeModulesExists: nodeModules.exists,
  };
  
  // Generate report
  const results = {
    passed,
    summary,
    files,
    directories,
    tools,
    packageJson,
    nodeModules,
    git,
  };
  
  generateReport(results);
  
  console.log('========================================');
  console.log('Summary:');
  console.log(`  Files: ${summary.files}/${summary.filesTotal}`);
  console.log(`  Directories: ${summary.directories}/${summary.directoriesTotal}`);
  console.log(`  Tools: ${summary.tools}/${summary.toolsTotal}`);
  console.log(`  Package.json: ${summary.packageJsonValid ? 'valid' : 'invalid'}`);
  console.log(`  node_modules: ${summary.nodeModulesExists ? 'present' : 'missing'}`);
  console.log('========================================');
  console.log('');
  
  if (passed) {
    log('Repository verification PASSED ✓', 'success');
    return 0;
  } else {
    log('Repository verification FAILED ✗', 'error');
    log('Review the output above and fix any issues', 'error');
    return 1;
  }
}

// Run and exit with appropriate code
process.exit(main());
