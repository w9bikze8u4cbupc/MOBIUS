#!/usr/bin/env node

/**
 * Verification script to check for unwanted "genesis" references in the codebase
 * This ensures repository cleanliness and prevents accidental artifacts
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Configuration
const SEARCH_TERM = 'genesis';
const REPORT_DIR = 'verification-reports';
const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'verification-reports',
  'ci-run-logs',
  '.npmrc',
  'package-lock.json'
];

const EXCLUDED_EXTENSIONS = [
  '.log',
  '.tmp',
  '.cache',
  '.lock'
];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function createReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function shouldExcludePath(filePath) {
  const normalized = path.normalize(filePath);
  
  // Check excluded paths
  for (const excluded of EXCLUDED_PATHS) {
    if (normalized.includes(excluded)) {
      return true;
    }
  }
  
  // Check excluded extensions
  const ext = path.extname(filePath);
  if (EXCLUDED_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  return false;
}

function findFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    
    if (shouldExcludePath(fullPath)) {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      findFiles(fullPath, files);
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const matches = [];
    
    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes(SEARCH_TERM)) {
        matches.push({
          line: index + 1,
          content: line.trim(),
          match: line.toLowerCase().indexOf(SEARCH_TERM)
        });
      }
    });
    
    return matches;
  } catch (error) {
    // Skip binary files or files we can't read
    return [];
  }
}

function generateReport(results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(REPORT_DIR, `verification-report-${timestamp}.md`);
  
  let report = `# Repository Verification Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Search Term:** "${SEARCH_TERM}"\n`;
  report += `**Total Files Scanned:** ${results.totalFiles}\n`;
  report += `**Files with Matches:** ${results.matchedFiles.length}\n`;
  report += `**Total Matches:** ${results.totalMatches}\n\n`;
  
  if (results.matchedFiles.length === 0) {
    report += `✅ **VERIFICATION PASSED** - No "${SEARCH_TERM}" references found\n\n`;
    report += `The repository is clean and contains no unwanted "${SEARCH_TERM}" references.\n`;
  } else {
    report += `❌ **VERIFICATION FAILED** - Found "${SEARCH_TERM}" references\n\n`;
    
    results.matchedFiles.forEach(file => {
      report += `## ${file.path}\n\n`;
      file.matches.forEach(match => {
        report += `- **Line ${match.line}:** \`${match.content}\`\n`;
      });
      report += '\n';
    });
    
    report += `## Remediation\n\n`;
    report += `The following files contain "${SEARCH_TERM}" references and should be reviewed:\n\n`;
    results.matchedFiles.forEach(file => {
      report += `- ${file.path}\n`;
    });
  }
  
  fs.writeFileSync(reportFile, report);
  log(`Report generated: ${reportFile}`);
  
  return {
    reportFile,
    passed: results.matchedFiles.length === 0
  };
}

function main() {
  log('Starting repository verification...');
  log(`Searching for "${SEARCH_TERM}" references`);
  
  createReportDir();
  
  const startTime = Date.now();
  const files = findFiles(process.cwd());
  const results = {
    totalFiles: files.length,
    matchedFiles: [],
    totalMatches: 0
  };
  
  log(`Scanning ${files.length} files...`);
  
  files.forEach(filePath => {
    const matches = searchInFile(filePath);
    if (matches.length > 0) {
      const relativePath = path.relative(process.cwd(), filePath);
      results.matchedFiles.push({
        path: relativePath,
        matches: matches
      });
      results.totalMatches += matches.length;
    }
  });
  
  const duration = Date.now() - startTime;
  log(`Scan completed in ${duration}ms`);
  
  const report = generateReport(results);
  
  if (report.passed) {
    log('✅ Verification PASSED - Repository is clean');
    process.exit(0);
  } else {
    log('❌ Verification FAILED - Found unwanted references');
    log(`See report: ${report.reportFile}`);
    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  main();
}

module.exports = {
  main,
  searchInFile,
  findFiles,
  generateReport
};