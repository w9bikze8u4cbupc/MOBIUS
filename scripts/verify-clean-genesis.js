const { spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * verify-clean-genesis.js
 * 
 * Verifies that the repository is in a clean state for genesis/initialization.
 * This script checks:
 * - No uncommitted changes in git
 * - Key dependencies are present
 * - Basic file structure is valid
 * 
 * Outputs a JSON report to verification-reports/ directory.
 */

// Ensure directory exists
async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

// Run a shell command and return result
function sh(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

// Check if git repo is clean (no uncommitted changes)
function checkGitStatus() {
  const result = sh('git', ['status', '--porcelain']);
  if (!result.ok) {
    return { clean: false, error: 'Failed to run git status' };
  }
  const hasChanges = result.stdout.trim().length > 0;
  return { 
    clean: !hasChanges, 
    uncommittedFiles: hasChanges ? result.stdout.trim().split('\n') : []
  };
}

// Check if required files exist
function checkRequiredFiles() {
  const requiredFiles = [
    'package.json',
    'package-lock.json',
    '.gitignore'
  ];
  
  const missing = [];
  const present = [];
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      present.push(file);
    } else {
      missing.push(file);
    }
  }
  
  return {
    allPresent: missing.length === 0,
    present,
    missing
  };
}

// Check if node_modules exists and has dependencies
function checkDependencies() {
  const nodeModulesExists = fs.existsSync('node_modules');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const hasDependencies = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;
  
  return {
    nodeModulesExists,
    hasDependencies,
    dependencyCount: hasDependencies ? Object.keys(packageJson.dependencies).length : 0
  };
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    output: 'verification-reports',
    verbose: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      opts.output = args[++i];
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      opts.verbose = true;
    }
  }
  
  return opts;
}

// Main verification function
async function verify() {
  const opts = parseArgs();
  const timestamp = new Date().toISOString();
  
  console.log('🔍 Running clean genesis verification...');
  
  // Run all checks
  const gitStatus = checkGitStatus();
  const requiredFiles = checkRequiredFiles();
  const dependencies = checkDependencies();
  
  // Determine overall status
  const allChecksPass = 
    gitStatus.clean && 
    requiredFiles.allPresent;
  
  // Build report
  const report = {
    timestamp,
    status: allChecksPass ? 'PASS' : 'FAIL',
    checks: {
      gitStatus: {
        clean: gitStatus.clean,
        uncommittedFiles: gitStatus.uncommittedFiles || [],
        error: gitStatus.error
      },
      requiredFiles: {
        allPresent: requiredFiles.allPresent,
        present: requiredFiles.present,
        missing: requiredFiles.missing
      },
      dependencies: {
        nodeModulesExists: dependencies.nodeModulesExists,
        hasDependencies: dependencies.hasDependencies,
        dependencyCount: dependencies.dependencyCount
      }
    }
  };
  
  // Output report
  if (opts.verbose) {
    console.log('\n📋 Verification Report:');
    console.log(JSON.stringify(report, null, 2));
  }
  
  // Write report to file
  await ensureDir(opts.output);
  const reportPath = path.join(opts.output, `verify-${Date.now()}.json`);
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✅ Report written to: ${reportPath}`);
  
  // Print summary
  console.log('\n📊 Summary:');
  console.log(`  Git Status: ${gitStatus.clean ? '✅ Clean' : '❌ Uncommitted changes'}`);
  console.log(`  Required Files: ${requiredFiles.allPresent ? '✅ All present' : '❌ Missing files'}`);
  console.log(`  Dependencies: ${dependencies.hasDependencies ? '✅ Configured' : '⚠️  None defined'}`);
  console.log(`  Node Modules: ${dependencies.nodeModulesExists ? '✅ Installed' : '⚠️  Not installed'}`);
  
  // Exit with appropriate code
  if (allChecksPass) {
    console.log('\n✅ Verification PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Verification FAILED');
    if (!gitStatus.clean) {
      console.log('   - Repository has uncommitted changes');
    }
    if (!requiredFiles.allPresent) {
      console.log(`   - Missing required files: ${requiredFiles.missing.join(', ')}`);
    }
    process.exit(1);
  }
}

// Run verification
verify().catch(err => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
