#!/usr/bin/env node

/**
 * validate-real-input-preview-artifact.mjs — Contract validator for real-input artifacts.
 *
 * Unlike the deterministic preview validator (validate-tutorial-preview-artifact.mjs)
 * which uses hardcoded duration/content thresholds calibrated to golden baselines,
 * this validator is driven by an external expected-contract JSON file.
 *
 * Usage:
 *   node scripts/validate-real-input-preview-artifact.mjs --dir <artifact-dir> --expected <expected-json>
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more contract violations found
 *   2 = invalid arguments or missing expected JSON
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { validateRealInputArtifact } = require('./validate-real-input-preview-artifact.cjs');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const dir = getArg('dir');
const expectedPath = getArg('expected');

if (!dir || !expectedPath) {
  console.error('Usage: node scripts/validate-real-input-preview-artifact.mjs --dir <artifact-dir> --expected <expected-json>');
  process.exit(2);
}

const resolvedDir = resolve(dir);
const resolvedExpected = resolve(expectedPath);

if (!existsSync(resolvedExpected)) {
  console.error(`[validate-real-input] Expected contract file not found: ${resolvedExpected}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Load expected contract
// ---------------------------------------------------------------------------
let expected;
try {
  expected = JSON.parse(readFileSync(resolvedExpected, 'utf8'));
} catch (err) {
  console.error(`[validate-real-input] Failed to parse expected contract JSON: ${err.message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// CLI execution
// ---------------------------------------------------------------------------
console.log(`[validate-real-input] Artifact directory: ${resolvedDir}`);
console.log(`[validate-real-input] Expected contract: ${resolvedExpected}`);
console.log('[validate-real-input] Running contract checks...');

const result = validateRealInputArtifact(resolvedDir, expected);

console.log('');
if (result.passed) {
  const artifactCount = (expected.requiredArtifacts || []).length;
  console.log(`[validate-real-input] ALL CHECKS PASSED (${artifactCount} artifacts, media contract, identity contract)`);
  process.exit(0);
} else {
  console.error(`[validate-real-input] FAILED: ${result.errors.length} contract violation(s):`);
  result.errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
