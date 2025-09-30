#!/usr/bin/env node

/**
 * Verify Clean Genesis - Repository Cleanliness Checker
 * 
 * Scans the repository for accidental references to "genesis" that may have
 * been introduced during development. Excludes node_modules, .git, and other
 * standard ignore patterns.
 * 
 * Exit codes:
 *   0 - No matches found (clean)
 *   1 - Matches found or error occurred
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Configuration
const SEARCH_PATTERN = 'genesis';
const REPORT_DIR = 'verification-reports';
const EXCLUDE_PATTERNS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tmp',
  'temp',
  '*.log',
  'verification-reports',
  'ci-run-logs',
  '.dockerignore',
  'Dockerfile*',
  'docker-compose*.yml',
  'verify-clean-genesis.js',
  'finish_mobius_release.sh',
  'package.json',
  'package-lock.json',
  '*.yml',
  '*.yaml',
];

// Parse command line arguments
const args = process.argv.slice(2);
const isDetailed = args.includes('--detailed') || args.includes('-d');
const isQuiet = args.includes('--quiet') || args.includes('-q');

function log(message) {
  if (!isQuiet) {
    console.log(message);
  }
}

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function searchRepository(pattern, detailed = false) {
  const excludeArgs = EXCLUDE_PATTERNS.flatMap(p => ['--exclude-dir', p, '--exclude', p]);
  
  const grepArgs = [
    '-r',           // recursive
    '-n',           // line numbers
    '-i',           // case-insensitive
    '--color=never',
    ...excludeArgs,
    pattern,
    '.'
  ];

  if (detailed) {
    grepArgs.splice(1, 0, '-C', '2'); // Add 2 lines of context
  }

  log(`🔍 Scanning repository for pattern: "${pattern}"`);
  log(`   Excluded patterns: ${EXCLUDE_PATTERNS.join(', ')}`);
  
  const result = spawnSync('grep', grepArgs, {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024 // 10MB
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
    error: result.error
  };
}

function generateReport(searchResult, pattern, detailed = false) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportName = `verification-${timestamp}.md`;
  const reportPath = path.join(REPORT_DIR, reportName);
  
  const lines = searchResult.stdout.trim().split('\n').filter(l => l.length > 0);
  const matchCount = lines.length;
  
  let reportContent = `# Repository Verification Report\n\n`;
  reportContent += `**Date:** ${new Date().toISOString()}\n`;
  reportContent += `**Pattern:** \`${pattern}\` (case-insensitive)\n`;
  reportContent += `**Mode:** ${detailed ? 'Detailed' : 'Fast'}\n`;
  reportContent += `**Matches Found:** ${matchCount}\n\n`;
  
  if (matchCount === 0) {
    reportContent += `✅ **PASSED** - No matches found. Repository is clean.\n\n`;
    reportContent += `The repository was scanned for references to "${pattern}" and none were found.\n`;
    reportContent += `Excluded directories: ${EXCLUDE_PATTERNS.join(', ')}\n`;
  } else {
    reportContent += `❌ **FAILED** - Found ${matchCount} match(es).\n\n`;
    reportContent += `## Matches\n\n`;
    reportContent += '```\n';
    reportContent += searchResult.stdout.trim();
    reportContent += '\n```\n\n';
    reportContent += `## Action Required\n\n`;
    reportContent += `Please review the matches above and remove any accidental references.\n`;
  }
  
  reportContent += `\n## Verification Details\n\n`;
  reportContent += `- Working Directory: ${process.cwd()}\n`;
  reportContent += `- Excluded Patterns: ${EXCLUDE_PATTERNS.join(', ')}\n`;
  reportContent += `- Search Tool: grep (recursive, case-insensitive)\n`;
  
  ensureReportDir();
  fs.writeFileSync(reportPath, reportContent, 'utf8');
  
  return { reportPath, matchCount };
}

function main() {
  log('');
  log('='.repeat(70));
  log('  MOBIUS Repository Verification');
  log('  Checking for accidental "genesis" references');
  log('='.repeat(70));
  log('');
  
  const searchResult = searchRepository(SEARCH_PATTERN, isDetailed);
  
  if (searchResult.error) {
    console.error(`❌ Error running grep: ${searchResult.error.message}`);
    process.exit(1);
  }
  
  const { reportPath, matchCount } = generateReport(searchResult, SEARCH_PATTERN, isDetailed);
  
  log('');
  log(`📄 Report saved to: ${reportPath}`);
  log('');
  
  if (matchCount === 0) {
    log('✅ VERIFICATION PASSED - Repository is clean!');
    log('');
    process.exit(0);
  } else {
    log(`❌ VERIFICATION FAILED - Found ${matchCount} match(es)`);
    log('');
    log('Please review the report and remove any accidental references.');
    log('');
    if (!isDetailed) {
      log('💡 Tip: Run with --detailed flag for more context around matches');
    }
    log('');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { searchRepository, generateReport };
