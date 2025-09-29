#!/usr/bin/env node

/**
 * MOBIUS Genesis Reference Verification Script
 * 
 * Searches for any references to "genesis" in the repository to ensure
 * the codebase is clean of accidental references.
 * 
 * Usage:
 *   node scripts/verify-clean-genesis.js [--detailed]
 *   npm run verify-clean-genesis
 *   npm run verify-clean-genesis-detailed
 * 
 * Exit codes:
 *   0 = Clean (no matches found)
 *   1 = Matches found
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

class GenesisVerifier {
  constructor(options = {}) {
    this.detailed = options.detailed || false;
    this.verbose = options.verbose || false;
    this.reportFile = options.reportFile || 'genesis-verification-report.md';
    this.matches = [];
    this.searchStats = {
      filesScanned: 0,
      directoriesScanned: 0,
      binaryFilesChecked: 0,
      gitCommitsChecked: 0,
      startTime: new Date()
    };
  }

  log(message, level = 'info') {
    if (this.verbose || level === 'error' || level === 'warn') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  addMatch(type, location, context, line = null) {
    this.matches.push({
      type,
      location,
      context: context.trim(),
      line,
      timestamp: new Date().toISOString()
    });
  }

  // Search in working tree files
  searchWorkingTree() {
    this.log('Searching working tree files...');
    
    const gitIgnorePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '*.log',
      'tmp',
      'temp'
    ];

    const searchDir = (dirPath, depth = 0) => {
      if (depth > 10) return; // Prevent infinite recursion
      
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        this.searchStats.directoriesScanned++;

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(process.cwd(), fullPath);

          // Skip ignored patterns
          if (gitIgnorePatterns.some(pattern => 
            relativePath.includes(pattern) || entry.name.startsWith('.')
          )) {
            continue;
          }

          // Skip verification report files
          if (entry.name.includes('verification-report')) {
            continue;
          }

          if (entry.isDirectory()) {
            searchDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            this.searchInFile(fullPath);
          }
        }
      } catch (error) {
        this.log(`Error scanning directory ${dirPath}: ${error.message}`, 'warn');
      }
    };

    searchDir(process.cwd());
  }

  searchInFile(filePath) {
    try {
      const relativePath = path.relative(process.cwd(), filePath);
      const stats = fs.statSync(filePath);
      
      // Skip this verification script itself
      if (relativePath.includes('verify-clean-genesis.js')) {
        return;
      }
      
      // Skip very large files (>10MB) to avoid memory issues
      if (stats.size > 10 * 1024 * 1024) {
        this.log(`Skipping large file: ${relativePath}`, 'warn');
        return;
      }

      // Check if file is binary
      const isTextFile = this.isTextFile(filePath);
      
      if (!isTextFile && !this.detailed) {
        return; // Skip binary files in fast mode
      }

      if (!isTextFile && this.detailed) {
        this.searchStats.binaryFilesChecked++;
        // For binary files, use a simpler approach
        const buffer = fs.readFileSync(filePath);
        const content = buffer.toString('binary');
        if (content.toLowerCase().includes('genesis')) {
          this.addMatch('binary', relativePath, 'Binary file contains "genesis"');
        }
        return;
      }

      // Text file processing
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      this.searchStats.filesScanned++;

      lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('genesis')) {
          // Skip legitimate references to the verification script itself
          if (this.isLegitimateReference(line, relativePath)) {
            return;
          }
          
          this.addMatch(
            'file',
            relativePath,
            line,
            index + 1
          );
        }
      });

    } catch (error) {
      this.log(`Error reading file ${filePath}: ${error.message}`, 'warn');
    }
  }

  isLegitimateReference(line, filePath) {
    // Skip npm script references to the verification script itself
    if (filePath.includes('package.json') && 
        line.includes('verify-clean-genesis')) {
      return true;
    }
    
    // Skip documentation about genesis verification (legitimate)
    if (filePath.includes('docs/genesis-verification.md') ||
        filePath.includes('README') ||
        filePath.includes('CHANGELOG')) {
      return true;
    }
    
    // Skip other legitimate references (can be expanded as needed)
    return false;
  }

  isTextFile(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      // Simple binary detection: check for null bytes in first 1KB
      const sample = buffer.slice(0, 1024);
      return !sample.includes(0);
    } catch {
      return false;
    }
  }

  // Search in git history
  searchGitHistory() {
    this.log('Searching git history...');
    
    try {
      // Get all commits
      const result = spawnSync('git', ['log', '--oneline', '--all'], { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      if (result.status !== 0) {
        this.log('Git history search skipped (not a git repository)', 'warn');
        return;
      }

      const commits = result.stdout.split('\n').filter(line => line.trim());
      this.searchStats.gitCommitsChecked = commits.length;

      // Search commit messages
      commits.forEach(commit => {
        if (commit.toLowerCase().includes('genesis')) {
          // Skip commits that are about the verification script itself
          if (commit.includes('verification') || 
              commit.includes('verify-clean-genesis') ||
              commit.includes('Implement MOBIUS genesis verification')) {
            return;
          }
          
          this.addMatch('git-commit', 'Git History', commit);
        }
      });

      // Search in all file contents across history (detailed mode only)
      if (this.detailed) {
        this.log('Performing detailed git history search...');
        const gitLogResult = spawnSync('git', [
          'log', '-S', 'genesis', '--source', '--all', '--oneline'
        ], { encoding: 'utf8', cwd: process.cwd() });

        if (gitLogResult.status === 0 && gitLogResult.stdout.trim()) {
          const matches = gitLogResult.stdout.split('\n').filter(line => line.trim());
          matches.forEach(match => {
            // Skip matches that are about the verification script itself
            if (match.includes('verification') || 
                match.includes('verify-clean-genesis') ||
                match.includes('Implement MOBIUS genesis verification')) {
              return;
            }
            
            this.addMatch('git-content', 'Git History', match);
          });
        }
      }

    } catch (error) {
      this.log(`Error searching git history: ${error.message}`, 'warn');
    }
  }

  // Search in temporary files
  searchTempFiles() {
    this.log('Searching temporary files...');
    
    const tempDirs = [
      '/tmp',
      '/var/tmp',
      process.env.TMPDIR,
      process.env.TEMP,
      process.env.TMP
    ].filter(Boolean);

    tempDirs.forEach(tempDir => {
      if (fs.existsSync(tempDir)) {
        try {
          const entries = fs.readdirSync(tempDir);
          entries.forEach(entry => {
            const fullPath = path.join(tempDir, entry);
            try {
              const stats = fs.statSync(fullPath);
              if (stats.isFile() && entry.toLowerCase().includes('mobius')) {
                this.searchInFile(fullPath);
              }
            } catch {
              // Ignore permission errors on temp files
            }
          });
        } catch (error) {
          this.log(`Error searching temp directory ${tempDir}: ${error.message}`, 'warn');
        }
      }
    });
  }

  generateReport() {
    const endTime = new Date();
    const duration = endTime - this.searchStats.startTime;

    const report = `# Genesis Reference Verification Report

Generated: ${endTime.toISOString()}
Duration: ${duration}ms
Mode: ${this.detailed ? 'Detailed' : 'Fast'}

## Summary

- **Status**: ${this.matches.length === 0 ? '✅ CLEAN' : '❌ MATCHES FOUND'}
- **Total Matches**: ${this.matches.length}
- **Files Scanned**: ${this.searchStats.filesScanned}
- **Directories Scanned**: ${this.searchStats.directoriesScanned}
- **Binary Files Checked**: ${this.searchStats.binaryFilesChecked}
- **Git Commits Checked**: ${this.searchStats.gitCommitsChecked}

## Search Scope

- Working tree files (text files)
- Git commit messages
- Temporary files (MOBIUS-related)
${this.detailed ? '- Binary files\n- Git history content' : ''}

${this.matches.length === 0 ? `
## ✅ Verification Passed

No "genesis" references found in the repository. The codebase is clean.

` : `
## ❌ Matches Found

The following references to "genesis" were found:

${this.matches.map(match => `
### ${match.type.toUpperCase()}: ${match.location}

${match.line ? `**Line ${match.line}:** ` : ''}
\`\`\`
${match.context}
\`\`\`

*Found at: ${match.timestamp}*
`).join('\n')}
`}

## Recommendations

${this.matches.length === 0 ? 
  '- Repository is clean and ready for deployment\n- Consider running this verification in CI to prevent regressions' :
  '- Review and remove all "genesis" references\n- Re-run verification after cleanup\n- Investigate how these references were introduced'
}

---
*Generated by MOBIUS Genesis Verification Script*
`;

    fs.writeFileSync(this.reportFile, report);
    this.log(`Report written to: ${this.reportFile}`);
    
    return report;
  }

  async run() {
    this.log('Starting Genesis Reference Verification...');
    this.log(`Mode: ${this.detailed ? 'Detailed' : 'Fast'}`);

    // Search in different locations
    this.searchWorkingTree();
    this.searchGitHistory();
    
    if (this.detailed) {
      this.searchTempFiles();
    }

    // Generate report
    const report = this.generateReport();

    // Output summary to console
    console.log('\n' + '='.repeat(60));
    console.log('GENESIS VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Status: ${this.matches.length === 0 ? '✅ CLEAN' : '❌ MATCHES FOUND'}`);
    console.log(`Total Matches: ${this.matches.length}`);
    console.log(`Files Scanned: ${this.searchStats.filesScanned}`);
    console.log(`Duration: ${new Date() - this.searchStats.startTime}ms`);
    console.log(`Report: ${this.reportFile}`);
    
    if (this.matches.length > 0) {
      console.log('\n❌ Matches found:');
      this.matches.forEach((match, index) => {
        console.log(`  ${index + 1}. ${match.type}: ${match.location}${match.line ? ` (line ${match.line})` : ''}`);
      });
    }
    
    console.log('='.repeat(60));

    // Return appropriate exit code
    return this.matches.length === 0 ? 0 : 1;
  }
}

// CLI interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    detailed: args.includes('--detailed'),
    verbose: args.includes('--verbose'),
    help: args.includes('--help') || args.includes('-h')
  };
  
  if (args.includes('--report')) {
    const reportIndex = args.indexOf('--report');
    options.reportFile = args[reportIndex + 1] || 'genesis-verification-report.md';
  }
  
  return options;
}

function showHelp() {
  console.log(`
MOBIUS Genesis Reference Verification Script

Usage:
  node scripts/verify-clean-genesis.js [options]

Options:
  --detailed     Enable detailed mode (includes binary files and git history content)
  --verbose      Enable verbose logging
  --report FILE  Specify report output file (default: genesis-verification-report.md)
  --help, -h     Show this help message

Examples:
  # Quick verification
  node scripts/verify-clean-genesis.js
  
  # Detailed verification with binary checks
  node scripts/verify-clean-genesis.js --detailed
  
  # Verbose output with custom report file
  node scripts/verify-clean-genesis.js --verbose --report my-report.md

Exit Codes:
  0 = Clean (no matches found)
  1 = Matches found
`);
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  const verifier = new GenesisVerifier(options);
  
  verifier.run()
    .then(exitCode => {
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Verification failed:', error);
      process.exit(2);
    });
}

module.exports = GenesisVerifier;