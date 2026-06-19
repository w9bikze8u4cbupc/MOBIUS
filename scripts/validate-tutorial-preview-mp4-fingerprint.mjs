#!/usr/bin/env node

/**
 * validate-tutorial-preview-mp4-fingerprint.mjs — Golden MP4 bitstream fingerprint validator.
 *
 * Compares the SHA-256 hash and byte size of generated preview.mp4 against a
 * committed fingerprint baseline. Optionally cross-checks media metadata from
 * ffprobe.json against baseline expectations.
 *
 * Usage:
 *   node scripts/validate-tutorial-preview-mp4-fingerprint.mjs
 *   node scripts/validate-tutorial-preview-mp4-fingerprint.mjs --dir out/tutorial-preview --baseline tests/golden/tutorial-preview/gem-collectors-mp4-fingerprint.json
 *
 * Exit codes:
 *   0 = MP4 fingerprint matches baseline
 *   1 = fingerprint drift or validation failure
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
const baselinePath = getArg('baseline') || resolve('tests/golden/tutorial-preview/gem-collectors-mp4-fingerprint.json');

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

if (!baseline.file || !baseline.sha256 || !baseline.size) {
  console.error('Baseline missing required fields: file, sha256, size');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const errors = [];

function fail(msg) {
  errors.push(msg);
}

const mp4Path = join(dir, baseline.file);

console.log('[mp4-fingerprint] Golden MP4 Bitstream Fingerprint Validation');
console.log(`  dir: ${dir}`);
console.log(`  baseline: ${baselinePath}`);
console.log(`  file: ${baseline.file}`);
console.log(`  expected SHA-256: ${baseline.sha256}`);
console.log(`  expected size: ${baseline.size} bytes`);
console.log('');

// File existence
if (!existsSync(mp4Path)) {
  fail(`Missing file: ${baseline.file}`);
} else {
  const stat = statSync(mp4Path);

  // Non-zero check
  if (stat.size === 0) {
    fail(`File is empty (0 bytes): ${baseline.file}`);
  } else {
    // SHA-256 comparison
    const buf = readFileSync(mp4Path);
    const actualHash = createHash('sha256').update(buf).digest('hex');

    if (actualHash !== baseline.sha256) {
      fail(`SHA-256 drift: expected=${baseline.sha256}, actual=${actualHash}`);
    } else {
      console.log(`  SHA-256: MATCH (${actualHash.slice(0, 16)}...)`);
    }

    // Byte size comparison
    if (stat.size !== baseline.size) {
      fail(`Size drift: expected=${baseline.size}, actual=${stat.size}`);
    } else {
      console.log(`  Size: MATCH (${stat.size} bytes)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Optional media metadata cross-check via ffprobe.json
// ---------------------------------------------------------------------------
if (baseline.expectedMedia) {
  const ffprobePath = join(dir, 'ffprobe.json');
  if (existsSync(ffprobePath)) {
    console.log('');
    console.log('[mp4-fingerprint] Cross-checking media metadata from ffprobe.json...');
    try {
      const ffprobe = JSON.parse(readFileSync(ffprobePath, 'utf8'));
      const streams = ffprobe.streams || [];
      const videoStream = streams.find((s) => s.codec_type === 'video');
      const audioStream = streams.find((s) => s.codec_type === 'audio');
      const em = baseline.expectedMedia;

      if (videoStream) {
        if (em.videoCodec && videoStream.codec_name !== em.videoCodec) {
          fail(`Media: video codec "${videoStream.codec_name}" != expected "${em.videoCodec}"`);
        }
        if (em.width && videoStream.width !== em.width) {
          fail(`Media: width ${videoStream.width} != expected ${em.width}`);
        }
        if (em.height && videoStream.height !== em.height) {
          fail(`Media: height ${videoStream.height} != expected ${em.height}`);
        }
        if (em.fps) {
          const fpsStr = videoStream.r_frame_rate || videoStream.avg_frame_rate || '';
          const parts = fpsStr.split('/');
          const fpsVal = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(fpsStr);
          if (Math.abs(fpsVal - em.fps) > 1) {
            fail(`Media: fps ${fpsVal} != expected ${em.fps}`);
          }
        }
      } else {
        fail('Media: no video stream in ffprobe.json');
      }

      if (audioStream) {
        if (em.audioCodec && audioStream.codec_name !== em.audioCodec) {
          fail(`Media: audio codec "${audioStream.codec_name}" != expected "${em.audioCodec}"`);
        }
      } else {
        fail('Media: no audio stream in ffprobe.json');
      }

      if (em.streamCount && streams.length !== em.streamCount) {
        fail(`Media: stream count ${streams.length} != expected ${em.streamCount}`);
      }

      const duration = parseFloat(ffprobe.format?.duration || '0');
      if (em.durationRange && (duration < em.durationRange.min || duration > em.durationRange.max)) {
        fail(`Media: duration ${duration}s outside expected ${em.durationRange.min}-${em.durationRange.max}s`);
      }

      if (errors.length === 0) {
        console.log('  Media metadata: ALL MATCH');
      }
    } catch (err) {
      console.log(`  Warning: could not parse ffprobe.json for cross-check: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('');
if (errors.length === 0) {
  console.log('[mp4-fingerprint] MP4 FINGERPRINT MATCHES BASELINE');
  process.exit(0);
} else {
  console.error(`[mp4-fingerprint] FAILED: ${errors.length} drift(s) detected:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
