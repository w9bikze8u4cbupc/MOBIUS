#!/usr/bin/env node

/**
 * MOBIUS Repository Verification Script
 * 
 * Scans the repository for accidental "genesis" references that should be cleaned up.
 * Provides detailed reporting and exit codes for CI integration.
 * 
 * Usage:
 *   node scripts/verify-clean-genesis.js [--detailed] [--report-dir verification-reports]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class GenesisVerifier {
  constructor(options = {}) {
    this.detailed = options.detailed || false;
    this.reportDir = options.reportDir || 'verification-reports';
    this.rootDir = process.cwd();
    this.matches = [];
    this.scannedFiles = 0;
    this.excludePatterns = [
      /node_modules/,
      /\.git/,
      /\.log$/,
      /\.tmp$/,
      /package-lock\.json$/,
      /verification-reports/,
      /ci-run-logs/,
      /\.dockerignore$/,
      /Dockerfile/,
      /\.md$/i,
      /scripts\/verify-clean-genesis\.js$/
    ];
    this.searchPatterns = [
      /genesis/gi,
      /Genesis/g,
      /GENESIS/g
    ];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
    console.log(`[${timestamp}] ${prefix}: ${message}`);
  }

  isExcluded(filePath) {
    const relativePath = path.relative(this.rootDir, filePath);
    return this.excludePatterns.some(pattern => pattern.test(relativePath));
  }

  scanFile(filePath) {
    if (this.isExcluded(filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(this.rootDir, filePath);
      this.scannedFiles++;

      // Check each search pattern
      this.searchPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const lines = content.substring(0, match.index).split('\n');
          const lineNumber = lines.length;
          const lineContent = content.split('\n')[lineNumber - 1];
          
          this.matches.push({
            file: relativePath,
            line: lineNumber,
            column: match.index - (match.index > 0 ? lines[lines.length - 1].length : 0),
            match: match[0],
            context: lineContent.trim(),
            pattern: pattern.toString()
          });
        }
      });
    } catch (error) {
      if (this.detailed) {
        this.log(`Warning: Could not read file ${filePath}: ${error.message}`, 'warn');
      }
    }
  }

  scanDirectory(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (!this.isExcluded(fullPath)) {
            this.scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          this.scanFile(fullPath);
        }
      }
    } catch (error) {
      this.log(`Warning: Could not scan directory ${dirPath}: ${error.message}`, 'warn');
    }
  }

  generateReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFileName = `genesis-verification-${timestamp}.md`;
    
    // Ensure report directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }

    const reportPath = path.join(this.reportDir, reportFileName);
    
    let report = `# Genesis Verification Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Repository:** ${path.basename(this.rootDir)}\n`;
    report += `**Files Scanned:** ${this.scannedFiles}\n`;
    report += `**Matches Found:** ${this.matches.length}\n\n`;

    if (this.matches.length === 0) {
      report += `✅ **CLEAN**: No "genesis" references found in the repository.\n\n`;
      report += `The repository has been verified to be clean of accidental "genesis" references. This indicates that any previous cleanup operations were successful and no residual references remain.\n`;
    } else {
      report += `⚠️ **MATCHES FOUND**: The following "genesis" references were detected:\n\n`;
      
      // Group matches by file
      const matchesByFile = this.matches.reduce((acc, match) => {
        if (!acc[match.file]) acc[match.file] = [];
        acc[match.file].push(match);
        return acc;
      }, {});

      Object.entries(matchesByFile).forEach(([file, fileMatches]) => {
        report += `### ${file}\n\n`;
        fileMatches.forEach(match => {
          report += `- **Line ${match.line}:** \`${match.match}\` in \`${match.context}\`\n`;
        });
        report += `\n`;
      });

      report += `## Recommended Actions\n\n`;
      report += `1. Review each match to determine if it's an accidental reference\n`;
      report += `2. Remove or replace any unintended "genesis" references\n`;
      report += `3. Re-run verification: \`npm run verify-clean-genesis\`\n`;
      report += `4. Commit changes if cleanup is needed\n\n`;
    }

    report += `## Verification Details\n\n`;
    report += `- **Search Patterns:** ${this.searchPatterns.map(p => `\`${p}\``).join(', ')}\n`;
    report += `- **Excluded Patterns:** ${this.excludePatterns.map(p => `\`${p}\``).join(', ')}\n`;
    report += `- **Scan Method:** Recursive directory traversal\n`;
    report += `- **Script Version:** 1.0.0\n\n`;

    if (this.detailed && this.matches.length > 0) {
      report += `## Detailed Match Information\n\n`;
      report += `| File | Line | Column | Match | Context |\n`;
      report += `|------|------|--------|--------|----------|\n`;
      this.matches.forEach(match => {
        const safeContext = match.context.replace(/\|/g, '\\|');
        report += `| ${match.file} | ${match.line} | ${match.column} | \`${match.match}\` | \`${safeContext}\` |\n`;
      });
      report += `\n`;
    }

    // Write report
    fs.writeFileSync(reportPath, report, 'utf8');
    
    return reportPath;
  }

  run() {
    this.log('Starting genesis reference verification...');
    this.log(`Scanning directory: ${this.rootDir}`);
    
    const startTime = Date.now();
    this.scanDirectory(this.rootDir);
    const endTime = Date.now();
    
    this.log(`Scan completed in ${endTime - startTime}ms`);
    this.log(`Files scanned: ${this.scannedFiles}`);
    this.log(`Matches found: ${this.matches.length}`);

    // Generate report
    const reportPath = this.generateReport();
    this.log(`Report generated: ${reportPath}`);

    // Output summary
    if (this.matches.length === 0) {
      this.log('✅ Repository is clean - no genesis references found');
      return 0; // Success
    } else {
      this.log(`⚠️ Found ${this.matches.length} genesis references across ${Object.keys(this.matches.reduce((acc, m) => {acc[m.file] = true; return acc;}, {})).length} files`, 'warn');
      
      if (this.detailed) {
        console.log('\nDetailed matches:');
        this.matches.forEach(match => {
          console.log(`  ${match.file}:${match.line}:${match.column} - "${match.match}" in "${match.context}"`);
        });
      }
      
      return 1; // Found matches
    }
  }
}

// CLI interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    detailed: false,
    reportDir: 'verification-reports'
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--detailed':
        options.detailed = true;
        break;
      case '--report-dir':
        if (i + 1 < args.length) {
          options.reportDir = args[++i];
        }
        break;
      case '--help':
        console.log(`
MOBIUS Genesis Verification Script

Usage: node scripts/verify-clean-genesis.js [options]

Options:
  --detailed          Show detailed match information
  --report-dir DIR    Directory for verification reports (default: verification-reports)
  --help              Show this help message

Exit codes:
  0 - Clean (no genesis references found)
  1 - Matches found (needs cleanup)
  2 - Error during execution
`);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  try {
    const options = parseArgs();
    const verifier = new GenesisVerifier(options);
    const exitCode = verifier.run();
    process.exit(exitCode);
  } catch (error) {
    console.error('ERROR: Verification failed:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(2);
  }
}

module.exports = GenesisVerifier;