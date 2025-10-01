#!/usr/bin/env node
/* verify-clean-genesis.js
 * Minimal verification script for CI:
 * - checks package.json exists
 * - checks dependencies exist in package.json
 * - checks node_modules exists
 * - checks git working tree is clean (skipped in CI)
 * - writes a timestamped JSON report to verification-reports/
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const outDir = 'verification-reports';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, `verify-clean-genesis-${Date.now()}.json`);

const result = { timestamp: new Date().toISOString(), checks: {}, status: 'pass' };

// Check if verbose mode is enabled
const verbose = process.argv.includes('--verbose');

function log(message) {
  if (verbose) {
    console.log(message);
  }
}

// package.json
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  result.checks.package_json = { ok: true };
  log('✓ package.json found and valid');
  
  const deps = pkg.dependencies || {};
  const requiredDeps = ['express', 'cors'];
  
  requiredDeps.forEach(d => {
    result.checks[`dep:${d}`] = { found: Boolean(deps[d]), version: deps[d] || null };
    if (deps[d]) {
      log(`✓ ${d} found: ${deps[d]}`);
    } else {
      console.error(`✗ ${d} not found in dependencies`);
      result.status = 'fail';
    }
  });
} catch (e) {
  result.checks.package_json = { ok: false, error: String(e) };
  console.error('✗ package.json check failed:', e.message);
  result.status = 'fail';
}

// node_modules
result.checks.node_modules = { exists: fs.existsSync('node_modules') };
if (result.checks.node_modules.exists) {
  log('✓ node_modules directory exists');
} else {
  console.error('✗ node_modules directory not found');
  result.status = 'fail';
}

// git clean check (skip in CI)
const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
if (!isCI) {
  try {
    const out = execSync('git status --porcelain', { encoding: 'utf8' });
    result.checks.git_clean = { 
      clean: out.trim().length === 0, 
      summary: out.trim().split(/\r?\n/).filter(Boolean).slice(0, 20) 
    };
    if (out.trim().length === 0) {
      log('✓ Git working tree is clean');
    } else {
      console.error('✗ Git working tree has uncommitted changes');
      if (verbose) {
        console.error('  Uncommitted changes:');
        out.trim().split(/\r?\n/).slice(0, 10).forEach(line => {
          console.error(`    ${line}`);
        });
      }
      result.status = 'fail';
    }
  } catch (e) {
    result.checks.git_clean = { error: String(e) };
    console.error('✗ Git check failed:', e.message);
    result.status = 'fail';
  }
} else {
  result.checks.git_clean = { skipped: true };
  log('ℹ Git clean check skipped (CI environment)');
}

fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
console.log(`Report written to: ${reportPath}`);

if (result.status === 'pass') {
  console.log('✓ All checks passed');
  process.exit(0);
} else {
  console.error('✗ Verification failed');
  process.exit(1);
}
