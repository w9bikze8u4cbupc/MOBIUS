#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const reportsDir = 'tests/golden/reports';

// Check if reports directory exists
if (!fs.existsSync(reportsDir)) {
  console.error(`[junit-validate] ERROR: Reports directory not found: ${reportsDir}`);
  process.exit(1);
}

// Find all XML files
const xmlFiles = [];
function findXmlFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findXmlFiles(filePath);
    } else if (file.endsWith('.xml')) {
      xmlFiles.push(filePath);
    }
  }
}

findXmlFiles(reportsDir);

if (xmlFiles.length === 0) {
  console.error(`[junit-validate] ERROR: No JUnit XML files found in ${reportsDir}`);
  process.exit(1);
}

console.log(`[junit-validate] Found ${xmlFiles.length} JUnit XML file(s)`);

let totalErrors = 0;
let totalTests = 0;
let totalFailures = 0;
let totalErrorsCount = 0;

// Validate each XML file
for (const xmlFile of xmlFiles) {
  try {
    const content = fs.readFileSync(xmlFile, 'utf8');
    
    // Check if file is empty
    if (content.trim() === '') {
      console.error(`[junit-validate] ERROR: Empty JUnit file: ${xmlFile}`);
      totalErrors++;
      continue;
    }
    
    // Basic XML well-formedness check
    if (!content.includes('<?xml')) {
      console.error(`[junit-validate] ERROR: Not well-formed XML (missing XML declaration): ${xmlFile}`);
      totalErrors++;
      continue;
    }
    
    // Check for required JUnit elements
    if (!content.includes('<testsuites') && !content.includes('<testsuite')) {
      console.error(`[junit-validate] ERROR: Invalid JUnit format (missing testsuites/testsuites): ${xmlFile}`);
      totalErrors++;
      continue;
    }
    
    // Extract basic statistics
    const testsMatch = content.match(/tests="(\d+)"/g);
    const failuresMatch = content.match(/failures="(\d+)"/g);
    const errorsMatch = content.match(/errors="(\d+)"/g);
    
    const tests = testsMatch ? testsMatch.map(m => parseInt(m.match(/\d+/)[0])).reduce((a, b) => a + b, 0) : 0;
    const failures = failuresMatch ? failuresMatch.map(m => parseInt(m.match(/\d+/)[0])).reduce((a, b) => a + b, 0) : 0;
    const errors = errorsMatch ? errorsMatch.map(m => parseInt(m.match(/\d+/)[0])).reduce((a, b) => a + b, 0) : 0;
    
    totalTests += tests;
    totalFailures += failures;
    totalErrorsCount += errors;
    
    console.log(`[junit-validate] ${path.basename(xmlFile)}: ${tests} tests, ${failures} failures, ${errors} errors`);
    
    // Show first 5 failing tests if any
    if (failures > 0 || errors > 0) {
      const failureMatches = [...content.matchAll(/<failure[^>]*>(.*?)<\/failure>/gs)];
      const errorMatches = [...content.matchAll(/<error[^>]*>(.*?)<\/error>/gs)];
      
      const issues = [...failureMatches.map(m => m[1]), ...errorMatches.map(m => m[1])].slice(0, 5);
      if (issues.length > 0) {
        console.log(`[junit-validate] First ${issues.length} issues:`);
        issues.forEach((issue, i) => {
          console.log(`  ${i+1}. ${issue.substring(0, 100)}${issue.length > 100 ? '...' : ''}`);
        });
      }
    }
  } catch (err) {
    console.error(`[junit-validate] ERROR: Failed to read/parse ${xmlFile}: ${err.message}`);
    totalErrors++;
  }
}

// Summary
console.log(`\n[junit-validate] Summary: ${totalTests} tests, ${totalFailures} failures, ${totalErrorsCount} errors, ${totalErrors} malformed files`);

if (totalErrors > 0) {
  console.error(`[junit-validate] FAILED: ${totalErrors} JUnit file(s) are malformed or empty`);
  process.exit(1);
} else {
  console.log(`[junit-validate] OK: All JUnit files are well-formed and non-empty`);
}