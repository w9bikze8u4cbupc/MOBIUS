#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

// Configuration
const SEARCH_TERM = 'genesis';
const EXCLUDE_PATTERNS = [
  // Exclude the verification tools themselves
  'scripts/verify-clean-genesis.js',
  'docs/genesis-verification-report.md',
  'verification-reports/',
  '.git/objects/',
  'node_modules/',
  '.npm/',
  'coverage/',
  'dist/',
  'build/',
  'tmp/',
  'temp/',
  '.DS_Store',
  'Thumbs.db',
  '*.log'
];

class GenesisVerifier {
  constructor(options = {}) {
    this.detailed = options.detailed || false;
    this.ci = options.ci || false;
    this.reportDir = options.reportDir || this.getReportDir();
    this.timestamp = new Date().toISOString();
    this.results = {
      workingTree: { clean: true, matches: [] },
      gitHistory: { clean: true, matches: [] },
      tempFiles: { clean: true, matches: [] },
      binaryBlobs: { clean: true, matches: [] }
    };
    this.colors = {
      red: this.ci ? '' : '\x1b[31m',
      green: this.ci ? '' : '\x1b[32m',
      yellow: this.ci ? '' : '\x1b[33m',
      blue: this.ci ? '' : '\x1b[34m',
      reset: this.ci ? '' : '\x1b[0m',
      bold: this.ci ? '' : '\x1b[1m'
    };
  }

  getReportDir() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
    const date = timestamp[0];
    const time = timestamp[1].split('.')[0].replace(/-/g, '');
    return path.join('verification-reports', `${date.replace(/-/g, '')}_${time}`);
  }

  log(message, color = 'reset') {
    const colorCode = this.colors[color] || this.colors.reset;
    console.log(`${colorCode}${message}${this.colors.reset}`);
  }

  shouldExclude(filePath) {
    return EXCLUDE_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filePath);
      }
      return filePath.includes(pattern);
    });
  }

  async scanWorkingTree() {
    this.log('\n🔍 Scanning working tree files...', 'blue');
    
    const matches = [];
    const scanDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        if (this.shouldExclude(relativePath)) continue;
        
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach((line, index) => {
              if (line.toLowerCase().includes(SEARCH_TERM.toLowerCase())) {
                matches.push({
                  file: relativePath,
                  line: index + 1,
                  content: line.trim(),
                  type: 'working-tree'
                });
              }
            });
          } catch (error) {
            // Skip binary files or files we can't read
            if (this.detailed) {
              this.scanBinaryFile(fullPath, relativePath);
            }
          }
        }
      }
    };

    scanDir(process.cwd());
    
    this.results.workingTree.matches = matches;
    this.results.workingTree.clean = matches.length === 0;
    
    if (matches.length === 0) {
      this.log('  ✅ Working tree files: Clean', 'green');
    } else {
      this.log(`  ❌ Working tree files: ${matches.length} matches found`, 'red');
      matches.forEach(match => {
        this.log(`    ${match.file}:${match.line} - ${match.content}`, 'yellow');
      });
    }
  }

  async scanGitHistory() {
    this.log('\n📚 Scanning git history...', 'blue');
    
    const matches = [];
    
    try {
      // Get all commits
      const commits = execSync('git log --all --pretty=format:"%H"', { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);

      for (const commit of commits) {
        try {
          // Search commit message
          const commitMsg = execSync(`git log -1 --pretty=format:"%s %b" ${commit}`, { encoding: 'utf8' });
          if (commitMsg.toLowerCase().includes(SEARCH_TERM.toLowerCase())) {
            matches.push({
              commit,
              type: 'commit-message',
              content: commitMsg.trim()
            });
          }

          // Search diff content
          const diff = execSync(`git show ${commit} --name-only`, { encoding: 'utf8' });
          if (diff.toLowerCase().includes(SEARCH_TERM.toLowerCase())) {
            const diffLines = execSync(`git show ${commit}`, { encoding: 'utf8' }).split('\n');
            diffLines.forEach((line, index) => {
              if (line.toLowerCase().includes(SEARCH_TERM.toLowerCase()) && 
                  (line.startsWith('+') || line.startsWith('-'))) {
                matches.push({
                  commit,
                  line: index + 1,
                  content: line.trim(),
                  type: 'commit-diff'
                });
              }
            });
          }
        } catch (error) {
          // Skip problematic commits
          continue;
        }
      }
    } catch (error) {
      this.log('  ⚠️  Could not scan git history (not a git repository?)', 'yellow');
      return;
    }

    this.results.gitHistory.matches = matches;
    this.results.gitHistory.clean = matches.length === 0;

    if (matches.length === 0) {
      this.log('  ✅ Git history: Clean', 'green');
    } else {
      this.log(`  ❌ Git history: ${matches.length} matches found`, 'red');
      matches.forEach(match => {
        if (match.type === 'commit-message') {
          this.log(`    Commit ${match.commit.substring(0, 8)}: ${match.content}`, 'yellow');
        } else {
          this.log(`    Commit ${match.commit.substring(0, 8)}:${match.line} - ${match.content}`, 'yellow');
        }
      });
    }
  }

  async scanTempFiles() {
    this.log('\n🗂️  Scanning temporary/backup files...', 'blue');
    
    const matches = [];
    const tempPatterns = [
      '**/*.tmp',
      '**/*.temp',
      '**/*.bak',
      '**/*.backup',
      '**/*.swp',
      '**/*.swo',
      '**/*~',
      '**/tmp/**',
      '**/temp/**'
    ];

    const scanPattern = (pattern) => {
      try {
        const files = execSync(`find . -name "${pattern}" -type f 2>/dev/null || true`, 
          { encoding: 'utf8' })
          .split('\n')
          .filter(Boolean);

        files.forEach(file => {
          const relativePath = path.relative(process.cwd(), file);
          if (this.shouldExclude(relativePath)) return;

          try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach((line, index) => {
              if (line.toLowerCase().includes(SEARCH_TERM.toLowerCase())) {
                matches.push({
                  file: relativePath,
                  line: index + 1,
                  content: line.trim(),
                  type: 'temp-file'
                });
              }
            });
          } catch (error) {
            // Skip binary files
          }
        });
      } catch (error) {
        // Pattern not found or error occurred
      }
    };

    // Scan common temp file patterns
    const simplePatterns = ['*.tmp', '*.temp', '*.bak', '*.backup', '*.swp', '*.swo'];
    simplePatterns.forEach(scanPattern);

    this.results.tempFiles.matches = matches;
    this.results.tempFiles.clean = matches.length === 0;

    if (matches.length === 0) {
      this.log('  ✅ Temporary/backup files: Clean', 'green');
    } else {
      this.log(`  ❌ Temporary/backup files: ${matches.length} matches found`, 'red');
      matches.forEach(match => {
        this.log(`    ${match.file}:${match.line} - ${match.content}`, 'yellow');
      });
    }
  }

  scanBinaryFile(fullPath, relativePath) {
    try {
      const buffer = fs.readFileSync(fullPath);
      const content = buffer.toString('binary');
      
      if (content.toLowerCase().includes(SEARCH_TERM.toLowerCase())) {
        this.results.binaryBlobs.matches.push({
          file: relativePath,
          type: 'binary-blob',
          content: '<binary content contains match>'
        });
        this.results.binaryBlobs.clean = false;
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  async scanBinaryBlobs() {
    if (!this.detailed) return;

    this.log('\n🔢 Scanning binary blobs (detailed mode)...', 'blue');
    
    const matches = [];
    
    const scanDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        if (this.shouldExclude(relativePath)) continue;
        
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          this.scanBinaryFile(fullPath, relativePath);
        }
      }
    };

    scanDir(process.cwd());

    if (this.results.binaryBlobs.clean) {
      this.log('  ✅ Binary blob scan: Clean', 'green');
    } else {
      this.log(`  ❌ Binary blob scan: ${this.results.binaryBlobs.matches.length} matches found`, 'red');
      this.results.binaryBlobs.matches.forEach(match => {
        this.log(`    ${match.file} - ${match.content}`, 'yellow');
      });
    }
  }

  generateReport() {
    const timestamp = new Date().toISOString();
    const allMatches = [
      ...this.results.workingTree.matches,
      ...this.results.gitHistory.matches,
      ...this.results.tempFiles.matches,
      ...this.results.binaryBlobs.matches
    ];

    const report = `# Genesis Verification Report

**Generated**: ${timestamp}
**Search Term**: ${SEARCH_TERM}
**Detailed Mode**: ${this.detailed ? 'Yes' : 'No'}

## Summary

- Working tree files: ${this.results.workingTree.clean ? '✅ Clean' : `❌ ${this.results.workingTree.matches.length} matches`}
- Git history: ${this.results.gitHistory.clean ? '✅ Clean' : `❌ ${this.results.gitHistory.matches.length} matches`}
- Temporary/backup files: ${this.results.tempFiles.clean ? '✅ Clean' : `❌ ${this.results.tempFiles.matches.length} matches`}
- Binary blob scan: ${this.results.binaryBlobs.clean ? '✅ Clean' : `❌ ${this.results.binaryBlobs.matches.length} matches`}

**Total matches found**: ${allMatches.length}
**Repository status**: ${allMatches.length === 0 ? 'CLEAN' : 'CONTAINS REFERENCES'}

## Detailed Results

${this.formatMatches('Working Tree Files', this.results.workingTree.matches)}
${this.formatMatches('Git History', this.results.gitHistory.matches)}
${this.formatMatches('Temporary/Backup Files', this.results.tempFiles.matches)}
${this.detailed ? this.formatMatches('Binary Blobs', this.results.binaryBlobs.matches) : ''}

## Exclusion Patterns

The following patterns were excluded from scanning:
${EXCLUDE_PATTERNS.map(p => `- ${p}`).join('\n')}

## Recommendations

${allMatches.length === 0 ? 
  'No action required. Repository is clean of genesis references.' :
  `Found ${allMatches.length} references to "${SEARCH_TERM}". Review and remove if these are unintentional leaks.`}

---
*Report generated by verify-clean-genesis.js*
`;

    return report;
  }

  formatMatches(section, matches) {
    if (matches.length === 0) {
      return `### ${section}\n\nNo matches found.\n`;
    }

    let output = `### ${section}\n\nFound ${matches.length} matches:\n\n`;
    matches.forEach((match, index) => {
      output += `${index + 1}. **${match.file || match.commit}**`;
      if (match.line) output += `:${match.line}`;
      output += `\n   \`${match.content}\`\n   *Type: ${match.type}*\n\n`;
    });

    return output;
  }

  async saveReport() {
    const report = this.generateReport();
    
    // Ensure report directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }

    const reportPath = path.join(this.reportDir, 'genesis-verification-report.md');
    fs.writeFileSync(reportPath, report, 'utf8');

    this.log(`\n📄 Report saved to: ${reportPath}`, 'blue');
    return reportPath;
  }

  printSummary() {
    this.log('\n' + '='.repeat(60), 'bold');
    this.log('GENESIS VERIFICATION SUMMARY', 'bold');
    this.log('='.repeat(60), 'bold');
    
    const sections = [
      { name: 'Working tree files', result: this.results.workingTree },
      { name: 'Git history', result: this.results.gitHistory },
      { name: 'Temporary/backup files', result: this.results.tempFiles }
    ];

    if (this.detailed) {
      sections.push({ name: 'Binary blob scan', result: this.results.binaryBlobs });
    }

    sections.forEach(section => {
      const status = section.result.clean ? '✅ Clean' : `❌ ${section.result.matches.length} matches`;
      const color = section.result.clean ? 'green' : 'red';
      this.log(`${section.name}: ${status}`, color);
    });

    const totalMatches = Object.values(this.results)
      .reduce((sum, result) => sum + result.matches.length, 0);

    this.log('\n' + '-'.repeat(60), 'bold');
    this.log(`Total matches: ${totalMatches}`, totalMatches === 0 ? 'green' : 'red');
    this.log(`Repository status: ${totalMatches === 0 ? 'CLEAN' : 'CONTAINS REFERENCES'}`, 
      totalMatches === 0 ? 'green' : 'red');
    this.log('='.repeat(60), 'bold');

    return totalMatches;
  }

  async run() {
    this.log(`\n🔍 Genesis Verification Tool`, 'bold');
    this.log(`Timestamp: ${this.timestamp}`);
    this.log(`Mode: ${this.detailed ? 'Detailed (including binary scan)' : 'Fast scan'}`);
    this.log(`Search term: "${SEARCH_TERM}"`);

    await this.scanWorkingTree();
    await this.scanGitHistory();
    await this.scanTempFiles();
    
    if (this.detailed) {
      await this.scanBinaryBlobs();
    }

    const totalMatches = this.printSummary();
    await this.saveReport();

    return totalMatches === 0 ? 0 : 1; // Exit code
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    detailed: false,
    ci: false,
    reportDir: null
  };

  args.forEach(arg => {
    if (arg === '--detailed') options.detailed = true;
    if (arg === '--ci') options.ci = true;
    if (arg.startsWith('--report-dir=')) {
      options.reportDir = arg.split('=')[1];
    }
  });

  return options;
}

function showHelp() {
  console.log(`
Genesis Verification Tool

Usage: node scripts/verify-clean-genesis.js [options]

Options:
  --detailed      Include binary blob scanning (slower)
  --ci            CI-friendly output (no colors)
  --report-dir=   Custom report directory path
  --help          Show this help message

Examples:
  npm run verify-clean-genesis
  npm run verify-clean-genesis-detailed
  node scripts/verify-clean-genesis.js --detailed --ci

Exit codes:
  0 = Repository is clean
  1 = Genesis references found
`);
}

// Main execution
async function main() {
  const options = parseArgs();

  if (process.argv.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  try {
    const verifier = new GenesisVerifier(options);
    const exitCode = await verifier.run();
    process.exit(exitCode);
  } catch (error) {
    console.error('Error during verification:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { GenesisVerifier };