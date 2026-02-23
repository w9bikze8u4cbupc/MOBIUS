#!/usr/bin/env node
// scripts/smoke/verify-dryrun-stubs.mjs
// Smoke test: verify dry-run stub artifacts exist and are correctly labeled

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const RUNLOG_PATH = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json');
const REVIEW_PATH = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md');

let exitCode = 0;
const errors = [];

console.log('='.repeat(80));
console.log('SMOKE TEST: Verify Dry-Run Stub Artifacts');
console.log('='.repeat(80));
console.log('');

// Check runlog JSON exists
console.log('Checking runlog JSON...');
if (!existsSync(RUNLOG_PATH)) {
  errors.push(`❌ Runlog JSON not found: ${RUNLOG_PATH}`);
  exitCode = 1;
} else {
  console.log(`  ✅ File exists: ${RUNLOG_PATH}`);
  
  // Validate runlog content
  try {
    const runlog = JSON.parse(readFileSync(RUNLOG_PATH, 'utf8'));
    
    // Check mode field
    if (runlog.mode !== 'DRY_RUN') {
      errors.push(`❌ Runlog mode is "${runlog.mode}", expected "DRY_RUN"`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Mode: ${runlog.mode}`);
    }
    
    // Check execution status
    if (runlog.execution?.status !== 'DRY_RUN_COMPLETE') {
      errors.push(`❌ Runlog execution status is "${runlog.execution?.status}", expected "DRY_RUN_COMPLETE"`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Status: ${runlog.execution.status}`);
    }
    
    // Check objectiveQc status
    if (runlog.objectiveQc?.status !== 'SKIPPED_DRY_RUN') {
      errors.push(`❌ Runlog objectiveQc status is "${runlog.objectiveQc?.status}", expected "SKIPPED_DRY_RUN"`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Objective QC: ${runlog.objectiveQc.status}`);
    }
    
    // Check artifacts are empty
    if (Object.keys(runlog.artifacts || {}).length > 0) {
      errors.push(`❌ Runlog artifacts should be empty in dry-run, found ${Object.keys(runlog.artifacts).length} entries`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Artifacts: empty (as expected)`);
    }
    
  } catch (error) {
    errors.push(`❌ Failed to parse runlog JSON: ${error.message}`);
    exitCode = 1;
  }
}

console.log('');

// Check review MD exists
console.log('Checking QC review MD...');
if (!existsSync(REVIEW_PATH)) {
  errors.push(`❌ QC review MD not found: ${REVIEW_PATH}`);
  exitCode = 1;
} else {
  console.log(`  ✅ File exists: ${REVIEW_PATH}`);
  
  // Validate review content
  try {
    const review = readFileSync(REVIEW_PATH, 'utf8');
    
    // Check for DRY RUN marker
    if (!review.includes('DRY RUN')) {
      errors.push(`❌ QC review does not contain "DRY RUN" marker`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Contains "DRY RUN" marker`);
    }
    
    // Check for DRY_RUN verdict
    if (!review.includes('DRY_RUN')) {
      errors.push(`❌ QC review does not contain "DRY_RUN" verdict`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Contains "DRY_RUN" verdict`);
    }
    
    // Check for warning about no artifacts
    if (!review.includes('No video artifacts were produced') && !review.includes('no artifacts were produced')) {
      errors.push(`❌ QC review does not warn about no artifacts produced`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Contains no-artifacts warning`);
    }
    
  } catch (error) {
    errors.push(`❌ Failed to read QC review MD: ${error.message}`);
    exitCode = 1;
  }
}

console.log('');
console.log('='.repeat(80));

if (exitCode === 0) {
  console.log('✅ SMOKE TEST PASSED');
  console.log('');
  console.log('All dry-run stub artifacts are present and correctly labeled:');
  console.log(`  - ${RUNLOG_PATH}`);
  console.log(`  - ${REVIEW_PATH}`);
} else {
  console.log('❌ SMOKE TEST FAILED');
  console.log('');
  console.log('Errors:');
  errors.forEach(error => console.log(`  ${error}`));
  console.log('');
  console.log('Expected stub artifacts:');
  console.log(`  - ${RUNLOG_PATH} (mode: "DRY_RUN")`);
  console.log(`  - ${REVIEW_PATH} (contains "DRY RUN" marker)`);
}

console.log('='.repeat(80));

process.exit(exitCode);
