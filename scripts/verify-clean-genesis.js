#!/usr/bin/env node

/**
 * Genesis Reference Verification Script for MOBIUS Repository
 * 
 * This script implements the comprehensive verification steps outlined in the problem statement
 * to search for any remaining "genesis" references in the repository.
 * 
 * Usage: node scripts/verify-clean-genesis.js [--detailed]
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const SEARCH_TERMS = ['genesis', 'GENESIS'];
const EXCLUDED_DIRS = ['.git', 'node_modules', 'vendor', 'dist', 'build'];
const EXCLUDED_FILES = [
  'scripts/verify-clean-genesis.js',  // Exclude this verification script itself
  'docs/genesis-verification-report.md',  // Exclude the verification report
  'README.md'  // Exclude README which documents the verification process
];
const TEMP_FILE_PATTERNS = ['*~', '*.swp', '*.bak', '*.tmp'];

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.bold}${colors.blue}=== ${title} ===${colors.reset}`);
}

function safeExec(command, description) {
  try {
    log(`🔍 ${description}...`, 'cyan');
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: ['inherit', 'pipe', 'pipe'],
      timeout: 30000 
    });
    return { success: true, output: result.trim(), error: null };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout ? error.stdout.trim() : '', 
      error: error.stderr ? error.stderr.trim() : error.message 
    };
  }
}

function filterVerificationToolReferences(output) {
  if (!output) return output;
  
  return output
    .split('\n')
    .filter(line => {
      // Exclude references to our verification tools
      if (line.includes('scripts/verify-clean-genesis.js')) return false;
      if (line.includes('docs/genesis-verification-report.md')) return false;
      if (line.includes('README.md') && (line.includes('genesis') || line.includes('Genesis'))) return false;
      if (line.includes('package.json') && line.includes('verify-clean-genesis')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function formatResults(results, filterOutput = false) {
  if (!results.success) {
    if (results.error && !results.error.includes('exit status 1')) {
      log(`   ❌ Error: ${results.error}`, 'red');
      return false;
    }
  }
  
  let output = results.output;
  if (filterOutput) {
    output = filterVerificationToolReferences(output);
  }
  
  if (output && output.length > 0) {
    log(`   ⚠️  Found matches:`, 'yellow');
    log(`   ${output}`, 'yellow');
    return false;
  } else {
    log(`   ✅ No matches found`, 'green');
    return true;
  }
}

function main() {
  const detailed = process.argv.includes('--detailed');
  
  log(`${colors.bold}${colors.blue}MOBIUS Repository Genesis Reference Verification${colors.reset}`);
  log(`Started at: ${new Date().toISOString()}`);
  
  let allClean = true;
  
  // 1. Quick local verification (non-destructive)
  logSection('Quick Local Verification');
  
  // Fast grep (ripgrep if available, fallback to grep)
  const rgResult = safeExec('which rg', 'Checking for ripgrep availability');
  if (rgResult.success && rgResult.output) {
    const fastGrepResult = safeExec(`rg -i 'genesis' .`, 'Fast search with ripgrep');
    allClean = formatResults(fastGrepResult, true) && allClean;
  } else {
    log('   📝 ripgrep not available, using fallback grep', 'yellow');
    const excludeArgs = EXCLUDED_DIRS.map(dir => `--exclude-dir=${dir}`).join(' ');
    const excludeFileArgs = EXCLUDED_FILES.map(file => `--exclude=${file}`).join(' ');
    const grepResult = safeExec(
      `grep -Rin ${excludeArgs} ${excludeFileArgs} -e 'genesis' .`, 
      'Fallback grep search'
    );
    allClean = formatResults(grepResult, true) && allClean;
  }
  
  // Git tracked files only (excluding verification tools)
  const gitGrepResult = safeExec(
    `git grep -ni 'genesis'`, 
    'Search git tracked files only'
  );
  allClean = formatResults(gitGrepResult, true) && allClean;
  
  // 2. Search commit history
  logSection('Git History Search');
  
  const historySearchS = safeExec(
    `git log --all -S'GENESIS' --pretty=format:'%h %an %ad %s'`,
    'Search commit history for GENESIS string additions/removals'
  );
  allClean = formatResults(historySearchS) && allClean;
  
  const historySearchG = safeExec(
    `git log --all -G'genesis' --pretty=format:'%h %an %ad %s'`,
    'Search commit history for genesis pattern changes'
  );
  allClean = formatResults(historySearchG) && allClean;
  
  // 3. Search other likely places
  logSection('Additional Search Locations');
  
  // Local temp/backup files
  const tempFileSearch = safeExec(
    `find . -type f \\( -name '*~' -o -name '*.swp' -o -name '*.bak' \\) -exec grep -iH 'genesis' {} \\;`,
    'Search local temp/backup files'
  );
  allClean = formatResults(tempFileSearch) && allClean;
  
  if (detailed) {
    // Binary blobs scan (heavier operation)
    logSection('Binary Content Search (Detailed Mode)');
    log('   📝 Scanning binary files for ASCII text containing "genesis"...', 'cyan');
    
    const binarySearchResult = safeExec(
      `git rev-list --all | while read rev; do git ls-tree -r --name-only "$rev"; done | sort -u | head -100 | xargs -I{} sh -c "file '{}' 2>/dev/null | grep -qi text && grep -iH 'genesis' '{}' || true"`,
      'Search binary blobs for ASCII text'
    );
    allClean = formatResults(binarySearchResult, true) && allClean;
  }
  
  // 4. Final summary
  logSection('Verification Summary');
  
  if (allClean) {
    log('✅ REPOSITORY IS CLEAN', 'green');
    log('   No "genesis" references found in any searched locations.', 'green');
    log('   The repository appears to be free of any textual references to "genesis".', 'green');
  } else {
    log('⚠️  REFERENCES FOUND', 'yellow');
    log('   Some "genesis" references were discovered. Review the output above.', 'yellow');
    log('   Consider running the cleanup procedures outlined in the problem statement.', 'yellow');
  }
  
  // 5. Additional recommendations
  logSection('Recommendations');
  
  if (allClean) {
    log('✅ No action required - repository is already clean.', 'green');
    log('📝 Consider running this script periodically to maintain cleanliness.', 'blue');
  } else {
    log('📋 Next steps:', 'blue');
    log('   1. Review the found references above', 'blue');
    log('   2. Determine if they need to be removed', 'blue');
    log('   3. For working tree changes: edit files and commit', 'blue');
    log('   4. For history changes: coordinate team and use BFG or git-filter-repo', 'blue');
    log('   5. For PR/comment references: use GitHub CLI to edit/remove', 'blue');
  }
  
  log(`\nCompleted at: ${new Date().toISOString()}`);
  
  // Exit with appropriate code
  process.exit(allClean ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { main, safeExec, formatResults };