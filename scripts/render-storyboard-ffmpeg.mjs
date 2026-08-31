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

function getAudioDurationSec(filePath) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const duration = Number(output);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

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
      if (scene.narrationText) {
        const audioPath = scene.audio?.file;
        if (!audioPath || !existsSync(audioPath)) {
          errors.push(`Scene ${i} (${scene.id || '?'}): narrationText requires a readable audio.file`);
        } else {
          const audioDurationSec = getAudioDurationSec(audioPath);
          if (audioDurationSec === null) {
            errors.push(`Scene ${i} (${scene.id || '?'}): unable to measure narration audio duration`);
          } else if (audioDurationSec + 0.08 < Number(scene.durationSec)) {
            errors.push(`Scene ${i} (${scene.id || '?'}): narration audio (${audioDurationSec.toFixed(2)}s) is shorter than scene duration (${Number(scene.durationSec).toFixed(2)}s)`);
          }
        }
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

function getSceneLayout(scene, w, h) {
  const layout = scene?.layout || {};
  const margins = getSafeMargins(w, h);
  const isTeaching = layout.mode === 'split-teaching';
  const contentWidth = w - (margins.x * 2);
  const panelRatio = Math.min(0.34, Math.max(0.22, Number(layout.panelWidthRatio) || 0.28));
  const visualRatio = Math.min(0.72, Math.max(0.58, Number(layout.visualWidthRatio) || 0.66));
  const panelWidth = Math.round(contentWidth * panelRatio);
  const textSide = layout.textSide === 'right' ? 'right' : 'left';
  const imageSide = layout.imageSide === 'left' ? 'left' : 'right';
  const imageWidth = Math.round(contentWidth * visualRatio);
  const gap = Math.max(24, contentWidth - panelWidth - imageWidth);
  const panelX = textSide === 'left' ? margins.x : margins.x + imageWidth + gap;
  const imageHeight = Math.round(h * 0.78);
  const imageX = imageSide === 'left' ? margins.x : margins.x + panelWidth + gap;
  const imageY = Math.round((h - imageHeight) / 2);
  return {
    mode: layout.mode || 'default',
    isTeaching,
    panelWidth,
    panelX,
    panelY: Math.round(h * 0.15),
    panelHeight: Math.round(h * 0.68),
    textSide,
    imageSide,
    imageX,
    imageY,
    imageWidth,
    imageHeight,
    margins,
  };
}

function getVisualMotion(scene = {}) {
  const motion = scene.motion || {};
  const type = String(motion.type || 'hold').toLowerCase();
  const startScale = Number(motion.startScale || 1);
  const endScale = Number(motion.endScale || startScale);
  const anchor = motion.anchor || scene.layout?.visualFocus?.anchor || scene.layout?.visualFocus || {};
  const anchorX = Math.min(0.85, Math.max(0.15, Number(anchor.x) || 0.5));
  const anchorY = Math.min(0.85, Math.max(0.15, Number(anchor.y) || 0.5));
  if (!['slow-zoom', 'focus-zoom'].includes(type) || endScale <= startScale || Number(scene.durationSec) < 2.5) {
    return { enabled: false, type: 'hold', startScale: 1, endScale: 1, anchorX, anchorY };
  }
  return { enabled: true, type, startScale, endScale, anchorX, anchorY };
}

function buildForegroundVisualFilter({ scene, targetWidth, targetHeight }) {
  const motion = getVisualMotion(scene);
  if (!motion.enabled) {
    return `[fgsrc]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fg]`;
  }
  const frameCount = Math.max(1, Math.round(Number(scene.durationSec) * fps));
  const increment = ((motion.endScale - motion.startScale) / frameCount).toFixed(8);
  const start = motion.startScale.toFixed(4);
  const end = motion.endScale.toFixed(4);
  return `[fgsrc]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='min(${end},${start}+on*${increment})':x='(iw-iw/zoom)*${motion.anchorX.toFixed(4)}':y='(ih-ih/zoom)*${motion.anchorY.toFixed(4)}':d=1:s=${targetWidth}x${targetHeight}:fps=${fps}[fg]`;
}

function buildFocusHighlight(scene, layout) {
  const focus = scene.layout?.visualFocus || scene.motion?.focus || null;
  if (!focus || !layout.isTeaching) return '';
  const x = Math.min(0.9, Math.max(0.1, Number(focus.x) || 0.5));
  const y = Math.min(0.9, Math.max(0.1, Number(focus.y) || 0.5));
  const w = Math.min(0.7, Math.max(0.08, Number(focus.w) || 0.22));
  const h = Math.min(0.7, Math.max(0.08, Number(focus.h) || 0.22));
  const boxX = Math.round(layout.imageX + ((x - (w / 2)) * layout.imageWidth));
  const boxY = Math.round(layout.imageY + ((y - (h / 2)) * layout.imageHeight));
  const boxW = Math.round(w * layout.imageWidth);
  const boxH = Math.round(h * layout.imageHeight);
  return `,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=0xf5d76e@0.95:t=4:enable='between(t,0,4)'`;
}

function getOverlaySafeWidth(overlay, fontSize, w, h, scene) {
  const layout = getSceneLayout(scene, w, h);
  if (layout.isTeaching && ['panel-heading', 'panel-body', 'reference-bottom'].includes(overlay.position)) {
    return Math.max(20, Math.round(layout.panelWidth * 0.84));
  }
  return w - (layout.margins.x * 2);
}

/**
 * Count how many lines a wrapped body text will occupy.
 */
function getWrappedLineCount(text, maxCharsPerLine) {
  const wrapped = wrapTextToSafeWidth(text, maxCharsPerLine);
  return wrapped.split('\n').length;
}

/**
 * Fit long teaching summaries inside the panel while keeping enough room for
 * the source citation below them. The same size is used by the background
 * box and drawtext pass so the two layers cannot drift apart.
 */
function getTeachingBodyFontSize(overlay, w, h, scene = {}) {
  const baseFontSize = Math.round(h / 31);
  const maxBodyHeight = Math.round(h * 0.22);
  for (let fontSize = baseFontSize; fontSize >= Math.round(h / 50); fontSize -= 1) {
    const safeWidth = getOverlaySafeWidth(overlay, fontSize, w, h, scene);
    const maxCharsPerLine = Math.max(20, Math.floor(safeWidth / (fontSize * 0.6)));
    const lineCount = getWrappedLineCount(overlay.text || '', maxCharsPerLine);
    if (lineCount * Math.round(fontSize * 1.4) <= maxBodyHeight) return fontSize;
  }
  return Math.round(h / 50);
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
function resolveOverlayPosition(overlay, fontSize, lineCount, w, h, scene = {}) {
  const layout = getSceneLayout(scene, w, h);
  const margins = layout.margins;
  const lineHeight = Math.round(fontSize * 1.4);

  if (overlay.position === 'brand-title') {
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.34)}` };
  }

  if (overlay.position === 'brand-kicker') {
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.21)}` };
  }

  if (overlay.position === 'brand-subtitle') {
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.63)}` };
  }

  if (layout.isTeaching && overlay.position === 'panel-heading') {
    return { x: `${layout.panelX + Math.round(layout.panelWidth * 0.08)}`, y: `${Math.round(h * 0.27)}` };
  }

  if (layout.isTeaching && overlay.position === 'panel-body') {
    const bodyBlockHeight = lineCount * lineHeight;
    const availableHeight = Math.round(h * 0.24);
    const bodyY = Math.round(h * 0.50) + Math.round((availableHeight - bodyBlockHeight) / 2);
    return { x: `${layout.panelX + Math.round(layout.panelWidth * 0.08)}`, y: `${Math.max(Math.round(h * 0.48), bodyY)}` };
  }

  if (layout.isTeaching && overlay.position === 'reference-bottom') {
    return { x: `${layout.panelX + Math.round(layout.panelWidth * 0.08)}`, y: `${Math.round(h * 0.82)}` };
  }

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
function buildBodyBackgroundBox(bodyY, lineCount, fontSize, w, h, scene = {}) {
  const layout = getSceneLayout(scene, w, h);
  const margins = layout.margins;
  const lineHeight = Math.round(fontSize * 1.4);
  const padding = Math.round(fontSize * 0.6);

  const boxX = layout.isTeaching ? layout.panelX + Math.round(layout.panelWidth * 0.05) : margins.x - padding;
  const boxY = parseInt(bodyY, 10) - padding;
  const boxW = layout.isTeaching ? Math.round(layout.panelWidth * 0.9) : (w - 2 * margins.x) + 2 * padding;
  const boxH = (lineCount * lineHeight) + 2 * padding;

  // Translucent dark background, constrained to the text panel for teaching scenes.
  return `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.7:t=fill`;
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
function buildHeadingUnderline(headingY, fontSize, accentColor, w, h, scene = {}) {
  const layout = getSceneLayout(scene, w, h);
  const margins = layout.margins;
  const lineHeight = Math.round(fontSize * 1.4);
  const underlineThickness = Math.max(2, Math.round(fontSize * 0.06));
  const gap = Math.round(fontSize * 0.3);

  // Underline positioned below heading text with a small gap
  const underlineY = parseInt(headingY, 10) + lineHeight + gap;
  // Align the underline with the text panel in split-teaching scenes.
  const underlineW = layout.isTeaching
    ? Math.round(layout.panelWidth * 0.72)
    : Math.round((w - 2 * margins.x) * 0.4);
  const underlineX = layout.isTeaching
    ? layout.panelX + Math.round((layout.panelWidth - underlineW) / 2)
    : Math.round((w - underlineW) / 2);

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
    // Create a full-frame, softened version of the source asset behind a
    // readable foreground page or component. This avoids letterboxed slides
    // while retaining the original visual as an honest, inspectable source.
    const foregroundWidth = Math.round(width * 0.84);
    const foregroundHeight = Math.round(height * 0.84);
    const layout = getSceneLayout(scene, width, height);
    const targetWidth = layout.isTeaching ? layout.imageWidth : foregroundWidth;
    const targetHeight = layout.isTeaching ? layout.imageHeight : foregroundHeight;
    const targetX = layout.isTeaching ? layout.imageX : '(W-w)/2';
    const targetY = layout.isTeaching ? layout.imageY : '(H-h)/2';
    const foregroundFilter = buildForegroundVisualFilter({ scene, targetWidth, targetHeight });
    filterBase = `[0:v]split=2[bgsrc][fgsrc];`
      + `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:10,eq=brightness=-0.28:saturation=0.72[bg];`
      + `${foregroundFilter};`
      + `[bg][fg]overlay=${targetX}:${targetY},setsar=1`;
  } else {
    const color = scene.background?.color || '#1a1a2e';
    inputArgs.push('-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}:d=${scene.durationSec}:r=${fps}`);
    filterBase = '[0:v]copy';
  }

  // Build filter chain with text overlays
  let filterChain = filterBase;
  const overlays = scene.overlays || [];

  // Determine if this scene has a body overlay that needs a background box.
  const bodyOverlay = overlays.find((o) => o.type === 'body' && ['center', 'panel-body'].includes(o.position));
  const sceneLayout = getSceneLayout(scene, width, height);
  if (sceneLayout.isTeaching) {
    filterChain += `,drawbox=x=${sceneLayout.panelX}:y=${sceneLayout.panelY}:w=${sceneLayout.panelWidth}:h=${sceneLayout.panelHeight}:color=black@0.74:t=fill`;
  }
  filterChain += buildFocusHighlight(scene, sceneLayout);

  // Pre-compute badge pill background (must come before badge drawtext)
  const badgeOverlay = overlays.find((o) => o.type === 'badge');
  if (badgeOverlay) {
    const badgeFontSize = Math.round(height / 30);
    const badgePos = resolveOverlayPosition(badgeOverlay, badgeFontSize, 1, width, height, scene);
    const pillFilter = buildBadgePillBox(badgePos.x, badgePos.y, badgeOverlay.text || '', badgeFontSize, width, height);
    filterChain += `,${pillFilter}`;
  }

  // Pre-compute heading underline (must come before heading drawtext)
  const headingOverlay = overlays.find((o) => o.type === 'heading');
  if (headingOverlay) {
    const headingFontSize = Math.round(height / 18);
    const headingPos = resolveOverlayPosition(headingOverlay, headingFontSize, 1, width, height, scene);
    // Use accent color from the badge overlay (same scene palette) for the underline
    const accentSource = badgeOverlay?.fontColor || headingOverlay.fontColor || 'white';
    const underlineColor = accentSource.startsWith('#') ? accentSource : '#ffffff';
    const underlineFilter = buildHeadingUnderline(headingPos.y, headingFontSize, underlineColor, width, height, scene);
    filterChain += `,${underlineFilter}`;
  }

  // Pre-compute body layout for the background box (must come before drawtext)
  if (bodyOverlay) {
    const bodyFontSize = bodyOverlay.position === 'panel-body' && sceneLayout.isTeaching
      ? getTeachingBodyFontSize(bodyOverlay, width, height, scene)
      : Math.round(height / 31);
    const margins = getSafeMargins(width, height);
    const safeWidth = getOverlaySafeWidth(bodyOverlay, bodyFontSize, width, height, scene);
    const maxCharsPerLine = Math.max(20, Math.floor(safeWidth / (bodyFontSize * 0.6)));
    const lineCount = getWrappedLineCount(bodyOverlay.text || '', maxCharsPerLine);
    const pos = resolveOverlayPosition(bodyOverlay, bodyFontSize, lineCount, width, height, scene);
    const boxFilter = buildBodyBackgroundBox(pos.y, lineCount, bodyFontSize, width, height, scene);
    filterChain += `,${boxFilter}`;
  }

  overlays.forEach((overlay) => {
    const rawText = overlay.text || '';
    if (!rawText) return;

    // Cookbook-style font sizing by overlay type
    let fontSize;
    switch (overlay.type) {
      case 'title':     fontSize = Math.round(height / 12); break;
      case 'heading':   fontSize = Math.round(height / 24); break;
      case 'badge':     fontSize = Math.round(height / 34); break;
      case 'kicker':    fontSize = Math.round(height / 34); break;
      case 'reference': fontSize = Math.round(height / 42); break;
      case 'body':      fontSize = Math.round(height / 31); break;
      default:          fontSize = Math.round(height / 30); break;
    }

    if (overlay.type === 'body' && overlay.position === 'panel-body' && sceneLayout.isTeaching) {
      fontSize = getTeachingBodyFontSize(overlay, width, height, scene);
    }

    const safeWidth = getOverlaySafeWidth(overlay, fontSize, width, height, scene);
    const maxCharsPerLine = Math.max(20, Math.floor(safeWidth / (fontSize * 0.6)));
    const wrappedText = (overlay.type === 'body' || (sceneLayout.isTeaching && overlay.position === 'panel-heading'))
      ? wrapTextToSafeWidth(rawText, maxCharsPerLine)
      : rawText;
    const text = escapeDrawtext(wrappedText);

    const fontColor = overlay.fontColor || 'white';
    const borderW = overlay.type === 'badge' ? 1 : Math.round(fontSize / 12);
    const borderColor = overlay.type === 'badge' ? 'black' : 'black';

    // Structured layout positioning
    const lineCount = wrappedText.split('\n').length;
    const pos = resolveOverlayPosition(overlay, fontSize, lineCount, width, height, scene);

    filterChain += `,drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=${borderW}:bordercolor=${borderColor}:x=${pos.x}:y=${pos.y}`;
  });

  // Add simple numbered target markers. These are intentionally modest: they
  // reveal exactly what the narration refers to without covering the component.
  for (const callout of (Array.isArray(scene.callouts) ? scene.callouts : [])) {
    const target = callout?.target || {};
    const normalizedX = Math.min(0.96, Math.max(0.04, Number(target.x) || 0.5));
    const normalizedY = Math.min(0.94, Math.max(0.06, Number(target.y) || 0.5));
    const x = Math.round(sceneLayout.isTeaching
      ? sceneLayout.imageX + (normalizedX * sceneLayout.imageWidth)
      : normalizedX * width);
    const y = Math.round(sceneLayout.isTeaching
      ? sceneLayout.imageY + (normalizedY * sceneLayout.imageHeight)
      : normalizedY * height);
    const boxSize = Math.round(Math.min(width, height) * 0.06);
    const label = escapeDrawtext(String(callout.label || callout.number || '•'));
    const appearAt = Math.max(0, Number(callout.appearSec ?? callout.appear_sec ?? (index * 0.45)) || 0).toFixed(2);
    const enabled = `:enable='gte(t,${appearAt})'`;
    const lineFrom = callout?.lineFrom || null;
    if (lineFrom) {
      const fromX = Math.round(sceneLayout.isTeaching
        ? sceneLayout.imageX + (Math.min(0.96, Math.max(0.04, Number(lineFrom.x) || 0.5)) * sceneLayout.imageWidth)
        : Math.min(0.96, Math.max(0.04, Number(lineFrom.x) || 0.5)) * width);
      const fromY = Math.round(sceneLayout.isTeaching
        ? sceneLayout.imageY + (Math.min(0.94, Math.max(0.06, Number(lineFrom.y) || 0.5)) * sceneLayout.imageHeight)
        : Math.min(0.94, Math.max(0.06, Number(lineFrom.y) || 0.5)) * height);
      const horizontalX = Math.min(fromX, x);
      const horizontalW = Math.max(2, Math.abs(fromX - x));
      const verticalY = Math.min(fromY, y);
      const verticalH = Math.max(2, Math.abs(fromY - y));
      filterChain += `,drawbox=x=${horizontalX}:y=${fromY - 2}:w=${horizontalW}:h=4:color=0xf5d76e@0.8:t=fill${enabled}`;
      filterChain += `,drawbox=x=${x - 2}:y=${verticalY}:w=4:h=${verticalH}:color=0xf5d76e@0.8:t=fill${enabled}`;
    }
    filterChain += `,drawbox=x=${x - boxSize / 2}:y=${y - boxSize / 2}:w=${boxSize}:h=${boxSize}:color=0xf5d76e@0.95:t=4${enabled}`;
    filterChain += `,drawtext=text='${label}':fontsize=${Math.round(boxSize * 0.68)}:fontcolor=0xf5d76e:borderw=2:bordercolor=black:x=${x - Math.round(boxSize * 0.18)}:y=${y - Math.round(boxSize * 0.42)}${enabled}`;
  }

  // Duration trim for image-based inputs
  if (scene.background?.image) {
    filterChain += `,trim=duration=${scene.durationSec},setpts=PTS-STARTPTS`;
  }

  filterChain += `[vout]`;

  // Audio input
  const audioArgs = [];
  if (scene.audio?.file && existsSync(scene.audio.file)) {
    audioArgs.push('-i', scene.audio.file);
    filterChain += `;[1:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[aout]`;
  } else {
    // Generate silent audio
    audioArgs.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`);
    filterChain += `;[1:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[aout]`;
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
    // Video segments share a codec and may be stream-copied. Re-encode audio
    // after concatenation so AAC frame boundaries and timestamps remain valid
    // when narration segments have different non-frame-aligned durations.
    '-c:v', 'copy',
    // Normalize the assembled narration after resampling so the final program,
    // not merely individual scene files, targets the release loudness standard.
    // A final limiter leaves a margin below the loudness pass’s theoretical
    // true-peak target, protecting the encoded AAC output from overshoots.
    '-af', 'aresample=48000:async=1:first_pts=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=0',
    '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
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
