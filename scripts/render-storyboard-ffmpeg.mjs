#!/usr/bin/env node

/**
 * render-storyboard-ffmpeg.mjs — Real scene-by-scene storyboard renderer.
 *
 * Consumes a render config JSON and produces a multi-scene MP4 video using FFmpeg.
 *
 * Usage:
 *   node scripts/render-storyboard-ffmpeg.mjs --config render-config.json --out out/tutorial.mp4
 *   node scripts/render-storyboard-ffmpeg.mjs --config render-config.json --dry-run
 *
 * Render Config Contract (JSON):
 * {
 *   "projectId": "hanamikoji",
 *   "video": { "resolution": { "width": 1920, "height": 1080 }, "fps": 30 },
 *   "scenes": [
 *     {
 *       "id": "scene-intro",
 *       "durationSec": 5,
 *       "background": { "color": "#1a1a2e" } | { "image": "path/to/bg.png" },
 *       "overlays": [
 *         { "type": "title", "text": "How to Play: Hanamikoji", "position": "center" },
 *         { "type": "body", "text": "A game for 2 players", "position": "bottom" }
 *       ],
 *       "audio": { "file": "path/to/narration.mp3" }  // optional
 *     }
 *   ]
 * }
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';

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

const configPath = getArg('config');
const outputPath = getArg('out');
const dryRun = hasFlag('dry-run');
const verbose = hasFlag('verbose');

if (!configPath) {
  console.error('Usage: node scripts/render-storyboard-ffmpeg.mjs --config <path> [--out <path>] [--dry-run] [--verbose]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load and validate config
// ---------------------------------------------------------------------------
if (!existsSync(configPath)) {
  console.error(`Config file not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));

function validateConfig(cfg) {
  const errors = [];
  if (!cfg.projectId) errors.push('Missing projectId');
  if (!cfg.video?.resolution?.width || !cfg.video?.resolution?.height) {
    errors.push('Missing video.resolution (width/height)');
  }
  if (!cfg.video?.fps) errors.push('Missing video.fps');
  if (!Array.isArray(cfg.scenes) || cfg.scenes.length === 0) {
    errors.push('scenes must be a non-empty array');
  }
  if (cfg.scenes) {
    cfg.scenes.forEach((scene, i) => {
      if (!scene.id) errors.push(`Scene ${i}: missing id`);
      if (!scene.durationSec || scene.durationSec <= 0) {
        errors.push(`Scene ${i} (${scene.id || '?'}): durationSec must be > 0`);
      }
      if (!scene.background) {
        errors.push(`Scene ${i} (${scene.id || '?'}): missing background (color or image)`);
      }
    });
  }
  return errors;
}

const validationErrors = validateConfig(config);
if (validationErrors.length > 0) {
  console.error('Render config validation failed:');
  validationErrors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

const { width, height } = config.video.resolution;
const fps = config.video.fps;
const finalOutput = outputPath || resolve('out', `${config.projectId}-tutorial.mp4`);

console.log(`[render-storyboard] Project: ${config.projectId}`);
console.log(`[render-storyboard] Resolution: ${width}x${height} @ ${fps}fps`);
console.log(`[render-storyboard] Scenes: ${config.scenes.length}`);
console.log(`[render-storyboard] Output: ${finalOutput}`);

// ---------------------------------------------------------------------------
// FFmpeg availability check
// ---------------------------------------------------------------------------
function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = checkFfmpeg();

if (!ffmpegAvailable && !dryRun) {
  console.error('FFmpeg is not available. Install ffmpeg or use --dry-run to validate config only.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Dry-run mode: print planned render stages and exit
// ---------------------------------------------------------------------------
if (dryRun) {
  console.log('\n[DRY RUN] Planned render stages:');
  config.scenes.forEach((scene, i) => {
    const bgDesc = scene.background?.image
      ? `image: ${scene.background.image}`
      : `color: ${scene.background?.color || '#000000'}`;
    const overlayCount = scene.overlays?.length || 0;
    const audioDesc = scene.audio?.file ? `audio: ${scene.audio.file}` : 'no audio';
    console.log(`  Scene ${i + 1}/${config.scenes.length} [${scene.id}]`);
    console.log(`    duration: ${scene.durationSec}s | bg: ${bgDesc}`);
    console.log(`    overlays: ${overlayCount} | ${audioDesc}`);
  });
  console.log(`\n[DRY RUN] Would produce: ${finalOutput}`);
  console.log('[DRY RUN] Config is valid. Exiting without rendering.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Render each scene as a segment, then concatenate
// ---------------------------------------------------------------------------
const tmpDir = resolve('out', '.render-tmp', config.projectId);
mkdirSync(tmpDir, { recursive: true });

function escapeDrawtext(text) {
  // Escape special characters for FFmpeg drawtext
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

function wrapTextToSafeWidth(text, maxCharsPerLine) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharsPerLine) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines.join('\n');
}

function buildSceneCommand(scene, index) {
  const segmentPath = join(tmpDir, `scene-${String(index).padStart(3, '0')}.mp4`);

  // Base input: either background image or color
  const inputArgs = [];
  let filterBase;

  if (scene.background?.image && existsSync(scene.background.image)) {
    inputArgs.push('-loop', '1', '-i', scene.background.image);
    filterBase = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  } else {
    const color = scene.background?.color || '#1a1a2e';
    inputArgs.push('-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}:d=${scene.durationSec}:r=${fps}`);
    filterBase = '[0:v]copy';
  }

  // Build filter chain with text overlays
  let filterChain = filterBase;
  const overlays = scene.overlays || [];

  overlays.forEach((overlay) => {
    const rawText = overlay.text || '';
    if (!rawText) return;

    // Cookbook-style font sizing by overlay type
    let fontSize;
    switch (overlay.type) {
      case 'title':   fontSize = Math.round(height / 12); break;  // Large titles
      case 'heading': fontSize = Math.round(height / 18); break;  // Section headings
      case 'badge':   fontSize = Math.round(height / 30); break;  // Small step badges
      case 'body':    fontSize = Math.round(height / 25); break;  // Body text
      default:        fontSize = Math.round(height / 25); break;
    }

    const marginX = Math.round(width * 0.08);
    const safeWidth = width - (marginX * 2);
    const maxCharsPerLine = Math.max(20, Math.floor(safeWidth / (fontSize * 0.6)));
    const wrappedText = overlay.type === 'body'
      ? wrapTextToSafeWidth(rawText, maxCharsPerLine)
      : rawText;
    const text = escapeDrawtext(wrappedText);

    const fontColor = overlay.fontColor || 'white';
    const borderW = overlay.type === 'badge' ? 1 : Math.round(fontSize / 12);
    const borderColor = overlay.type === 'badge' ? 'black' : 'black';

    // Cookbook-style positioning with safe margins
    const marginY = Math.round(height * 0.08);
    let x = '(w-text_w)/2';
    let y = '(h-text_h)/2';

    switch (overlay.position) {
      case 'top':
        x = `${marginX}`;
        y = `${marginY}`;
        break;
      case 'upper':
        x = '(w-text_w)/2';
        y = `${Math.round(height * 0.22)}`;
        break;
      case 'center':
        x = '(w-text_w)/2';
        y = '(h-text_h)/2';
        break;
      case 'bottom':
        x = '(w-text_w)/2';
        y = `(h-text_h-${marginY})`;
        break;
    }

    filterChain += `,drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=${borderW}:bordercolor=${borderColor}:x=${x}:y=${y}`;
  });

  // Duration trim for image-based inputs
  if (scene.background?.image) {
    filterChain += `,trim=duration=${scene.durationSec},setpts=PTS-STARTPTS`;
  }

  filterChain += `[vout]`;

  // Audio input
  const audioArgs = [];
  if (scene.audio?.file && existsSync(scene.audio.file)) {
    audioArgs.push('-i', scene.audio.file);
    filterChain += `;[1:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS[aout]`;
  } else {
    // Generate silent audio
    audioArgs.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`);
    filterChain += `;[1:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS[aout]`;
  }

  const ffmpegArgs = [
    '-hide_banner', '-loglevel', verbose ? 'info' : 'error', '-y',
    ...inputArgs,
    ...audioArgs,
    '-filter_complex', filterChain,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(scene.durationSec),
    segmentPath,
  ];

  return { segmentPath, ffmpegArgs };
}

// Render each scene
const segmentPaths = [];

for (let i = 0; i < config.scenes.length; i++) {
  const scene = config.scenes[i];
  console.log(`[render-storyboard] Rendering scene ${i + 1}/${config.scenes.length}: ${scene.id} (${scene.durationSec}s)`);

  const { segmentPath, ffmpegArgs } = buildSceneCommand(scene, i);

  try {
    execFileSync('ffmpeg', ffmpegArgs, { stdio: verbose ? 'inherit' : 'pipe' });
    segmentPaths.push(segmentPath);
  } catch (err) {
    console.error(`[render-storyboard] FAILED rendering scene ${scene.id}`);
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Concatenate all segments
// ---------------------------------------------------------------------------
console.log(`[render-storyboard] Concatenating ${segmentPaths.length} segments...`);

const concatListPath = join(tmpDir, 'concat.txt');
const concatContent = segmentPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');
writeFileSync(concatListPath, concatContent, 'utf8');

mkdirSync(dirname(finalOutput), { recursive: true });

try {
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', verbose ? 'info' : 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-c', 'copy',
    finalOutput,
  ], { stdio: verbose ? 'inherit' : 'pipe' });
} catch (err) {
  console.error('[render-storyboard] FAILED concatenating segments');
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cleanup temp files
// ---------------------------------------------------------------------------
try {
  segmentPaths.forEach((p) => { try { unlinkSync(p); } catch {} });
  unlinkSync(concatListPath);
} catch {}

console.log(`[render-storyboard] ✓ Complete: ${finalOutput}`);
