#!/usr/bin/env node

/**
 * validate-tutorial-preview-golden-baseline.mjs — Golden metadata baseline validator.
 *
 * Compares generated tutorial preview metadata against a committed baseline JSON,
 * failing if any stable field drifts outside explicit tolerances.
 *
 * Usage:
 *   node scripts/validate-tutorial-preview-golden-baseline.mjs
 *   node scripts/validate-tutorial-preview-golden-baseline.mjs --dir out/tutorial-preview --baseline tests/golden/tutorial-preview/gem-collectors-baseline.json
 *   node scripts/validate-tutorial-preview-golden-baseline.mjs --dir out/tutorial-preview/hanamikoji --slug hanamikoji
 *
 * Exit codes:
 *   0 = generated metadata matches baseline within tolerances
 *   1 = one or more baseline drifts detected
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
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
const baselinePath = getArg('baseline') || resolve('tests/golden/tutorial-preview', `${fixtureSlug}-baseline.json`);

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

// ---------------------------------------------------------------------------
// Validation framework
// ---------------------------------------------------------------------------
const errors = [];

function fail(key, msg) {
  errors.push(`[${key}] ${msg}`);
}

function loadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getFileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------
console.log('[golden-baseline] Tutorial Preview Golden Metadata Validation');
console.log(`  dir: ${dir}`);
console.log(`  baseline: ${baselinePath}`);

// --- Core files existence ---
console.log('[golden-baseline] Checking core file list...');
if (baseline.coreFiles) {
  for (const file of baseline.coreFiles) {
    if (!existsSync(join(dir, file))) {
      fail('coreFiles', `Missing: ${file}`);
    }
  }
}

// --- Visual QA files existence ---
console.log('[golden-baseline] Checking visual QA file list...');
if (baseline.visualQaFiles) {
  for (const file of baseline.visualQaFiles) {
    if (!existsSync(join(dir, file))) {
      fail('visualQaFiles', `Missing: ${file}`);
    }
  }
}

// --- Script segment count ---
console.log('[golden-baseline] Checking script.json...');
const script = loadJson(join(dir, 'script.json'));
if (script && baseline.script) {
  const actual = script.segments?.length || 0;
  const expected = baseline.script.segmentCount;
  if (actual !== expected) {
    fail('script.segmentCount', `actual=${actual}, expected=${expected}`);
  }
}

// --- Storyboard scene count ---
console.log('[golden-baseline] Checking storyboard.json...');
const storyboard = loadJson(join(dir, 'storyboard.json'));
if (storyboard && baseline.storyboard) {
  const actual = storyboard.scenes?.length || 0;
  const expected = baseline.storyboard.sceneCount;
  if (actual !== expected) {
    fail('storyboard.sceneCount', `actual=${actual}, expected=${expected}`);
  }
}

// --- Caption cue count ---
console.log('[golden-baseline] Checking captions.srt...');
const captionsPath = join(dir, 'captions.srt');
if (existsSync(captionsPath) && baseline.captions) {
  const srt = readFileSync(captionsPath, 'utf8');
  const cuePattern = /^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/gm;
  const actual = (srt.match(cuePattern) || []).length;
  const expected = baseline.captions.cueCount;
  if (actual !== expected) {
    fail('captions.cueCount', `actual=${actual}, expected=${expected}`);
  }
}

// --- Render config scene count ---
console.log('[golden-baseline] Checking render-config.json...');
const renderConfig = loadJson(join(dir, 'render-config.json'));
if (renderConfig && baseline.renderConfig) {
  const actual = renderConfig.scenes?.length || 0;
  const expected = baseline.renderConfig.sceneCount;
  if (actual !== expected) {
    fail('renderConfig.sceneCount', `actual=${actual}, expected=${expected}`);
  }
}

// --- Video metadata from ffprobe.json ---
console.log('[golden-baseline] Checking ffprobe.json video metadata...');
const ffprobe = loadJson(join(dir, 'ffprobe.json'));
if (ffprobe && baseline.video) {
  const bv = baseline.video;
  const streams = ffprobe.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  if (videoStream) {
    if (videoStream.codec_name !== bv.codec) {
      fail('video.codec', `actual="${videoStream.codec_name}", expected="${bv.codec}"`);
    }
    if (videoStream.width !== bv.width) {
      fail('video.width', `actual=${videoStream.width}, expected=${bv.width}`);
    }
    if (videoStream.height !== bv.height) {
      fail('video.height', `actual=${videoStream.height}, expected=${bv.height}`);
    }
    const fpsStr = videoStream.r_frame_rate || videoStream.avg_frame_rate || '';
    const fpsParts = fpsStr.split('/');
    const fpsValue = fpsParts.length === 2 ? Number(fpsParts[0]) / Number(fpsParts[1]) : Number(fpsStr);
    if (Math.abs(fpsValue - bv.fps) > 1) {
      fail('video.fps', `actual=${fpsValue}, expected=${bv.fps}`);
    }
  } else {
    fail('video', 'No video stream found in ffprobe.json');
  }

  if (audioStream) {
    if (audioStream.codec_name !== bv.audioCodec) {
      fail('video.audioCodec', `actual="${audioStream.codec_name}", expected="${bv.audioCodec}"`);
    }
  } else {
    fail('video', 'No audio stream found in ffprobe.json');
  }

  if (bv.streamCount && streams.length !== bv.streamCount) {
    fail('video.streamCount', `actual=${streams.length}, expected=${bv.streamCount}`);
  }

  const duration = parseFloat(ffprobe.format?.duration || '0');
  if (bv.durationRange) {
    if (duration < bv.durationRange.min || duration > bv.durationRange.max) {
      fail('video.duration', `actual=${duration}s, expected ${bv.durationRange.min}-${bv.durationRange.max}s`);
    }
  }
}

// --- Visual QA manifest metadata ---
console.log('[golden-baseline] Checking visual-qa-manifest.json...');
const vqaManifest = loadJson(join(dir, 'visual-qa/visual-qa-manifest.json'));
if (vqaManifest && baseline.visualQa) {
  const bvq = baseline.visualQa;

  if (vqaManifest.frameCount !== bvq.frameCount) {
    fail('visualQa.frameCount', `actual=${vqaManifest.frameCount}, expected=${bvq.frameCount}`);
  }

  if (vqaManifest.grid) {
    if (vqaManifest.grid.cols !== bvq.grid.cols) {
      fail('visualQa.grid.cols', `actual=${vqaManifest.grid.cols}, expected=${bvq.grid.cols}`);
    }
    if (vqaManifest.grid.rows !== bvq.grid.rows) {
      fail('visualQa.grid.rows', `actual=${vqaManifest.grid.rows}, expected=${bvq.grid.rows}`);
    }
  }

  // Timestamp comparison with tolerance
  if (Array.isArray(vqaManifest.timestamps) && Array.isArray(bvq.timestamps)) {
    const tol = bvq.timestampTolerance || 1.0;
    for (let i = 0; i < bvq.timestamps.length; i++) {
      const actual = vqaManifest.timestamps[i];
      const expected = bvq.timestamps[i];
      if (actual === undefined) {
        fail('visualQa.timestamps', `missing timestamp at index ${i}`);
      } else if (Math.abs(actual - expected) > tol) {
        fail('visualQa.timestamps', `index ${i}: actual=${actual}, expected=${expected} (tol=${tol})`);
      }
    }
  }

  // FFmpeg version prefix
  if (bvq.ffmpegVersionPrefix && vqaManifest.ffmpegVersion) {
    if (!vqaManifest.ffmpegVersion.startsWith(bvq.ffmpegVersionPrefix)) {
      fail('visualQa.ffmpegVersion', `actual="${vqaManifest.ffmpegVersion}", expected prefix="${bvq.ffmpegVersionPrefix}"`);
    }
  }
}

// --- File size ranges ---
console.log('[golden-baseline] Checking file size ranges...');
if (baseline.fileSizeRanges) {
  for (const [pattern, range] of Object.entries(baseline.fileSizeRanges)) {
    if (pattern.includes('*')) {
      // Glob pattern for frames: check all matching files
      const baseDir = join(dir, pattern.replace('/*', ''));
      if (existsSync(baseDir)) {
        const files = readdirSync(baseDir).filter((f) => f.endsWith('.jpg'));
        for (const file of files) {
          const size = getFileSize(join(baseDir, file));
          if (size < range.min || size > range.max) {
            fail('fileSizeRanges', `${pattern.replace('*', file)}: size=${size}, expected ${range.min}-${range.max}`);
          }
        }
      }
    } else {
      const size = getFileSize(join(dir, pattern));
      if (size >= 0 && (size < range.min || size > range.max)) {
        fail('fileSizeRanges', `${pattern}: size=${size}, expected ${range.min}-${range.max}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('');
if (errors.length === 0) {
  console.log('[golden-baseline] ALL CHECKS PASSED — generated metadata matches baseline within tolerances');
  process.exit(0);
} else {
  console.error(`[golden-baseline] FAILED: ${errors.length} baseline drift(s) detected:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
