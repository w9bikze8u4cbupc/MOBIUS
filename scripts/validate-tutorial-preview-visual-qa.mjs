#!/usr/bin/env node

/**
 * validate-tutorial-preview-visual-qa.mjs — Visual QA contract validator.
 *
 * Validates the visual QA output directory (contact sheet, frames, manifest)
 * to ensure structural integrity before artifact upload.
 *
 * Usage:
 *   node scripts/validate-tutorial-preview-visual-qa.mjs
 *   node scripts/validate-tutorial-preview-visual-qa.mjs --dir out/tutorial-preview/visual-qa
 *   node scripts/validate-tutorial-preview-visual-qa.mjs --dir out/tutorial-preview/visual-qa --expected-frames 8
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more contract violations found
 */

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

const dir = getArg('dir') || resolve('out/tutorial-preview/visual-qa');
const expectedFrames = parseInt(getArg('expected-frames') || '8', 10);
const expectedCols = parseInt(getArg('expected-columns') || '4', 10);
const expectedRows = parseInt(getArg('expected-rows') || '2', 10);

// ---------------------------------------------------------------------------
// Validation framework
// ---------------------------------------------------------------------------
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function requireFile(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`Missing required file: ${label}`);
    return false;
  }
  const stat = statSync(filePath);
  if (stat.size === 0) {
    fail(`File is empty (0 bytes): ${label}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Required files check
// ---------------------------------------------------------------------------
console.log(`[visual-qa-validate] Directory: ${dir}`);
console.log(`[visual-qa-validate] Expected: ${expectedFrames} frames, ${expectedCols}x${expectedRows} grid`);
console.log('[visual-qa-validate] Checking required files...');

// Contact sheet
requireFile(join(dir, 'contact-sheet.jpg'), 'contact-sheet.jpg');

// Manifest
const manifestPath = join(dir, 'visual-qa-manifest.json');
const manifestExists = requireFile(manifestPath, 'visual-qa-manifest.json');

// Frame files
for (let i = 1; i <= expectedFrames; i++) {
  const frameName = `frame-${String(i).padStart(2, '0')}.jpg`;
  requireFile(join(dir, 'frames', frameName), `frames/${frameName}`);
}

// ---------------------------------------------------------------------------
// Manifest contract validation
// ---------------------------------------------------------------------------
console.log('[visual-qa-validate] Checking visual-qa-manifest.json contract...');

let manifest = null;
if (manifestExists) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`Invalid JSON in visual-qa-manifest.json: ${err.message}`);
  }
}

if (manifest) {
  // Frame count
  if (manifest.frameCount !== expectedFrames) {
    fail(`Manifest frameCount is ${manifest.frameCount}, expected ${expectedFrames}`);
  }

  // Timestamps array
  const timestamps = manifest.timestamps;
  if (!Array.isArray(timestamps)) {
    fail('Manifest missing "timestamps" array');
  } else {
    if (timestamps.length !== expectedFrames) {
      fail(`Manifest timestamps has ${timestamps.length} entries, expected ${expectedFrames}`);
    }

    // All numeric
    const nonNumeric = timestamps.filter((t) => typeof t !== 'number' || isNaN(t));
    if (nonNumeric.length > 0) {
      fail(`Manifest timestamps contains ${nonNumeric.length} non-numeric value(s)`);
    }

    // Strictly increasing
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] <= timestamps[i - 1]) {
        fail(`Manifest timestamps not strictly increasing: index ${i} (${timestamps[i]}) <= index ${i - 1} (${timestamps[i - 1]})`);
        break;
      }
    }

    // All > 0
    if (timestamps.length > 0 && timestamps[0] <= 0) {
      fail(`Manifest first timestamp is ${timestamps[0]}, expected > 0`);
    }

    // All < video duration (if available)
    const videoDuration = manifest.videoDuration;
    if (typeof videoDuration === 'number' && videoDuration > 0) {
      const lastTs = timestamps[timestamps.length - 1];
      if (lastTs >= videoDuration) {
        fail(`Manifest last timestamp (${lastTs}) >= videoDuration (${videoDuration})`);
      }
    }
  }

  // Video duration range
  const videoDuration = manifest.videoDuration;
  if (typeof videoDuration !== 'number' || videoDuration < 80 || videoDuration > 90) {
    fail(`Manifest videoDuration is ${videoDuration}, expected between 80-90 seconds`);
  }

  // Grid metadata
  const grid = manifest.grid;
  if (!grid) {
    fail('Manifest missing "grid" object');
  } else {
    if (grid.cols !== expectedCols) {
      fail(`Manifest grid.cols is ${grid.cols}, expected ${expectedCols}`);
    }
    if (grid.rows !== expectedRows) {
      fail(`Manifest grid.rows is ${grid.rows}, expected ${expectedRows}`);
    }
  }

  // Contact sheet reference
  if (!manifest.contactSheet) {
    fail('Manifest missing "contactSheet" path');
  }

  // FFmpeg version metadata
  if (!manifest.ffmpegVersion) {
    fail('Manifest missing "ffmpegVersion"');
  }

  // Frames array
  const frames = manifest.frames;
  if (!Array.isArray(frames)) {
    fail('Manifest missing "frames" array');
  } else {
    if (frames.length !== expectedFrames) {
      fail(`Manifest frames array has ${frames.length} entries, expected ${expectedFrames}`);
    }
    // Verify each frame has name and timestamp
    const incomplete = frames.filter((f) => !f.name || typeof f.timestamp !== 'number');
    if (incomplete.length > 0) {
      fail(`Manifest frames: ${incomplete.length} entry(ies) missing "name" or "timestamp"`);
    }
    // Verify listed frames exist on disk
    for (const frame of frames) {
      if (frame.name) {
        const framePath = join(dir, 'frames', frame.name);
        if (!existsSync(framePath)) {
          fail(`Frame listed in manifest not found on disk: frames/${frame.name}`);
        }
      }
    }
  }

  // Verify contact sheet listed in manifest exists
  if (manifest.contactSheet) {
    const csPath = join(dir, manifest.contactSheet);
    if (!existsSync(csPath)) {
      fail(`Contact sheet listed in manifest not found: ${manifest.contactSheet}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('');
if (errors.length === 0) {
  console.log(`[visual-qa-validate] ALL CHECKS PASSED (${expectedFrames} frames, contact sheet, manifest contract)`);
  process.exit(0);
} else {
  console.error(`[visual-qa-validate] FAILED: ${errors.length} contract violation(s):`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
