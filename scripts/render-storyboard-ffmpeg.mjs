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

// ---------------------------------------------------------------------------
// Layout helpers — structured lower-third with explicit stacking
// ---------------------------------------------------------------------------

/**
 * Compute safe margins for the frame.
 */
function getSafeMargins(w, h) {
  return {
    x: Math.round(w * 0.08),
    y: Math.round(h * 0.08),
  };
}

/**
 * Count how many lines a wrapped body text will occupy.
 */
function getWrappedLineCount(text, maxCharsPerLine) {
  const wrapped = wrapTextToSafeWidth(text, maxCharsPerLine);
  return wrapped.split('\n').length;
}

/**
 * Resolve deterministic Y positions for the structured cookbook layout.
 *
 * Content scenes use explicit stacking:
 *   - badge:   top safe margin
 *   - heading: below badge with gap
 *   - body:    lower-third region (starts at ~58% frame height)
 *
 * Bookend scenes (title/bottom) remain centered/bottom as before.
 */
function resolveOverlayPosition(overlay, fontSize, lineCount, w, h) {
  const margins = getSafeMargins(w, h);
  const lineHeight = Math.round(fontSize * 1.4);

  // Badge: top-left in safe area
  if (overlay.position === 'top') {
    return { x: `${margins.x}`, y: `${margins.y}` };
  }

  // Heading: upper region with explicit offset below badge area
  if (overlay.position === 'upper') {
    const headingY = Math.round(h * 0.18);
    return { x: '(w-text_w)/2', y: `${headingY}` };
  }

  // Body in content scenes: lower-third region
  // Lower-third starts at 58% of frame height, centered horizontally
  if (overlay.position === 'center') {
    const bodyRegionTop = Math.round(h * 0.58);
    // Center body text block within the lower-third region
    const bodyBlockHeight = lineCount * lineHeight;
    const lowerThirdHeight = h - bodyRegionTop - margins.y;
    const bodyY = bodyRegionTop + Math.round((lowerThirdHeight - bodyBlockHeight) / 2);
    // Clamp to stay within safe area
    const clampedY = Math.max(bodyRegionTop, Math.min(bodyY, h - margins.y - bodyBlockHeight));
    return { x: '(w-text_w)/2', y: `${clampedY}` };
  }

  // Bottom position (bookend subtitles): keep at bottom safe area
  if (overlay.position === 'bottom') {
    return { x: '(w-text_w)/2', y: `(h-text_h-${margins.y})` };
  }

  // Fallback: centered
  return { x: '(w-text_w)/2', y: '(h-text_h)/2' };
}

/**
 * Build a drawbox filter string for the body text translucent background bar.
 * The bar spans the full safe width and covers the body text region with padding.
 */
function buildBodyBackgroundBox(bodyY, lineCount, fontSize, w, h) {
  const margins = getSafeMargins(w, h);
  const lineHeight = Math.round(fontSize * 1.4);
  const padding = Math.round(fontSize * 0.6);

  const boxX = margins.x - padding;
  const boxY = parseInt(bodyY, 10) - padding;
  const boxW = (w - 2 * margins.x) + 2 * padding;
  const boxH = (lineCount * lineHeight) + 2 * padding;

  // Translucent dark background (60% opacity black)
  return `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.6:t=fill`;
}

/**
 * Build a drawbox filter string for the badge pill background.
 * A compact semi-transparent pill behind the step badge text.
 */
function buildBadgePillBox(badgeX, badgeY, text, fontSize, w, h) {
  const paddingX = Math.round(fontSize * 0.5);
  const paddingY = Math.round(fontSize * 0.3);
  // Estimate text width from character count and font size
  const estimatedTextW = Math.round(text.length * fontSize * 0.6);
  const lineHeight = Math.round(fontSize * 1.2);

  const boxX = parseInt(badgeX, 10) - paddingX;
  const boxY = parseInt(badgeY, 10) - paddingY;
  const boxW = estimatedTextW + 2 * paddingX;
  const boxH = lineHeight + 2 * paddingY;

  // Semi-transparent dark pill (50% opacity black)
  return `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.5:t=fill`;
}

/**
 * Build a drawbox filter string for the heading underline.
 * A thin accent-colored line beneath the heading text.
 */
function buildHeadingUnderline(headingY, fontSize, accentColor, w, h) {
  const margins = getSafeMargins(w, h);
  const lineHeight = Math.round(fontSize * 1.4);
  const underlineThickness = Math.max(2, Math.round(fontSize * 0.06));
  const gap = Math.round(fontSize * 0.3);

  // Underline positioned below heading text with a small gap
  const underlineY = parseInt(headingY, 10) + lineHeight + gap;
  // Centered underline spanning 40% of safe width for visual elegance
  const underlineW = Math.round((w - 2 * margins.x) * 0.4);
  const underlineX = Math.round((w - underlineW) / 2);

  // Use the accent color from the overlay palette
  const color = accentColor.replace('#', '0x');
  return `drawbox=x=${underlineX}:y=${underlineY}:w=${underlineW}:h=${underlineThickness}:color=${color}:t=fill`;
}

// ---------------------------------------------------------------------------

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

  // Determine if this scene has a body overlay that needs a background box
  // (content scenes only, not bookends with position=bottom)
  const bodyOverlay = overlays.find((o) => o.type === 'body' && o.position === 'center');

  // Pre-compute badge pill background (must come before badge drawtext)
  const badgeOverlay = overlays.find((o) => o.type === 'badge');
  if (badgeOverlay) {
    const badgeFontSize = Math.round(height / 30);
    const badgePos = resolveOverlayPosition(badgeOverlay, badgeFontSize, 1, width, height);
    const pillFilter = buildBadgePillBox(badgePos.x, badgePos.y, badgeOverlay.text || '', badgeFontSize, width, height);
    filterChain += `,${pillFilter}`;
  }

  // Pre-compute heading underline (must come before heading drawtext)
  const headingOverlay = overlays.find((o) => o.type === 'heading');
  if (headingOverlay) {
    const headingFontSize = Math.round(height / 18);
    const headingPos = resolveOverlayPosition(headingOverlay, headingFontSize, 1, width, height);
    // Use accent color from the badge overlay (same scene palette) for the underline
    const accentSource = badgeOverlay?.fontColor || headingOverlay.fontColor || 'white';
    const underlineColor = accentSource.startsWith('#') ? accentSource : '#ffffff';
    const underlineFilter = buildHeadingUnderline(headingPos.y, headingFontSize, underlineColor, width, height);
    filterChain += `,${underlineFilter}`;
  }

  // Pre-compute body layout for the background box (must come before drawtext)
  if (bodyOverlay) {
    const bodyFontSize = Math.round(height / 25);
    const margins = getSafeMargins(width, height);
    const safeWidth = width - (margins.x * 2);
    const maxCharsPerLine = Math.max(20, Math.floor(safeWidth / (bodyFontSize * 0.6)));
    const lineCount = getWrappedLineCount(bodyOverlay.text || '', maxCharsPerLine);
    const pos = resolveOverlayPosition(bodyOverlay, bodyFontSize, lineCount, width, height);
    const boxFilter = buildBodyBackgroundBox(pos.y, lineCount, bodyFontSize, width, height);
    filterChain += `,${boxFilter}`;
  }

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

    const margins = getSafeMargins(width, height);
    const safeWidth = width - (margins.x * 2);
    const maxCharsPerLine = Math.max(20, Math.floor(safeWidth / (fontSize * 0.6)));
    const wrappedText = overlay.type === 'body'
      ? wrapTextToSafeWidth(rawText, maxCharsPerLine)
      : rawText;
    const text = escapeDrawtext(wrappedText);

    const fontColor = overlay.fontColor || 'white';
    const borderW = overlay.type === 'badge' ? 1 : Math.round(fontSize / 12);
    const borderColor = overlay.type === 'badge' ? 'black' : 'black';

    // Structured layout positioning
    const lineCount = wrappedText.split('\n').length;
    const pos = resolveOverlayPosition(overlay, fontSize, lineCount, width, height);

    filterChain += `,drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=${borderW}:bordercolor=${borderColor}:x=${pos.x}:y=${pos.y}`;
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
