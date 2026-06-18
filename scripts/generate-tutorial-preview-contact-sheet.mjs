#!/usr/bin/env node

/**
 * generate-tutorial-preview-contact-sheet.mjs — Visual QA contact sheet generator.
 *
 * Extracts evenly spaced keyframes from a tutorial preview MP4 and assembles
 * them into a single contact sheet image for human visual review.
 *
 * Usage:
 *   node scripts/generate-tutorial-preview-contact-sheet.mjs --video out/tutorial-preview/preview.mp4
 *   node scripts/generate-tutorial-preview-contact-sheet.mjs --video preview.mp4 --out-dir out/visual-qa --frames 8
 *   node scripts/generate-tutorial-preview-contact-sheet.mjs --dry-run --video preview.mp4
 *
 * Requires: ffmpeg, ffprobe (available in PATH)
 *
 * Exit codes:
 *   0 = contact sheet generated successfully
 *   1 = error (missing args, FFmpeg unavailable, extraction failure)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(`--${name}`);

const videoPath = getArg('video');
const outDir = getArg('out-dir') || resolve('out/tutorial-preview/visual-qa');
const contactSheetPath = getArg('contact-sheet') || join(outDir, 'contact-sheet.jpg');
const frameCount = parseInt(getArg('frames') || '8', 10);
const dryRun = hasFlag('dry-run');

if (!videoPath) {
  console.error('Usage: node scripts/generate-tutorial-preview-contact-sheet.mjs --video <path> [--out-dir <dir>] [--frames <n>] [--dry-run]');
  process.exit(1);
}

if (!existsSync(videoPath)) {
  console.error(`Video file not found: ${videoPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// FFmpeg availability check
// ---------------------------------------------------------------------------
function checkCommand(cmd) {
  try {
    execFileSync(cmd, ['-version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (!dryRun) {
  if (!checkCommand('ffmpeg')) {
    console.error('FFmpeg is not available. Install ffmpeg or use --dry-run.');
    process.exit(1);
  }
  if (!checkCommand('ffprobe')) {
    console.error('ffprobe is not available. Install ffprobe or use --dry-run.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Get video duration via ffprobe
// ---------------------------------------------------------------------------
function getVideoDuration(video) {
  const result = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    video,
  ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return parseFloat(result.trim());
}

// ---------------------------------------------------------------------------
// Calculate evenly spaced timestamps
// ---------------------------------------------------------------------------
export function calculateTimestamps(durationSec, count) {
  if (count < 1) return [];
  // Avoid frame 0 (often blank/black); start at ~5% and end at ~95%
  const startOffset = durationSec * 0.05;
  const endOffset = durationSec * 0.95;
  const range = endOffset - startOffset;

  if (count === 1) return [startOffset + range / 2];

  const step = range / (count - 1);
  const timestamps = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(Math.round((startOffset + step * i) * 100) / 100);
  }
  return timestamps;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('[contact-sheet] Tutorial Preview Visual QA');
console.log(`  video: ${videoPath}`);
console.log(`  out-dir: ${outDir}`);
console.log(`  frames: ${frameCount}`);

let duration;
if (dryRun) {
  // Assume 85s for dry-run planning
  duration = 85.0;
  console.log(`  duration: ${duration}s (assumed for dry-run)`);
} else {
  duration = getVideoDuration(videoPath);
  console.log(`  duration: ${duration}s`);
}

const timestamps = calculateTimestamps(duration, frameCount);
console.log(`  timestamps: ${timestamps.map((t) => t.toFixed(2) + 's').join(', ')}`);

if (dryRun) {
  console.log('\n[DRY RUN] Would generate:');
  console.log(`  Frames dir: ${join(outDir, 'frames/')}`);
  timestamps.forEach((t, i) => {
    console.log(`    frame-${String(i + 1).padStart(2, '0')}.jpg @ ${t.toFixed(2)}s`);
  });
  console.log(`  Contact sheet: ${contactSheetPath}`);
  console.log('[DRY RUN] Exiting without generating.');
  process.exit(0);
}

// Create output directories
const framesDir = join(outDir, 'frames');
mkdirSync(framesDir, { recursive: true });

// ---------------------------------------------------------------------------
// Extract individual frames
// ---------------------------------------------------------------------------
console.log('\n[contact-sheet] Extracting keyframes...');
const frameFiles = [];

for (let i = 0; i < timestamps.length; i++) {
  const ts = timestamps[i];
  const frameName = `frame-${String(i + 1).padStart(2, '0')}.jpg`;
  const framePath = join(framesDir, frameName);

  execFileSync('ffmpeg', [
    '-y',
    '-ss', String(ts),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '2',
    framePath,
  ], { stdio: 'pipe' });

  frameFiles.push({ name: frameName, path: framePath, timestamp: ts });
  console.log(`  ${frameName} @ ${ts.toFixed(2)}s`);
}

// ---------------------------------------------------------------------------
// Generate contact sheet using FFmpeg tile filter
// ---------------------------------------------------------------------------
console.log('\n[contact-sheet] Assembling contact sheet...');

// Calculate grid: prefer 4 columns
const cols = Math.min(4, frameCount);
const rows = Math.ceil(frameCount / cols);

// Build FFmpeg input args and filter for tile
const inputArgs = [];
frameFiles.forEach((f) => {
  inputArgs.push('-i', f.path);
});

// Scale frames to uniform width for the tile, then tile them
const tileFilter = frameFiles.length > 1
  ? `${frameFiles.map((_, i) => `[${i}:v]scale=480:-1[s${i}]`).join(';')};${frameFiles.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${frameFiles.length}:layout=${generateLayout(cols, rows, 480, frameFiles.length)}[out]`
  : '[0:v]scale=480:-1[out]';

// Use simpler tile filter approach
const simpleTileFilter = `${frameFiles.map((_, i) => `[${i}:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[s${i}]`).join(';')};${frameFiles.map((_, i) => `[s${i}]`).join('')}concat=n=${frameFiles.length}:v=1[strip];[strip]tile=${cols}x${rows}[out]`;

execFileSync('ffmpeg', [
  '-y',
  ...inputArgs,
  '-filter_complex', simpleTileFilter,
  '-map', '[out]',
  '-q:v', '3',
  contactSheetPath,
], { stdio: 'pipe' });

console.log(`  Contact sheet: ${contactSheetPath}`);

// ---------------------------------------------------------------------------
// Write visual-qa-manifest.json
// ---------------------------------------------------------------------------
const manifest = {
  generatedAt: new Date().toISOString(),
  sourceVideo: videoPath,
  videoDuration: duration,
  frameCount,
  timestamps,
  frames: frameFiles.map((f) => ({ name: f.name, timestamp: f.timestamp })),
  contactSheet: basename(contactSheetPath),
  grid: { cols, rows },
  ffmpegVersion: getFfmpegVersion(),
};

const manifestPath = join(outDir, 'visual-qa-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`  Manifest: ${manifestPath}`);

console.log('\n[contact-sheet] Visual QA generation complete.');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getFfmpegVersion() {
  try {
    const output = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const firstLine = output.split('\n')[0];
    return firstLine.replace('ffmpeg version ', '').trim();
  } catch {
    return 'unknown';
  }
}

function generateLayout(cols, rows, cellWidth, total) {
  // Not used with tile filter approach, kept for potential future xstack usage
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (positions.length >= total) break;
      positions.push(`${c * cellWidth}_${r * 270}`);
    }
  }
  return positions.join('|');
}
