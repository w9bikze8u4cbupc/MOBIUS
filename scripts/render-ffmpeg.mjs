#!/usr/bin/env node

/**
 * render-ffmpeg.mjs — Minimal render entrypoint for MOBIUS preview pipeline.
 *
 * Usage:
 *   node scripts/render-ffmpeg.mjs                                     # bare render → out/preview_with_audio.mp4
 *   node scripts/render-ffmpeg.mjs timeline.json assets out/p.mp4 --preview  # proxy render with explicit paths
 *
 * Produces a short deterministic preview video with an audio track using ffmpeg.
 * CI's "Fallback preview (synthetic)" step handles the case where ffmpeg is
 * unavailable, so this script exits cleanly (code 0) even when ffmpeg is missing
 * — it just logs a warning and lets the fallback take over.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const isPreview = args.includes('--preview');
const positional = args.filter((a) => !a.startsWith('--'));

const timelinePath = positional[0] || null;
const assetsDir    = positional[1] || null;
const outputPath   = positional[2] || resolve('out', 'preview_with_audio.mp4');

// ---------------------------------------------------------------------------
// Resolve render parameters from timeline (if provided) or use defaults
// ---------------------------------------------------------------------------
let durationSec = 6;
let width = 1280;
let height = 720;
let fps = 30;

if (timelinePath && existsSync(timelinePath)) {
  try {
    const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
    if (timeline.timing?.totalDurationSec) {
      durationSec = Number(timeline.timing.totalDurationSec) || durationSec;
    }
    if (timeline.video?.resolution) {
      width  = timeline.video.resolution.width  || width;
      height = timeline.video.resolution.height || height;
    }
    if (timeline.video?.fps) {
      fps = timeline.video.fps;
    }
  } catch {
    // Non-fatal — fall back to defaults.
  }
}

// Cap duration for preview mode to keep CI fast.
if (isPreview && durationSec > 10) {
  durationSec = 10;
}

// ---------------------------------------------------------------------------
// Ensure output directory exists
// ---------------------------------------------------------------------------
const outDir = dirname(outputPath);
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Render via ffmpeg
// ---------------------------------------------------------------------------
const ffmpegArgs = [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${durationSec}`,
  '-f', 'lavfi', '-i', `sine=f=1000:d=${durationSec}`,
  '-shortest',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
  '-c:a', 'aac', '-b:a', '128k',
  outputPath,
];

try {
  execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  console.log(`Render complete → ${outputPath}`);
} catch (err) {
  // ffmpeg may not be installed locally — that's OK.
  // CI has a dedicated "Fallback preview (synthetic)" step that covers this.
  if (err?.status != null) {
    console.error(`ffmpeg exited with code ${err.status}`);
    process.exit(err.status);
  }
  console.warn('ffmpeg not available — skipping render. CI fallback will synthesize the preview.');
}
