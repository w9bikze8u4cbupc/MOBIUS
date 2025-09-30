#!/usr/bin/env node

/**
 * verify-clean-genesis.js
 * 
 * Verifies that the repository is in a clean state for CI verification.
 * Checks for:
 * - Required dependencies are installed
 * - No uncommitted changes in critical files
 * - Required scripts exist
 * 
 * Produces a report in verification-reports/ directory.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

// Configuration
const REPORT_DIR = 'verification-reports';
const REQUIRED_DEPS = ['express', 'cors'];
const CRITICAL_FILES = ['package.json', 'package-lock.json'];

/**
 * Ensure the reports directory exists
 */
async function ensureReportDir() {
  await fsp.mkdir(REPORT_DIR, { recursive: true });
}

/**
 * Check if required dependencies are installed
 */
function checkDependencies() {
  const results = [];
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    for (const dep of REQUIRED_DEPS) {
      const installed = dep in allDeps;
      results.push({
        dependency: dep,
        status: installed ? 'PASS' : 'FAIL',
        version: installed ? allDeps[dep] : 'missing'
      });
    }
  } catch (error) {
    results.push({
      dependency: 'package.json',
      status: 'FAIL',
      error: error.message
    });
  }

  return results;
}

/**
 * Check if node_modules exists and contains required packages
 */
function checkNodeModules() {
  const results = [];
  
  for (const dep of REQUIRED_DEPS) {
    const modulePath = path.join(process.cwd(), 'node_modules', dep);
    const exists = fs.existsSync(modulePath);
    results.push({
      module: dep,
      status: exists ? 'PASS' : 'FAIL',
      path: modulePath
    });
  }

  return results;
}

/**
 * Check git status for uncommitted changes in critical files
 */
function checkGitStatus() {
  const results = [];
  
  try {
    const result = spawnSync('git', ['status', '--porcelain', ...CRITICAL_FILES], {
      encoding: 'utf8',
      cwd: process.cwd()
    });

    if (result.error) {
      results.push({
        check: 'git-status',
        status: 'SKIP',
        message: 'Git not available or not a git repository'
      });
    } else {
      const output = result.stdout.trim();
      results.push({
        check: 'git-status',
        status: output ? 'WARN' : 'PASS',
        message: output ? `Uncommitted changes detected: ${output}` : 'No uncommitted changes in critical files'
      });
    }
  } catch (error) {
    results.push({
      check: 'git-status',
      status: 'SKIP',
      message: error.message
    });
  }

  return results;
}

/**
 * Check if required scripts exist in package.json
 */
function checkScripts() {
  const results = [];
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const scripts = packageJson.scripts || {};
    
    const requiredScripts = ['verify-clean-genesis'];
    
    for (const script of requiredScripts) {
      results.push({
        script,
        status: script in scripts ? 'PASS' : 'FAIL',
        command: scripts[script] || 'missing'
      });
    }
  } catch (error) {
    results.push({
      script: 'package.json',
      status: 'FAIL',
      error: error.message
    });
  }

  return results;
}

/**
 * Generate verification report
 */
async function generateReport(checks) {
  const timestamp = new Date().toISOString();
  const reportFile = path.join(REPORT_DIR, `verification-${Date.now()}.json`);
  
  // Determine overall status
  let overallStatus = 'PASS';
  let hasFailures = false;
  
  for (const checkType in checks) {
    for (const check of checks[checkType]) {
      if (check.status === 'FAIL') {
        hasFailures = true;
        overallStatus = 'FAIL';
        break;
      }
    }
    if (hasFailures) break;
  }

  const report = {
    timestamp,
    status: overallStatus,
    checks,
    summary: {
      total: Object.values(checks).reduce((sum, arr) => sum + arr.length, 0),
      passed: Object.values(checks).reduce((sum, arr) => sum + arr.filter(c => c.status === 'PASS').length, 0),
      failed: Object.values(checks).reduce((sum, arr) => sum + arr.filter(c => c.status === 'FAIL').length, 0),
      warnings: Object.values(checks).reduce((sum, arr) => sum + arr.filter(c => c.status === 'WARN').length, 0),
      skipped: Object.values(checks).reduce((sum, arr) => sum + arr.filter(c => c.status === 'SKIP').length, 0)
    }
  };

  await fsp.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
  
  // Also write a latest symlink/copy
  const latestFile = path.join(REPORT_DIR, 'verification-latest.json');
  await fsp.writeFile(latestFile, JSON.stringify(report, null, 2), 'utf8');
  
  return { report, reportFile };
}

/**
 * Print report to console
 */
function printReport(report, reportFile) {
  console.log('\n========================================');
  console.log('  Repository Verification Report');
  console.log('========================================\n');
  
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Status: ${report.status}\n`);
  
  // Dependency checks
  console.log('Dependencies:');
  for (const check of report.checks.dependencies) {
    const icon = check.status === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} ${check.dependency}: ${check.version} [${check.status}]`);
  }
  console.log();
  
  // Node modules checks
  console.log('Node Modules:');
  for (const check of report.checks.nodeModules) {
    const icon = check.status === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} ${check.module} [${check.status}]`);
  }
  console.log();
  
  // Git status checks
  console.log('Git Status:');
  for (const check of report.checks.gitStatus) {
    const icon = check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '⚠' : check.status === 'SKIP' ? '-' : '✗';
    console.log(`  ${icon} ${check.check}: ${check.message} [${check.status}]`);
  }
  console.log();
  
  // Scripts checks
  console.log('Scripts:');
  for (const check of report.checks.scripts) {
    const icon = check.status === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} ${check.script} [${check.status}]`);
  }
  console.log();
  
  // Summary
  console.log('Summary:');
  console.log(`  Total checks: ${report.summary.total}`);
  console.log(`  Passed: ${report.summary.passed}`);
  console.log(`  Failed: ${report.summary.failed}`);
  console.log(`  Warnings: ${report.summary.warnings}`);
  console.log(`  Skipped: ${report.summary.skipped}`);
  console.log();
  
  console.log(`Report saved to: ${reportFile}`);
  console.log('========================================\n');
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Running repository verification...\n');
    
    // Ensure report directory exists
    await ensureReportDir();
    
    // Run all checks
    const checks = {
      dependencies: checkDependencies(),
      nodeModules: checkNodeModules(),
      gitStatus: checkGitStatus(),
      scripts: checkScripts()
    };
    
    // Generate report
    const { report, reportFile } = await generateReport(checks);
    
    // Print report
    printReport(report, reportFile);
    
    // Exit with appropriate code
    if (report.status === 'FAIL') {
      console.error('Verification failed. Please review the report above.');
      process.exit(1);
    } else {
      console.log('Verification passed successfully.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during verification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
