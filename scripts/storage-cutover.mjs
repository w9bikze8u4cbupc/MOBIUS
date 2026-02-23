#!/usr/bin/env node

/**
 * Storage Cutover Script - MILESTONE LOCK
 * 
 * Performs explicit, one-way cutover from legacy to canonical storage.
 * This is a LOCKED MILESTONE operation with mandatory validation.
 * 
 * Cutover Process:
 * 1. MANDATORY coherence validation (including DB checks)
 * 2. Write cutover marker with validation hash
 * 3. Re-validate to ensure cutover is clean
 * 4. Enable legacy write blocking (hard-fail mode)
 * 
 * After cutover:
 * - Legacy path writes are HARD-BLOCKED (no exceptions)
 * - Coherence validation is MANDATORY
 * - Any violation is a regression requiring immediate resolution
 * 
 * This is a one-way operation. Rollback requires:
 * - Removing cutover marker
 * - Setting SKIP_LEGACY_WRITE_GUARD=true (DEV-ONLY)
 * - Fixing underlying issues
 * - Re-running cutover when ready
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import {
  getDataRoot,
  getDataDirs,
  isCutoverComplete,
  writeCutoverMarker,
  readCutoverMarker,
  validateNoLegacyPaths
} from '../src/config/storage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force');
const skipValidation = args.includes('--skip-validation');

if (skipValidation) {
  console.log('❌ ERROR: --skip-validation is not allowed');
  console.log('');
  console.log('   Coherence validation is a MANDATORY invariant.');
  console.log('   Cutover cannot proceed without clean validation.');
  console.log('   This is a locked milestone requirement.\n');
  process.exit(1);
}

console.log('🔄 MOBIUS Storage Cutover - MILESTONE LOCK');
console.log('==========================================\n');

// Check if already complete
if (isCutoverComplete()) {
  const marker = readCutoverMarker();
  console.log('✅ Cutover already complete');
  console.log(`   Performed at: ${marker.timestamp}`);
  console.log(`   Data root: ${marker.dataRoot}`);
  console.log('');
  
  if (!force) {
    console.log('   Use --force to re-run cutover\n');
    process.exit(0);
  }
  
  console.log('   --force flag set, proceeding with re-cutover\n');
}

// Warning
console.log('⚠️  WARNING: Cutover is a one-way operation');
console.log('');
console.log('After cutover:');
console.log('  - Legacy path writes will be HARD-BLOCKED');
console.log('  - All code must use canonical paths');
console.log('  - Legacy paths should be manually removed');
console.log('');

if (!force) {
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Step 1: Pre-cutover validation
console.log('📋 Step 1: Pre-cutover validation (MANDATORY)');
console.log('==============================================\n');

console.log('Running MANDATORY coherence validation...\n');

try {
  execSync('node scripts/validate-coherence.mjs', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('');
} catch (error) {
  console.error('❌ CUTOVER BLOCKED: Coherence validation failed');
  console.error('');
  console.error('   Coherence validation is a MANDATORY invariant.');
  console.error('   All violations must be resolved before cutover.');
  console.error('   Review errors above and take corrective action.\n');
  process.exit(1);
}

console.log('Running storage path validation...\n');

try {
  const dirs = getDataDirs();
  console.log(`✅ Canonical directories verified:`);
  console.log(`   Root: ${dirs.root}`);
  console.log(`   DB: ${dirs.db}`);
  console.log(`   Uploads: ${dirs.uploads}`);
  console.log(`   Outputs: ${dirs.outputs}`);
  console.log('');
} catch (error) {
  console.error('❌ Storage validation failed:', error.message);
  process.exit(1);
}

// Step 2: Compute validation hash
console.log('📋 Step 2: Computing validation hash');
console.log('====================================\n');

const dirs = getDataDirs();
const validationData = {
  dataRoot: dirs.root,
  timestamp: new Date().toISOString(),
  directories: {
    db: fs.existsSync(dirs.db),
    uploads: fs.existsSync(dirs.uploads),
    outputs: fs.existsSync(dirs.outputs),
    tmp: fs.existsSync(dirs.tmp)
  }
};

const validationHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(validationData))
  .digest('hex');

console.log(`Validation hash: ${validationHash.substring(0, 16)}...\n`);

// Step 3: Write cutover marker
console.log('📋 Step 3: Writing cutover marker');
console.log('==================================\n');

try {
  const cutoverData = {
    validationHash,
    validationData,
    performedBy: process.env.USER || process.env.USERNAME || 'unknown',
    nodeVersion: process.version,
    platform: process.platform,
    reason: 'Explicit cutover via storage-cutover.mjs'
  };
  
  const markerPath = writeCutoverMarker(cutoverData);
  console.log(`✅ Cutover marker written to: ${markerPath}\n`);
} catch (error) {
  console.error(`❌ Failed to write cutover marker: ${error.message}\n`);
  process.exit(1);
}

// Step 4: Post-cutover validation
console.log('📋 Step 4: Post-cutover validation');
console.log('===================================\n');

console.log('Verifying cutover marker...');
const marker = readCutoverMarker();

if (!marker) {
  console.error('❌ Cutover marker not found after write\n');
  process.exit(1);
}

console.log('✅ Cutover marker verified');
console.log(`   Timestamp: ${marker.timestamp}`);
console.log(`   Performed by: ${marker.performedBy}`);
console.log('');

// Check for legacy paths
console.log('Checking for legacy paths...\n');

try {
  // This will now fail if legacy paths exist (post-cutover)
  validateNoLegacyPaths({ strict: false });
  console.log('✅ No legacy paths detected\n');
} catch (error) {
  console.log('⚠️  Legacy paths still exist:');
  console.log(error.message);
  console.log('');
  console.log('   These should be manually removed after verifying migration.\n');
}

// Step 5: Summary and next steps
console.log('📊 Cutover Complete - MILESTONE LOCKED');
console.log('=======================================\n');

console.log('✅ Storage cutover successful!');
console.log('');
console.log('MILESTONE STATUS: COMPLETE');
console.log('');
console.log('Locked Invariants Now Active:');
console.log('  ✅ DB ↔ filesystem coherence (MANDATORY)');
console.log('  ✅ Legacy write blocking (HARD-FAIL)');
console.log('  ✅ Artifact authority tracking (EXPLICIT)');
console.log('  ✅ Coherence validation (MANDATORY)');
console.log('');
console.log('What changed:');
console.log('  ✅ Cutover marker written');
console.log('  ✅ Legacy write blocking now ACTIVE');
console.log('  ✅ Coherence validation enforced');
console.log('  ✅ No silent regressions possible');
console.log('');
console.log('Next steps:');
console.log('  1. Restart your application');
console.log('  2. Verify all functionality works');
console.log('  3. Monitor logs for any legacy path errors (should be none)');
console.log('  4. After verification, manually remove legacy paths:');
console.log('');
console.log('     # Windows PowerShell');
console.log('     Remove-Item -Recurse -Force src/api/projects.db');
console.log('     Remove-Item -Recurse -Force src/api/uploads');
console.log('     Remove-Item -Recurse -Force uploads');
console.log('     Remove-Item -Recurse -Force out');
console.log('');
console.log('     # Unix/Linux/Mac');
console.log('     rm -rf src/api/projects.db src/api/uploads uploads out');
console.log('');
console.log('  5. Run final validation to confirm cleanup:');
console.log('     npm run storage:validate');
console.log('     npm run storage:coherence');
console.log('');
console.log('IMPORTANT: Any deviation from canonical paths is now a REGRESSION.');
console.log('           All violations must be resolved immediately.');
console.log('');
console.log('Rollback (if needed):');
console.log('  1. Remove cutover marker: rm data/.mobius_cutover.json');
console.log('  2. Set SKIP_LEGACY_WRITE_GUARD=true (DEV-ONLY)');
console.log('  3. Fix underlying issues');
console.log('  4. Re-run cutover when ready');
console.log('');
console.log('This milestone is now LOCKED. Downstream work can proceed safely.');
console.log('');
