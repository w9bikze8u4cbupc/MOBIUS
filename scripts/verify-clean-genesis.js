const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * verify-clean-genesis.js
 * 
 * Verifies that the genesis/initial state of the repository is clean.
 * Generates a JSON report in verification-reports/ directory.
 * 
 * This script checks:
 * - No uncommitted changes
 * - No untracked files (excluding gitignored)
 * - Dependencies are properly installed
 * - Basic file structure integrity
 */

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function getGitStatus() {
  const { spawnSync } = require('child_process');
  const result = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    cwd: process.cwd()
  });
  
  if (result.error) {
    return { error: 'Git not available or not a git repository' };
  }
  
  return {
    output: result.stdout || '',
    clean: !result.stdout || result.stdout.trim() === ''
  };
}

function checkNodeModules() {
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  return {
    exists: fs.existsSync(nodeModulesPath),
    path: nodeModulesPath
  };
}

function checkPackageJson() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { exists: false, error: 'package.json not found' };
  }
  
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return {
      exists: true,
      name: pkg.name,
      version: pkg.version,
      hasDependencies: !!(pkg.dependencies && Object.keys(pkg.dependencies).length > 0),
      hasDevDependencies: !!(pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0)
    };
  } catch (error) {
    return { exists: true, error: error.message };
  }
}

function checkRequiredDirectories() {
  const requiredDirs = ['scripts', 'src', 'tests'];
  const results = {};
  
  for (const dir of requiredDirs) {
    const dirPath = path.join(process.cwd(), dir);
    results[dir] = {
      exists: fs.existsSync(dirPath),
      path: dirPath
    };
  }
  
  return results;
}

async function runVerification() {
  console.log('Running verification checks...');
  
  const results = {
    timestamp: new Date().toISOString(),
    checks: {
      git_status: getGitStatus(),
      node_modules: checkNodeModules(),
      package_json: checkPackageJson(),
      required_directories: checkRequiredDirectories()
    },
    overall_status: 'pending'
  };
  
  // Determine overall status
  const gitClean = results.checks.git_status.clean;
  const nodeModulesExist = results.checks.node_modules.exists;
  const packageJsonValid = results.checks.package_json.exists && !results.checks.package_json.error;
  const allDirsExist = Object.values(results.checks.required_directories).every(d => d.exists);
  
  if (gitClean && nodeModulesExist && packageJsonValid && allDirsExist) {
    results.overall_status = 'pass';
    console.log('✓ All verification checks passed');
  } else {
    results.overall_status = 'warning';
    console.log('⚠ Some verification checks failed or have warnings');
    
    if (!gitClean) {
      console.log('  - Git status is not clean');
    }
    if (!nodeModulesExist) {
      console.log('  - node_modules directory not found (run npm install)');
    }
    if (!packageJsonValid) {
      console.log('  - package.json is invalid or missing');
    }
    if (!allDirsExist) {
      console.log('  - Some required directories are missing');
    }
  }
  
  // Write report
  const reportsDir = path.join(process.cwd(), 'verification-reports');
  await ensureDir(reportsDir);
  
  const reportFilename = `verification-${Date.now()}.json`;
  const reportPath = path.join(reportsDir, reportFilename);
  
  await fsp.writeFile(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nReport written to: ${reportPath}`);
  
  // Also write a latest.json for easy access
  const latestPath = path.join(reportsDir, 'latest.json');
  await fsp.writeFile(latestPath, JSON.stringify(results, null, 2), 'utf8');
  
  return results.overall_status === 'pass' ? 0 : 1;
}

// Main execution
(async function main() {
  try {
    const exitCode = await runVerification();
    process.exit(exitCode);
  } catch (error) {
    console.error('Error running verification:', error.message);
    process.exit(1);
  }
})();
