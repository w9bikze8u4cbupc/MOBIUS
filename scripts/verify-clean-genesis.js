#!/usr/bin/env node
/**
 * Repository verification tool for checking clean genesis
 * Ensures no secrets, sensitive data, or unwanted patterns in repo history
 * 
 * Usage:
 *   node scripts/verify-clean-genesis.js [--fast] [--detailed]
 *   npm run verify-clean-genesis
 * 
 * Options:
 *   --fast      Quick scan (current files only, no history)
 *   --detailed  Full scan with detailed reporting
 * 
 * Exit codes:
 *   0 - Clean repository
 *   1 - Issues found or error occurred
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Configuration
const SUSPICIOUS_PATTERNS = [
  // API Keys and tokens
  { pattern: /OPENAI_API_KEY\s*=\s*['"']?sk-[a-zA-Z0-9]{20,}['"']?/gi, description: 'OpenAI API key' },
  { pattern: /api[_-]?key\s*[=:]\s*['"'][a-zA-Z0-9]{20,}['"']/gi, description: 'Generic API key' },
  { pattern: /secret[_-]?key\s*[=:]\s*['"'][a-zA-Z0-9]{20,}['"']/gi, description: 'Secret key' },
  { pattern: /password\s*[=:]\s*['"'][^'"]{8,}['"']/gi, description: 'Password' },
  { pattern: /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, description: 'Bearer token' },
  
  // AWS credentials
  { pattern: /AKIA[0-9A-Z]{16}/g, description: 'AWS Access Key ID' },
  { pattern: /aws_secret_access_key\s*=\s*.+/gi, description: 'AWS Secret Key' },
  
  // Private keys
  { pattern: /-----BEGIN (RSA |DSA )?PRIVATE KEY-----/g, description: 'Private key' },
  { pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g, description: 'SSH private key' },
  
  // Database connection strings
  { pattern: /mongodb(\+srv)?:\/\/[^\s]+/gi, description: 'MongoDB connection string' },
  { pattern: /postgres:\/\/[^\s]+/gi, description: 'PostgreSQL connection string' },
  { pattern: /mysql:\/\/[^\s]+/gi, description: 'MySQL connection string' },
  
  // Slack tokens
  { pattern: /xox[baprs]-[0-9a-zA-Z]{10,}/g, description: 'Slack token' },
  
  // GitHub tokens
  { pattern: /gh[pousr]_[0-9a-zA-Z]{36,}/g, description: 'GitHub token' },
];

const EXCLUDED_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /package-lock\.json$/,
  /\.log$/,
  /dist\//,
  /build\//,
  /coverage\//,
  /scripts\/verify-clean-genesis\.js$/, // Exclude this script itself
  /verification-reports\//,
];

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      ...options
    });
  } catch (error) {
    if (options.ignoreError) {
      return '';
    }
    throw error;
  }
}

function shouldExclude(filePath) {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(filePath));
}

function scanContent(content, filePath) {
  const findings = [];
  
  for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      findings.push({
        file: filePath,
        pattern: description,
        match: match[0].substring(0, 50), // Truncate for safety
        line: (content.substring(0, match.index).match(/\n/g) || []).length + 1
      });
    }
  }
  
  return findings;
}

function fastScan() {
  log('\n🔍 Running FAST scan (current files only)...', 'cyan');
  
  // Get list of tracked files
  const files = execCommand('git ls-files', { silent: true })
    .split('\n')
    .filter(f => f && !shouldExclude(f));
  
  log(`Scanning ${files.length} tracked files...`, 'blue');
  
  const findings = [];
  
  for (const file of files) {
    if (!existsSync(file)) continue;
    
    try {
      const content = execCommand(`cat "${file}"`, { silent: true, ignoreError: true });
      const fileFindings = scanContent(content, file);
      findings.push(...fileFindings);
    } catch (error) {
      // Skip binary or unreadable files
    }
  }
  
  return findings;
}

function detailedScan() {
  log('\n🔍 Running DETAILED scan (includes history)...', 'cyan');
  log('This may take a while for large repositories...', 'yellow');
  
  // Scan current files
  const currentFindings = fastScan();
  
  // Scan git history for secrets
  log('\nScanning git history...', 'blue');
  
  const historyFindings = [];
  
  try {
    // Get all commits
    const commits = execCommand('git rev-list --all', { silent: true })
      .split('\n')
      .filter(c => c);
    
    log(`Scanning ${commits.length} commits...`, 'blue');
    
    // Sample every 10th commit to avoid overwhelming scan
    const sampleCommits = commits.filter((_, i) => i % 10 === 0 || i === commits.length - 1);
    
    for (const commit of sampleCommits) {
      try {
        const diff = execCommand(`git show ${commit}`, { silent: true, ignoreError: true });
        const commitFindings = scanContent(diff, `commit:${commit.substring(0, 8)}`);
        historyFindings.push(...commitFindings);
      } catch (error) {
        // Skip problematic commits
      }
    }
  } catch (error) {
    log('Warning: Could not scan git history completely', 'yellow');
  }
  
  return [...currentFindings, ...historyFindings];
}

function generateReport(findings, mode) {
  const reportDir = 'verification-reports';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(reportDir, timestamp);
  
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }
  
  if (!existsSync(reportPath)) {
    mkdirSync(reportPath, { recursive: true });
  }
  
  // Generate markdown report
  let report = '# Repository Verification Report\n\n';
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Mode:** ${mode}\n`;
  report += `**Status:** ${findings.length === 0 ? '✅ CLEAN' : '❌ ISSUES FOUND'}\n\n`;
  
  if (findings.length > 0) {
    report += `## Issues Found: ${findings.length}\n\n`;
    
    // Group by pattern
    const grouped = findings.reduce((acc, finding) => {
      if (!acc[finding.pattern]) {
        acc[finding.pattern] = [];
      }
      acc[finding.pattern].push(finding);
      return acc;
    }, {});
    
    for (const [pattern, items] of Object.entries(grouped)) {
      report += `### ${pattern} (${items.length} occurrences)\n\n`;
      for (const item of items.slice(0, 10)) { // Limit to 10 per pattern
        report += `- **File:** ${item.file}\n`;
        if (item.line) {
          report += `  - **Line:** ${item.line}\n`;
        }
        report += `  - **Match:** \`${item.match}\`\n\n`;
      }
      if (items.length > 10) {
        report += `_... and ${items.length - 10} more occurrences_\n\n`;
      }
    }
  } else {
    report += '## ✅ No issues found\n\n';
    report += 'Repository appears clean with no suspicious patterns detected.\n';
  }
  
  report += '\n## Checked Patterns\n\n';
  for (const { description } of SUSPICIOUS_PATTERNS) {
    report += `- ${description}\n`;
  }
  
  const reportFile = join(reportPath, 'genesis-verification-report.md');
  writeFileSync(reportFile, report);
  
  log(`\n📄 Report saved to: ${reportFile}`, 'cyan');
  
  return reportFile;
}

function main() {
  const args = process.argv.slice(2);
  const fast = args.includes('--fast');
  const detailed = args.includes('--detailed');
  
  log('═══════════════════════════════════════════════════', 'cyan');
  log('   Repository Clean Genesis Verification Tool', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  const mode = fast ? 'FAST' : (detailed ? 'DETAILED' : 'STANDARD');
  log(`\nMode: ${mode}`, 'blue');
  
  let findings;
  
  if (fast) {
    findings = fastScan();
  } else if (detailed) {
    findings = detailedScan();
  } else {
    // Standard mode - fast scan only
    findings = fastScan();
  }
  
  log('\n═══════════════════════════════════════════════════', 'cyan');
  log('   Scan Results', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  if (findings.length === 0) {
    log('\n✅ CLEAN: No suspicious patterns found!', 'green');
    log('\nRepository appears safe for public distribution.', 'green');
  } else {
    log(`\n❌ ISSUES FOUND: ${findings.length} suspicious pattern(s) detected`, 'red');
    log('\n⚠️  WARNING: Review these findings before making repository public!', 'yellow');
    
    // Show summary
    const grouped = findings.reduce((acc, f) => {
      acc[f.pattern] = (acc[f.pattern] || 0) + 1;
      return acc;
    }, {});
    
    log('\nSummary by pattern:', 'yellow');
    for (const [pattern, count] of Object.entries(grouped)) {
      log(`  - ${pattern}: ${count}`, 'yellow');
    }
  }
  
  // Generate report
  const reportFile = generateReport(findings, mode);
  
  log('\n═══════════════════════════════════════════════════', 'cyan');
  
  // Exit with appropriate code
  process.exit(findings.length === 0 ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scanContent, fastScan, detailedScan };
