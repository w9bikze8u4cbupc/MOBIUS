#!/usr/bin/env node

/**
 * validate-tutorial-preview-artifact.mjs — Artifact contract validator.
 *
 * Validates the tutorial preview output directory before upload to ensure
 * all required files exist, are non-empty, and satisfy media/content contracts.
 *
 * Usage:
 *   node scripts/validate-tutorial-preview-artifact.mjs
 *   node scripts/validate-tutorial-preview-artifact.mjs --dir out/tutorial-preview
 *   node scripts/validate-tutorial-preview-artifact.mjs --dir out/tutorial-preview/hanamikoji --slug hanamikoji
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

const dir = getArg('dir') || resolve('out/tutorial-preview');
const expectedSlug = getArg('slug');

// ---------------------------------------------------------------------------
// Validation framework
// ---------------------------------------------------------------------------
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function requireFile(name) {
  const filePath = join(dir, name);
  if (!existsSync(filePath)) {
    fail(`Missing required file: ${name}`);
    return null;
  }
  const stat = statSync(filePath);
  if (stat.size === 0) {
    fail(`File is empty (0 bytes): ${name}`);
    return null;
  }
  return filePath;
}

function loadJson(name) {
  const filePath = requireFile(name);
  if (!filePath) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`Invalid JSON in ${name}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Required files check
// ---------------------------------------------------------------------------
console.log(`[validate] Artifact directory: ${dir}`);
console.log('[validate] Checking required files...');

const REQUIRED_FILES = [
  'preview.mp4',
  'script.json',
  'storyboard.json',
  'captions.srt',
  'render-config.json',
  'manifest.json',
  'ffprobe.json',
];

for (const file of REQUIRED_FILES) {
  requireFile(file);
}

// ---------------------------------------------------------------------------
// ffprobe.json media contract
// ---------------------------------------------------------------------------
console.log('[validate] Checking ffprobe.json media contract...');

const ffprobe = loadJson('ffprobe.json');
if (ffprobe) {
  const streams = ffprobe.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    fail('ffprobe.json: no video stream found');
  } else {
    if (videoStream.codec_name !== 'h264') {
      fail(`ffprobe.json: video codec is "${videoStream.codec_name}", expected "h264"`);
    }
    if (videoStream.width !== 1920) {
      fail(`ffprobe.json: video width is ${videoStream.width}, expected 1920`);
    }
    if (videoStream.height !== 1080) {
      fail(`ffprobe.json: video height is ${videoStream.height}, expected 1080`);
    }
    // Frame rate: r_frame_rate is a fraction like "30/1"
    const fpsStr = videoStream.r_frame_rate || videoStream.avg_frame_rate || '';
    const fpsParts = fpsStr.split('/');
    const fpsValue = fpsParts.length === 2 ? Number(fpsParts[0]) / Number(fpsParts[1]) : Number(fpsStr);
    if (isNaN(fpsValue) || fpsValue < 28 || fpsValue > 32) {
      fail(`ffprobe.json: frame rate is ${fpsStr} (~${fpsValue}fps), expected ~30fps`);
    }
  }

  if (!audioStream) {
    fail('ffprobe.json: no audio stream found');
  } else {
    if (audioStream.codec_name !== 'aac') {
      fail(`ffprobe.json: audio codec is "${audioStream.codec_name}", expected "aac"`);
    }
  }

  // Duration from format
  const duration = parseFloat(ffprobe.format?.duration || '0');
  if (duration < 80 || duration > 90) {
    fail(`ffprobe.json: duration is ${duration}s, expected between 80-90s`);
  }

  // Stream count
  if (streams.length < 2) {
    fail(`ffprobe.json: expected at least 2 streams (video+audio), found ${streams.length}`);
  }
}

// ---------------------------------------------------------------------------
// script.json contract
// ---------------------------------------------------------------------------
console.log('[validate] Checking script.json contract...');

const script = loadJson('script.json');
if (script) {
  const segments = script.segments;
  if (!Array.isArray(segments)) {
    fail('script.json: missing "segments" array');
  } else {
    if (segments.length < 10) {
      fail(`script.json: segment count is ${segments.length}, expected at least 10`);
    }
    // Check that segments have required fields
    const missingFields = segments.filter((s, i) => !s.id || !s.narration || !s.durationSec);
    if (missingFields.length > 0) {
      fail(`script.json: ${missingFields.length} segment(s) missing id, narration, or durationSec`);
    }
  }
}

// ---------------------------------------------------------------------------
// storyboard.json contract
// ---------------------------------------------------------------------------
console.log('[validate] Checking storyboard.json contract...');

const storyboard = loadJson('storyboard.json');
if (storyboard) {
  const scenes = storyboard.scenes;
  if (!Array.isArray(scenes)) {
    fail('storyboard.json: missing "scenes" array');
  } else {
    if (scenes.length < 10) {
      fail(`storyboard.json: scene count is ${scenes.length}, expected at least 10`);
    }
    // Total duration check
    const totalDuration = scenes.reduce((sum, s) => sum + (s.durationSec || 0), 0);
    if (totalDuration <= 0) {
      fail('storyboard.json: total scene duration is 0 or negative');
    }
    // Rough match to video duration (within 10s tolerance)
    const ffprobeDuration = parseFloat(ffprobe?.format?.duration || '0');
    if (ffprobeDuration > 0 && Math.abs(totalDuration - ffprobeDuration) > 10) {
      fail(`storyboard.json: total scene duration (${totalDuration}s) differs from video duration (${ffprobeDuration}s) by more than 10s`);
    }
  }
}

// ---------------------------------------------------------------------------
// captions.srt contract
// ---------------------------------------------------------------------------
console.log('[validate] Checking captions.srt contract...');

const captionsPath = join(dir, 'captions.srt');
if (existsSync(captionsPath) && statSync(captionsPath).size > 0) {
  const srtContent = readFileSync(captionsPath, 'utf8');

  // Count SRT cues: each cue starts with a number on its own line followed by a timestamp line
  const cuePattern = /^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/gm;
  const cues = srtContent.match(cuePattern) || [];

  if (cues.length < 20) {
    fail(`captions.srt: found ${cues.length} cues, expected at least 20`);
  }

  // Verify sequential numbering starts at 1
  const firstCueNum = parseInt(srtContent.trim().split('\n')[0], 10);
  if (firstCueNum !== 1) {
    fail(`captions.srt: first cue number is ${firstCueNum}, expected 1`);
  }
}

// ---------------------------------------------------------------------------
// render-config.json contract
// ---------------------------------------------------------------------------
console.log('[validate] Checking render-config.json contract...');

const renderConfig = loadJson('render-config.json');
if (renderConfig) {
  if (!renderConfig.projectId) {
    fail('render-config.json: missing "projectId"');
  }
  if (!renderConfig.video?.resolution?.width || !renderConfig.video?.resolution?.height) {
    fail('render-config.json: missing video.resolution');
  }
  if (!renderConfig.video?.fps) {
    fail('render-config.json: missing video.fps');
  }
  if (!Array.isArray(renderConfig.scenes) || renderConfig.scenes.length === 0) {
    fail('render-config.json: missing or empty "scenes" array');
  }
}

// ---------------------------------------------------------------------------
// manifest.json contract
// ---------------------------------------------------------------------------
console.log('[validate] Checking manifest.json contract...');

const manifest = loadJson('manifest.json');
if (manifest) {
  if (!manifest.generatedAt) {
    fail('manifest.json: missing "generatedAt"');
  }
  if (!manifest.game?.id || !manifest.game?.name) {
    fail('manifest.json: missing "game.id" or "game.name"');
  }
  if (expectedSlug && manifest.game.id !== expectedSlug) {
    fail(`manifest.json: game.id is "${manifest.game.id}", expected "${expectedSlug}"`);
  }
  if (!manifest.script || !manifest.storyboard || !manifest.captions || !manifest.render) {
    fail('manifest.json: missing pipeline summary fields (script, storyboard, captions, render)');
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('');
if (errors.length === 0) {
  console.log(`[validate] ALL CHECKS PASSED (${REQUIRED_FILES.length} files, media contract, content contracts)`);
  process.exit(0);
} else {
  console.error(`[validate] FAILED: ${errors.length} contract violation(s):`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
