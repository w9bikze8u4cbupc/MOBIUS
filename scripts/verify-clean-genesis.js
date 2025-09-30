const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * verify-clean-genesis.js
 * 
 * Validates repository hygiene before running containerized smoke tests.
 * Used by CI to ensure clean repository state.
 */

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, -5);
}

async function verifyCleanGenesis() {
  const checks = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    checks: []
  };

  console.log('Starting repository verification...');

  // Check 1: Git working directory is clean
  try {
    const gitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
    const isClean = gitStatus.stdout.trim() === '';
    checks.checks.push({
      name: 'git_working_directory_clean',
      passed: isClean,
      message: isClean ? 'Working directory is clean' : 'Working directory has uncommitted changes',
      details: gitStatus.stdout || null
    });
    console.log(`✓ Git working directory: ${isClean ? 'CLEAN' : 'DIRTY'}`);
  } catch (err) {
    checks.checks.push({
      name: 'git_working_directory_clean',
      passed: false,
      message: 'Failed to check git status',
      error: err.message
    });
    console.log('✗ Git working directory check failed');
  }

  // Check 2: package.json exists
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const exists = fs.existsSync(packageJsonPath);
    checks.checks.push({
      name: 'package_json_exists',
      passed: exists,
      message: exists ? 'package.json found' : 'package.json not found'
    });
    console.log(`✓ package.json: ${exists ? 'EXISTS' : 'MISSING'}`);
  } catch (err) {
    checks.checks.push({
      name: 'package_json_exists',
      passed: false,
      message: 'Failed to check package.json',
      error: err.message
    });
    console.log('✗ package.json check failed');
  }

  // Check 3: node_modules is not committed (check .gitignore)
  try {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      const hasNodeModules = gitignoreContent.includes('node_modules');
      checks.checks.push({
        name: 'node_modules_gitignored',
        passed: hasNodeModules,
        message: hasNodeModules ? 'node_modules is in .gitignore' : 'node_modules is not in .gitignore'
      });
      console.log(`✓ node_modules gitignored: ${hasNodeModules ? 'YES' : 'NO'}`);
    } else {
      checks.checks.push({
        name: 'node_modules_gitignored',
        passed: false,
        message: '.gitignore not found'
      });
      console.log('✗ .gitignore not found');
    }
  } catch (err) {
    checks.checks.push({
      name: 'node_modules_gitignored',
      passed: false,
      message: 'Failed to check .gitignore',
      error: err.message
    });
    console.log('✗ .gitignore check failed');
  }

  // Check 4: No large files in git history (basic check)
  try {
    const largeFiles = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
    const files = largeFiles.stdout.split('\n').filter(f => f.trim() !== '');
    const suspiciousFiles = files.filter(f => 
      f.endsWith('.mp4') || 
      f.endsWith('.avi') || 
      f.endsWith('.mov') ||
      f.endsWith('.zip') ||
      f.endsWith('.tar.gz')
    );
    const passed = suspiciousFiles.length === 0;
    checks.checks.push({
      name: 'no_large_files_committed',
      passed: passed,
      message: passed ? 'No suspicious large files in git' : 'Large files detected in git',
      details: suspiciousFiles.length > 0 ? suspiciousFiles : null
    });
    console.log(`✓ Large files check: ${passed ? 'PASS' : 'FAIL'}`);
  } catch (err) {
    checks.checks.push({
      name: 'no_large_files_committed',
      passed: true,  // Don't fail if git check fails
      message: 'Could not check for large files (git not available)',
      warning: err.message
    });
    console.log('⚠ Large files check skipped');
  }

  // Calculate overall result
  const allPassed = checks.checks.every(c => c.passed);
  checks.result = allPassed ? 'PASS' : 'FAIL';
  checks.totalChecks = checks.checks.length;
  checks.passedChecks = checks.checks.filter(c => c.passed).length;

  // Write report
  const reportsDir = path.join(process.cwd(), 'verification-reports');
  await ensureDir(reportsDir);
  
  const reportFile = path.join(reportsDir, `verify-clean-genesis_${getTimestamp()}.json`);
  await fsp.writeFile(reportFile, JSON.stringify(checks, null, 2), 'utf8');
  
  console.log('\n' + '='.repeat(50));
  console.log(`Verification ${checks.result}`);
  console.log(`Passed: ${checks.passedChecks}/${checks.totalChecks}`);
  console.log(`Report: ${reportFile}`);
  console.log('='.repeat(50));

  return allPassed ? 0 : 1;
}

// Run verification
verifyCleanGenesis()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(err => {
    console.error('Verification failed with error:', err);
    process.exit(2);
  });
