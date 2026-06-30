#!/usr/bin/env node

/**
 * validate-tutorial-preview-frame-fingerprints.mjs — Golden frame fingerprint validator.
 *
 * Compares SHA-256 hashes and byte sizes of generated visual QA frames/contact sheet
 * against a committed fingerprint baseline. Detects unintended visual drift at the
 * byte level without requiring subjective visual scoring.
 *
 * Usage:
 *   node scripts/validate-tutorial-preview-frame-fingerprints.mjs
 *   node scripts/validate-tutorial-preview-frame-fingerprints.mjs --dir out/tutorial-preview --baseline tests/golden/tutorial-preview/gem-collectors-frame-fingerprints.json
 *   node scripts/validate-tutorial-preview-frame-fingerprints.mjs --dir out/tutorial-preview/hanamikoji --slug hanamikoji
 *
 * Exit codes:
 *   0 = all fingerprints match baseline
 *   1 = one or more fingerprint drifts detected
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const dir = getArg('dir') || resolve('out/tutorial-preview');
const fixtureSlug = getArg('slug') || 'gem-collectors';
const baselinePath = getArg('baseline') || resolve('tests/golden/tutorial-preview', `${fixtureSlug}-frame-fingerprints.json`);

// ---------------------------------------------------------------------------
// Load baseline
// ---------------------------------------------------------------------------
if (!existsSync(baselinePath)) {
  console.error(`Baseline file not found: ${baselinePath}`);
  process.exit(1);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch (err) {
  console.error(`Invalid baseline JSON: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(baseline.images) || baseline.images.length === 0) {
  console.error('Baseline has no "images" array or it is empty');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load visual QA manifest for timestamp cross-reference
// ---------------------------------------------------------------------------
const manifestPath = join(dir, 'visual-qa/visual-qa-manifest.json');
let manifest = null;
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch { /* ignored — timestamp checks will be skipped */ }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const errors = [];
const timestampTolerance = baseline.timestampTolerance || 0.5;

function fail(msg) {
  errors.push(msg);
}

function computeSha256(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

console.log('[frame-fingerprints] Golden Visual Fingerprint Validation');
console.log(`  dir: ${dir}`);
console.log(`  baseline: ${baselinePath}`);
console.log(`  images: ${baseline.images.length}`);
console.log(`  timestamp tolerance: ${timestampTolerance}s`);
console.log('');

for (const entry of baseline.images) {
  const filePath = join(dir, entry.path);
  const label = entry.path;

  // File existence
  if (!existsSync(filePath)) {
    fail(`[${label}] Missing file`);
    continue;
  }

  // Non-zero check
  const stat = statSync(filePath);
  if (stat.size === 0) {
    fail(`[${label}] File is empty (0 bytes)`);
    continue;
  }

  // SHA-256 hash comparison
  const actualHash = computeSha256(filePath);
  if (actualHash !== entry.sha256) {
    fail(`[${label}] SHA-256 drift: expected=${entry.sha256.slice(0, 16)}..., actual=${actualHash.slice(0, 16)}...`);
  }

  // Byte size comparison
  if (stat.size !== entry.size) {
    fail(`[${label}] Size drift: expected=${entry.size}, actual=${stat.size}`);
  }

  // Timestamp cross-reference for frames
  if (entry.role === 'frame' && entry.timestamp !== undefined && manifest) {
    const manifestTs = manifest.timestamps?.[entry.index - 1];
    if (manifestTs !== undefined) {
      if (Math.abs(manifestTs - entry.timestamp) > timestampTolerance) {
        fail(`[${label}] Timestamp drift: baseline=${entry.timestamp}, manifest=${manifestTs} (tol=${timestampTolerance})`);
      }
    }
  }

  // Log success per image
  if (!errors.some((e) => e.startsWith(`[${label}]`))) {
    console.log(`  OK ${label} (${stat.size} bytes, hash matches)`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('');
if (errors.length === 0) {
  console.log(`[frame-fingerprints] ALL FINGERPRINTS MATCH (${baseline.images.length} images verified)`);
  process.exit(0);
} else {
  console.error(`[frame-fingerprints] FAILED: ${errors.length} fingerprint drift(s) detected:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
