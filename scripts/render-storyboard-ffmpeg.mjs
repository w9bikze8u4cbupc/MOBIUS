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
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PRESENTATION_TOKENS, resolvePanelStyle, resolveFont, solvePresentationLayout } = require('../src/services/presentationDesignSystem.cjs');

const FFMPEG_BIN = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
const FFPROBE_BIN = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';

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
    const output = execFileSync(FFPROBE_BIN, [
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
      if (scene.narrationText && scene.audio?.speechRequired !== false) {
        const audioPath = scene.audio?.file;
        if (!audioPath || !existsSync(audioPath)) {
          errors.push(`Scene ${i} (${scene.id || '?'}): narrationText requires a readable audio.file`);
        } else {
          const audioDurationSec = getAudioDurationSec(audioPath);
          if (audioDurationSec === null) {
            errors.push(`Scene ${i} (${scene.id || '?'}): unable to measure narration audio duration`);
          } else if (
            audioDurationSec + Number(scene.audio?.postSpeechTailSec || 0) + 0.08 < Number(scene.durationSec)
            && !scene.outroCompletionGuard?.valid
          ) {
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
    execFileSync(FFMPEG_BIN, ['-version'], { stdio: 'pipe' });
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
    .replace(/:/g, '\\:');
}

function escapeFontFile(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
}

function fontFileForOverlay(overlay) {
  const role = overlay?.type === 'title' || overlay?.type === 'heading' || overlay?.type === 'section-card-title' ? 'display' : (overlay?.type === 'badge' || overlay?.type === 'reference' || overlay?.type === 'pause-cue' ? 'label' : 'body');
  const font = resolveFont(role);
  return font.available ? `:fontfile='${escapeFontFile(font.fontFile)}'` : '';
}

function wrapTextToSafeWidth(text, maxCharsPerLine) {
  return String(text || '').split(/\r?\n/).flatMap((sourceLine) => {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
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
    return lines.length ? lines : [''];
  }).join('\n');
}

function renderableOverlayText(value) {
  return String(value || '');
}

// ---------------------------------------------------------------------------
// Layout helpers — structured lower-third with explicit stacking
// ---------------------------------------------------------------------------

/**
 * Compute safe margins for the frame.
 */
function getSafeMargins(w, h) {
  return {
    x: Math.round(w * PRESENTATION_TOKENS.layout.safeMargins.x),
    y: Math.round(h * PRESENTATION_TOKENS.layout.safeMargins.y),
  };
}

function getSceneLayout(scene, w, h) {
  const layout = scene?.layout || {};
  const margins = getSafeMargins(w, h);
  if (layout.mode === 'wide-diagram') {
    const contentWidth = w - (margins.x * 2);
    const imageWidth = Math.round(contentWidth * 0.88);
    const imageHeight = Math.round(h * 0.48);
    const panelWidth = contentWidth;
    const panelHeight = Math.round(h * 0.23);
    return {
      mode: layout.mode,
      isTeaching: true,
      metadataCard: false,
      panelWidth,
      panelX: margins.x,
      panelY: Math.round(h * 0.63),
      panelHeight: Math.round(h * 0.33),
      textSide: 'left',
      imageSide: 'right',
      imageX: Math.round((w - imageWidth) / 2),
      imageY: Math.round(h * 0.08),
      imageWidth,
      imageHeight,
      padding: Math.round(PRESENTATION_TOKENS.layout.panelPaddingPx1080 * (h / 1080)),
      margins,
    };
  }
  const isTeaching = layout.mode === 'split-teaching';
  if (isTeaching) {
    const overlays = scene.overlays || [];
    const findText = (type, position) => overlays.find((overlay) => overlay.type === type && (!position || overlay.position === position))?.text || '';
    const solved = solvePresentationLayout({
      width: w,
      height: h,
      sceneType: layout.metadataCard ? 'metadata' : (layout.presentationLayout?.contentType === 'list' ? 'list' : 'teaching'),
      title: findText('title', 'metadata-title'),
      heading: findText('heading', 'panel-heading'),
      body: findText('body', 'panel-body'),
      tags: findText('tags', 'panel-tags'),
      reference: findText('reference'),
      itemCount: Math.max(1, String(findText('body', 'panel-body')).split(/\r?\n/).filter(Boolean).length),
      preferredImageProminence: Number(layout.visualWidthRatio) || 0.56,
      imageAspect: Number(layout.visualAspectRatio) || 1,
      preferredFontPx: layout.metadataCard ? 50 : null,
      minimumFontPx: layout.metadataCard ? 44 : null,
      textSide: layout.textSide === 'right' ? 'right' : 'left',
      imageSide: layout.imageSide === 'left' ? 'left' : 'right',
    });
    return { ...solved, mode: layout.mode, isTeaching: true, metadataCard: layout.metadataCard === true, margins };
  }
  const contentWidth = w - (margins.x * 2);
  const panelRatio = Math.min(PRESENTATION_TOKENS.layout.maxPanelWidthRatio, Math.max(0.28, Number(layout.panelWidthRatio) || 0.30));
  const visualRatio = Math.min(0.68, Math.max(PRESENTATION_TOKENS.layout.minVisualWidthRatio, Number(layout.visualWidthRatio) || 0.58));
  const panelWidth = Math.round(contentWidth * panelRatio);
  const textSide = layout.textSide === 'right' ? 'right' : 'left';
  const imageSide = layout.imageSide === 'left' ? 'left' : 'right';
  const imageWidth = Math.round(contentWidth * visualRatio);
  const gap = Math.max(24, contentWidth - panelWidth - imageWidth);
  const panelX = textSide === 'left' ? margins.x : margins.x + imageWidth + gap;
  const imageHeight = Math.round(h * 0.78);
  const imageX = imageSide === 'left' ? margins.x : margins.x + panelWidth + gap;
  const imageY = Math.round((h - imageHeight) / 2);
  const bodyTextLength = (scene?.overlays || [])
    .filter((overlay) => ['body', 'tags'].includes(overlay.type))
    .map((overlay) => String(overlay.text || ''))
    .join('\n').length;
  const compactPanelRatio = isTeaching
    ? Math.min(0.78, Math.max(0.42, 0.34 + (bodyTextLength / 330)))
    : 0.68;
  return {
    mode: layout.mode || 'default',
    isTeaching,
    metadataCard: layout.metadataCard === true,
    panelWidth,
    panelX,
    panelY: Math.round(h * (isTeaching ? 0.19 : 0.15)),
    panelHeight: Math.round(h * compactPanelRatio),
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
  if (!['slow-zoom', 'focus-zoom', 'slow-pan'].includes(type) || endScale <= startScale || Number(scene.durationSec) < 2.5) {
    return { enabled: false, type: 'hold', startScale: 1, endScale: 1, anchorX, anchorY };
  }
  return { enabled: true, type, startScale, endScale, anchorX, anchorY };
}

function buildForegroundVisualFilter({ scene, targetWidth, targetHeight }) {
  const motion = getVisualMotion(scene);
  if (!motion.enabled) {
    const fit = scene.layout?.mode === 'brand' ? 'increase,crop=' + targetWidth + ':' + targetHeight : 'decrease';
    if (scene.layout?.mode === 'brand') return `[fgsrc]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=${fit}[fg]`;
    // A contained visual must own a full transparent pane so FFmpeg centers
    // the scaled pixels inside the solved region instead of anchoring them at
    // its upper-left corner. Top alignment is only valid when a scene declares
    // a real lower-zone purpose and requests it explicitly.
    const alignment = scene.layout?.visualPaneAlignment || {};
    const padX = alignment.horizontal === 'LEFT' ? '0' : alignment.horizontal === 'RIGHT' ? 'ow-iw' : '(ow-iw)/2';
    const padY = alignment.vertical === 'TOP' ? '0' : alignment.vertical === 'BOTTOM' ? 'oh-ih' : '(oh-ih)/2';
    // Reserve two pixels before padding because swscale may round one
    // dimension upward when it preserves the source aspect ratio.
    return `[fgsrc]scale=${Math.max(2, targetWidth - 2)}:${Math.max(2, targetHeight - 2)}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:${padX}:${padY}:color=black@0[fg]`;
  }
  const frameCount = Math.max(1, Math.round(Number(scene.durationSec) * fps));
  const increment = ((motion.endScale - motion.startScale) / frameCount).toFixed(8);
  const start = motion.startScale.toFixed(4);
  const end = motion.endScale.toFixed(4);
  const panX = motion.type === 'slow-pan' ? `((iw-iw/zoom)*min(0.85,${motion.anchorX.toFixed(4)}+on/${frameCount}*0.12))` : `(iw-iw/zoom)*${motion.anchorX.toFixed(4)}`;
  return `[fgsrc]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='min(${end},${start}+on*${increment})':x='${panX}':y='(ih-ih/zoom)*${motion.anchorY.toFixed(4)}':d=1:s=${targetWidth}x${targetHeight}:fps=${fps}[fg]`;
}

function buildFocusHighlight(scene, layout) {
  const timeline = Array.isArray(scene.focusCueTimeline)
    ? scene.focusCueTimeline
    : (scene.focusCueTimeline?.cues || []);
  if (timeline.length) {
    return timeline.filter((cue) => cue.absoluteBounds && Number(cue.endSec) > Number(cue.startSec)).map((cue) => {
      const box = cue.absoluteBounds;
      const x = Math.max(0, Math.round(Number(box.x)));
      const y = Math.max(0, Math.round(Number(box.y)));
      const w = Math.max(4, Math.round(Number(box.width)));
      const h = Math.max(4, Math.round(Number(box.height)));
      const start = Math.max(0, Number(cue.startSec));
      const end = Math.min(Number(scene.durationSec), Number(cue.endSec));
      return `,drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0xcda35e@0.96:t=5:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
    }).join('');
  }
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
  return `,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=0xb7ef59@0.95:t=4:enable='between(t,0,4)'`;
}

function getOverlaySafeWidth(overlay, fontSize, w, h, scene) {
  const layout = getSceneLayout(scene, w, h);
  if (layout.isTeaching && ['metadata-title', 'panel-heading', 'panel-body', 'panel-tags'].includes(overlay.position)) {
    return Math.max(20, layout.textWidth || Math.round(layout.panelWidth * 0.92));
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
  const solved = getSceneLayout(scene, w, h);
  const configured = Number(solved?.bodyFontPx) || Number(scene?.layout?.presentationLayout?.fontSizePx) || PRESENTATION_TOKENS.typography.body.preferredPx1080;
  const minimum = Number(scene?.layout?.presentationLayout?.minimumFontPx) || PRESENTATION_TOKENS.typography.body.minPx1080;
  const baseFontSize = Math.round(configured * (h / 1080));
  const minFontSize = Math.round(minimum * (h / 1080));
  const maxBodyHeight = Math.round(h * (scene?.layout?.metadataCard ? 0.54 : 0.34));
  for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const safeWidth = getOverlaySafeWidth(overlay, fontSize, w, h, scene);
    const maxCharsPerLine = Math.max(15, Math.floor(safeWidth / (fontSize * 0.52)));
    const lineCount = getWrappedLineCount(renderableOverlayText(overlay.text), maxCharsPerLine);
    if (lineCount * Math.round(fontSize * PRESENTATION_TOKENS.typography.body.lineHeight) <= maxBodyHeight) return fontSize;
  }
  return minFontSize;
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
  const lineHeight = Math.round(fontSize * PRESENTATION_TOKENS.typography.body.lineHeight);

  if (overlay.position === 'brand-title') {
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.34)}` };
  }

  if (overlay.position === 'brand-kicker') {
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.21)}` };
  }

  if (overlay.position === 'brand-subtitle') {
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.63)}` };
  }

  if (overlay.position === 'section-card-title') {
    // Keep the approved banner identity unobstructed; the section title sits
    // in the lower, visually quieter café-table region.
    return { x: '(w-text_w)/2', y: `${Math.round(h * 0.76)}` };
  }
  if (overlay.position === 'pause-cue') {
    return { x: '(w-text_w)/2', y: 'h-text_h-48' };
  }

  if (layout.isTeaching && overlay.position === 'panel-heading') {
    const inset = Math.round(layout.panelWidth * 0.08);
    const x = scene?.layout?.headingAlign === 'right'
      ? `${layout.panelX + layout.panelWidth - inset}-text_w`
      : `${layout.panelX + inset}`;
    return { x, y: `${layout.headingY ?? (layout.mode === 'wide-diagram' ? layout.panelY + layout.padding : Math.round(h * 0.27))}` };
  }

  if (layout.isTeaching && overlay.position === 'metadata-title') {
    return { x: `${layout.panelX + layout.padding}`, y: `${layout.titleY ?? layout.panelY + layout.padding}` };
  }

  if (layout.isTeaching && overlay.position === 'panel-body') {
    const bodyBlockHeight = lineCount * lineHeight;
    const metadataCard = layout.metadataCard === true;
    // Keep short identity callouts inside the compact panel as well as
    // centered within the available lower content region. Longer objective
    // lists use the same region and are vertically balanced by line count.
    const bodyRegionTop = layout.bodyY ?? (layout.mode === 'wide-diagram' ? layout.panelY + layout.padding + Math.round(fontSize * 0.95) : Math.round(h * (metadataCard ? 0.36 : 0.40)));
    const availableHeight = Math.round(h * (metadataCard ? 0.52 : (layout.mode === 'wide-diagram' ? 0.22 : 0.34)));
    const bodyY = bodyRegionTop;
    const inset = Math.round(layout.panelWidth * 0.08);
    const x = scene?.layout?.bodyAlign === 'center'
      ? `${layout.panelX}+((${layout.panelWidth}-text_w)/2)`
      : scene?.layout?.bodyAlign === 'right'
        ? `${layout.panelX + layout.panelWidth - inset}-text_w`
        : `${layout.panelX + inset}`;
    return { x, y: `${Math.max(bodyRegionTop, bodyY)}` };
  }

  if (layout.isTeaching && overlay.position === 'panel-tags') {
    const bodyOverlay = (scene.overlays || []).find((candidate) => candidate.type === 'body' && candidate.position === 'panel-body');
    const bodyFontSize = bodyOverlay ? getTeachingBodyFontSize(bodyOverlay, w, h, scene) : fontSize;
    const bodySafeWidth = getOverlaySafeWidth(bodyOverlay || overlay, bodyFontSize, w, h, scene);
    const bodyChars = Math.max(15, Math.floor(bodySafeWidth / (bodyFontSize * 0.52)));
    const bodyLines = bodyOverlay ? getWrappedLineCount(renderableOverlayText(bodyOverlay.text), bodyChars) : 0;
    const bodyPos = bodyOverlay ? resolveOverlayPosition(bodyOverlay, bodyFontSize, bodyLines, w, h, scene) : { y: `${layout.panelY}` };
    const bodyEnd = parseInt(bodyPos.y, 10) + (bodyLines * Math.round(bodyFontSize * PRESENTATION_TOKENS.typography.body.lineHeight));
    const tagsY = layout.tagsY ?? Math.min(layout.panelY + layout.panelHeight - lineHeight - 24, bodyEnd + Math.round(fontSize * 0.35));
    const inset = Math.round(layout.panelWidth * 0.08);
    return { x: `${layout.panelX + inset}`, y: `${Math.max(layout.panelY, tagsY)}` };
  }

  if (layout.isTeaching && overlay.position === 'reference-bottom') {
    return { x: `${layout.margins.x}`, y: `${Math.round(h * 0.94)}` };
  }

  if (layout.isTeaching && overlay.position === 'reference-bottom-left') {
    return { x: `${layout.panelX + layout.padding}`, y: `${layout.referenceY ?? (layout.mode === 'wide-diagram' ? layout.panelY + layout.panelHeight - 42 : Math.round(h * 0.94))}` };
  }

  // Semantic badge: centered in the panel capsule for split-teaching scenes.
  if (overlay.position === 'top') {
    if (layout.isTeaching) {
      const estimatedTextW = Math.round(String(overlay.text || '').length * fontSize * 0.52);
      return { x: `${layout.panelX + Math.max(0, Math.round((layout.panelWidth - estimatedTextW) / 2))}`, y: `${margins.y}` };
    }
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
  const lineHeight = Math.round(fontSize * PRESENTATION_TOKENS.typography.body.lineHeight);
  const padding = Math.max(PRESENTATION_TOKENS.layout.panelPaddingPx1080, Math.round(fontSize * 0.72));

  const boxX = layout.isTeaching ? layout.panelX : margins.x - padding;
  // Teaching panels are a single semantic container. Paint the full
  // content-driven panel so metadata tags and wrapped objective lines never
  // appear to spill onto the background.
  const boxY = layout.isTeaching ? layout.panelY : Math.max(0, parseInt(bodyY, 10) - padding);
  const boxW = layout.isTeaching ? layout.panelWidth : (w - 2 * margins.x) + 2 * padding;
  const boxH = layout.isTeaching ? layout.panelHeight : (lineCount * lineHeight) + 2 * padding;
  const style = resolvePanelStyle(scene?.layout?.panelVariant || 'WARM_DARK');
  const shadowX = boxX + Math.round(padding * 0.18);
  const shadowY = boxY + Math.round(padding * 0.22);
  return `drawbox=x=${shadowX}:y=${shadowY}:w=${boxW}:h=${boxH}:color=${style.shadowFfmpeg}:t=fill,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.fillFfmpeg}:t=fill,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=5:color=${style.highlightFfmpeg}:t=fill,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.borderFfmpeg}:t=4`;
}

/**
 * Build a drawbox filter string for the badge pill background.
 * A compact semi-transparent pill behind the step badge text.
 */
function buildBadgePillBox(badgeX, badgeY, text, fontSize, w, h, scene = {}) {
  const paddingX = Math.round(fontSize * 0.5);
  const paddingY = Math.round(fontSize * 0.3);
  // Estimate text width from character count and font size
  const estimatedTextW = Math.round(text.length * fontSize * 0.52);
  const lineHeight = Math.round(fontSize * 1.2);

  const boxX = parseInt(badgeX, 10) - paddingX;
  const boxY = parseInt(badgeY, 10) - paddingY;
  const boxW = estimatedTextW + 2 * paddingX;
  const boxH = lineHeight + 2 * paddingY;

  const style = resolvePanelStyle(scene?.layout?.panelVariant || 'WARM_DARK');
  return `drawbox=x=${boxX + 4}:y=${boxY + 5}:w=${boxW}:h=${boxH}:color=${style.shadowFfmpeg}:t=fill,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.fillFfmpeg}:t=fill,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.borderFfmpeg}:t=3`;
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
  const underlineX = layout.isTeaching && layout.textSide === 'right'
    ? layout.panelX + layout.panelWidth - Math.round(layout.panelWidth * 0.08) - underlineW
    : layout.isTeaching
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
    if (scene.layout?.mode === 'visual-first-full-frame') {
      // VisualPlan storyboard frames are already canonical 1920×1080
      // compositions. Rendering them directly preserves the physically
      // reviewed component scale, crop, alignment and brand material.
      filterBase = `[0:v]scale=${width}:${height}:flags=lanczos,setsar=1`;
    } else {
    // Create a full-frame, softened version of the source asset behind a
    // readable foreground page or component. This avoids letterboxed slides
    // while retaining the original visual as an honest, inspectable source.
    const fullDiagram = scene.layout?.mode === 'diagram-full';
    const hasDeclaredLowerZone = Boolean(scene.layout?.visualPaneAlignment?.declaredLowerZone);
    const foregroundWidth = scene.layout?.mode === 'brand' ? width : Math.round(width * (fullDiagram ? 0.94 : 0.84));
    const foregroundHeight = scene.layout?.mode === 'brand' ? height : Math.round(height * (fullDiagram ? (hasDeclaredLowerZone ? 0.82 : 0.94) : 0.84));
    const layout = getSceneLayout(scene, width, height);
    const targetWidth = layout.isTeaching ? layout.imageWidth : foregroundWidth;
    const targetHeight = layout.isTeaching ? layout.imageHeight : foregroundHeight;
    const targetX = layout.isTeaching ? layout.imageX : '(W-w)/2';
    const targetY = layout.isTeaching ? layout.imageY : (hasDeclaredLowerZone ? Math.round(height * 0.035) : '(H-h)/2');
    const foregroundFilter = buildForegroundVisualFilter({ scene, targetWidth, targetHeight });
    filterBase = `[0:v]split=2[bgsrc][fgsrc];`
      + `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:10,eq=brightness=-0.28:saturation=0.72[bg];`
      + `${foregroundFilter};`
      + `[bg][fg]overlay=${targetX}:${targetY},setsar=1`;
    }
  } else {
    const color = scene.background?.color || '#1a1a2e';
    inputArgs.push('-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}:d=${scene.durationSec}:r=${fps}`);
    filterBase = '[0:v]copy';
  }

  const motionCues = (Array.isArray(scene.motionCueTimeline)
    ? scene.motionCueTimeline
    : (scene.motionCueTimeline?.cues || []))
    .filter((cue) => cue.assetPath && existsSync(cue.assetPath)
      && cue.startAbsolute && cue.endAbsolute
      && Number(cue.endSec) > Number(cue.startSec));
  const motionInputIndexes = [];
  for (const cue of motionCues) {
    motionInputIndexes.push(inputArgs.filter((value) => value === '-i').length);
    inputArgs.push('-loop', '1', '-i', cue.assetPath);
  }

  // Build filter chain with text overlays
  let filterChain = filterBase;
  const overlays = scene.overlays || [];

  // Determine if this scene has a body overlay that needs a background box.
  const bodyOverlay = overlays.find((o) => o.type === 'body' && ['center', 'panel-body'].includes(o.position));
  const sceneLayout = getSceneLayout(scene, width, height);
  // Do not paint a full-height text column behind every teaching scene. The
  // body-specific box below is sized from the actual wrapped copy, which keeps
  // short support text secondary and leaves the source visual dominant.
  if (sceneLayout.isTeaching && !bodyOverlay) {
    const panelStyle = resolvePanelStyle(scene.layout?.panelVariant || 'WARM_DARK');
    filterChain += `,drawbox=x=${sceneLayout.panelX + 8}:y=${sceneLayout.panelY + 10}:w=${sceneLayout.panelWidth}:h=${sceneLayout.panelHeight}:color=${panelStyle.shadowFfmpeg}:t=fill,drawbox=x=${sceneLayout.panelX}:y=${sceneLayout.panelY}:w=${sceneLayout.panelWidth}:h=${sceneLayout.panelHeight}:color=${panelStyle.fillFfmpeg}:t=fill,drawbox=x=${sceneLayout.panelX}:y=${sceneLayout.panelY}:w=${sceneLayout.panelWidth}:h=5:color=${panelStyle.highlightFfmpeg}:t=fill,drawbox=x=${sceneLayout.panelX}:y=${sceneLayout.panelY}:w=${sceneLayout.panelWidth}:h=${sceneLayout.panelHeight}:color=${panelStyle.borderFfmpeg}:t=4`;
  }
  // A restrained procedural grain adds tactile walnut/paper variation to the
  // warm panel treatment without introducing a photographic or cartoon asset.
  // It is intentionally subtle and remains deterministic in the render path.
  if (sceneLayout.isTeaching) filterChain += ',noise=alls=2:allf=t+u';
  filterChain += buildFocusHighlight(scene, sceneLayout);

  // Pre-compute badge pill background (must come before badge drawtext)
  const badgeOverlay = overlays.find((o) => o.type === 'badge');
  if (badgeOverlay) {
    const badgeFontSize = Math.max(
      Math.round(height * (PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080 / 1080)),
      Math.round(height * (PRESENTATION_TOKENS.layout.sectionBadgePreferredPx1080 / 1080)),
    );
    const badgePos = resolveOverlayPosition(badgeOverlay, badgeFontSize, 1, width, height, scene);
    const pillFilter = buildBadgePillBox(badgePos.x, badgePos.y, badgeOverlay.text || '', badgeFontSize, width, height, scene);
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
    const maxCharsPerLine = Math.max(15, Math.floor(safeWidth / (bodyFontSize * 0.52)));
    const lineCount = getWrappedLineCount(renderableOverlayText(bodyOverlay.text), maxCharsPerLine);
    const pos = resolveOverlayPosition(bodyOverlay, bodyFontSize, lineCount, width, height, scene);
    const boxFilter = buildBodyBackgroundBox(pos.y, lineCount, bodyFontSize, width, height, scene);
    filterChain += `,${boxFilter}`;
  }

  overlays.forEach((overlay) => {
    const rawText = renderableOverlayText(overlay.text);
    if (!rawText) return;

    // Cookbook-style font sizing by overlay type
    let fontSize;
    switch (overlay.type) {
      case 'section-card-title': fontSize = Math.round(height / 9); break;
      case 'pause-cue': fontSize = Math.max(42, Math.round(height / 24)); break;
      case 'title':     fontSize = overlay.position === 'metadata-title' ? (sceneLayout.titleFontPx || Math.round(height / 24)) : Math.round(height / 12); break;
      case 'heading':   fontSize = sceneLayout.headingFontPx || Math.round(height / 24); break;
      case 'badge':     fontSize = Math.max(
        Math.round(height * (PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080 / 1080)),
        Math.round(height * (PRESENTATION_TOKENS.layout.sectionBadgePreferredPx1080 / 1080)),
      ); break;
      case 'kicker':    fontSize = Math.round(height / 34); break;
      case 'reference': fontSize = sceneLayout.referenceFontPx || Math.round(height / 42); break;
      case 'body':      fontSize = sceneLayout.bodyFontPx || Math.round(height / 31); break;
      case 'tags':      fontSize = sceneLayout.tagsFontPx || Math.round(height / 42); break;
      default:          fontSize = Math.round(height / 30); break;
    }

    if (overlay.type === 'body' && overlay.position === 'panel-body' && sceneLayout.isTeaching) {
      fontSize = getTeachingBodyFontSize(overlay, width, height, scene);
    }

    const safeWidth = getOverlaySafeWidth(overlay, fontSize, width, height, scene);
    const maxCharsPerLine = Math.max(15, Math.floor(safeWidth / (fontSize * 0.52)));
    const wrappedText = (overlay.type === 'body' || (sceneLayout.isTeaching && ['panel-heading', 'metadata-title', 'panel-tags'].includes(overlay.position)))
      ? wrapTextToSafeWidth(rawText, maxCharsPerLine)
      : rawText;
    const text = escapeDrawtext(wrappedText);

    const fontColor = overlay.fontColor || 'white';
    const borderW = overlay.type === 'badge' ? 1 : Math.round(fontSize / 12);
    const borderColor = overlay.type === 'badge' ? '0x211a16' : '0x211a16';

    // Structured layout positioning
    const lineCount = wrappedText.split('\n').length;
    const pos = resolveOverlayPosition(overlay, fontSize, lineCount, width, height, scene);

    if (overlay.type === 'pause-cue') {
      const cueX = Math.round(width * 0.19);
      const cueY = Math.round(height * 0.885);
      const cueWidth = Math.round(width * 0.62);
      const cueHeight = Math.round(height * 0.095);
      filterChain += `,drawbox=x=${cueX}:y=${cueY}:w=${cueWidth}:h=${cueHeight}:color=0x314928@0.98:t=fill,drawbox=x=${cueX}:y=${cueY}:w=${cueWidth}:h=${cueHeight}:color=0xc89b58@0.98:t=3`;
    }
    filterChain += `,drawtext=expansion=none:text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=${borderW}:bordercolor=${borderColor}${fontFileForOverlay(overlay)}:x=${pos.x}:y=${pos.y}`;
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
      filterChain += `,drawbox=x=${horizontalX}:y=${fromY - 2}:w=${horizontalW}:h=4:color=0xb7ef59@0.8:t=fill${enabled}`;
      filterChain += `,drawbox=x=${x - 2}:y=${verticalY}:w=4:h=${verticalH}:color=0xb7ef59@0.8:t=fill${enabled}`;
    }
    filterChain += `,drawbox=x=${x - boxSize / 2}:y=${y - boxSize / 2}:w=${boxSize}:h=${boxSize}:color=0xb7ef59@0.95:t=4${enabled}`;
    filterChain += `,drawtext=expansion=none:text='${label}':fontsize=${Math.round(boxSize * 0.68)}:fontcolor=0xb7ef59:borderw=2:bordercolor=0x211a16:x=${x - Math.round(boxSize * 0.18)}:y=${y - Math.round(boxSize * 0.42)}${enabled}`;
  }

  const timedOverlays = Array.isArray(scene.timedOverlayTimeline)
    ? scene.timedOverlayTimeline
    : (scene.timedOverlayTimeline?.cues || []);
  for (const cue of timedOverlays.filter((entry) => entry.text && Number(entry.endSec) > Number(entry.startSec))) {
    const fontSize = Math.max(18, Math.round(Number(cue.fontSize || 36)));
    const text = escapeDrawtext(String(cue.text));
    const x = Math.round(Number(cue.x || 0));
    const y = Math.round(Number(cue.y || 0));
    const start = Math.max(0, Number(cue.startSec));
    const end = Math.min(Number(scene.durationSec), Number(cue.endSec));
    const fontColor = String(cue.fontColor || '#21150f').replace('#', '0x');
    filterChain += `,drawtext=expansion=none:text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=1:bordercolor=0x21150f${fontFileForOverlay({ type: 'body' })}:x=${x}-text_w/2:y=${y}-text_h:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
  }

  let motionOutputLabel = null;
  if (motionCues.length) {
    filterChain += '[motion-base-0]';
    for (let cueIndex = 0; cueIndex < motionCues.length; cueIndex += 1) {
      const cue = motionCues[cueIndex];
      const inputIndex = motionInputIndexes[cueIndex];
      const spriteWidth = Math.max(8, Math.round(Number(cue.spriteWidthPx || 96)));
      const spriteHeight = Math.max(8, Math.round(Number(cue.spriteHeightPx || 96)));
      const start = Math.max(0, Number(cue.startSec));
      const end = Math.min(Number(scene.durationSec), Number(cue.endSec));
      const holdEnd = Math.min(Number(scene.durationSec), Math.max(end, Number(cue.holdEndSec ?? scene.durationSec)));
      const startX = Math.round(Number(cue.startAbsolute.x));
      const startY = Math.round(Number(cue.startAbsolute.y));
      const endX = Math.round(Number(cue.endAbsolute.x));
      const endY = Math.round(Number(cue.endAbsolute.y));
      const progress = `(t-${start.toFixed(3)})/${Math.max(0.001, end - start).toFixed(3)}`;
      const x = `if(lt(t,${start.toFixed(3)}),${startX},if(gt(t,${end.toFixed(3)}),${endX},${startX}+(${endX - startX})*${progress}))`;
      const y = `if(lt(t,${start.toFixed(3)}),${startY},if(gt(t,${end.toFixed(3)}),${endY},${startY}+(${endY - startY})*${progress}))`;
      const previous = `[motion-base-${cueIndex}]`;
      const next = `[motion-base-${cueIndex + 1}]`;
      const visibleFrom = cue.visibleFromSceneStart === true
        ? 0
        : Math.max(0, Number(cue.visibleFromSec ?? start));
      filterChain += `;[${inputIndex}:v]scale=${spriteWidth}:${spriteHeight}:force_original_aspect_ratio=decrease,format=rgba[motion-sprite-${cueIndex}];${previous}[motion-sprite-${cueIndex}]overlay=x='${x}':y='${y}':eval=frame:format=auto:enable='between(t,${visibleFrom.toFixed(3)},${holdEnd.toFixed(3)})'${next}`;
    }
    motionOutputLabel = `motion-base-${motionCues.length}`;
  }

  // Duration trim for image-based inputs
  if (motionOutputLabel) {
    filterChain += `;[${motionOutputLabel}]trim=duration=${scene.durationSec},setpts=PTS-STARTPTS`;
  } else if (scene.background?.image) {
    filterChain += `,trim=duration=${scene.durationSec},setpts=PTS-STARTPTS`;
  }

  filterChain += `[vout]`;

  // Audio input
  const audioArgs = [];
  const audioInputBase = inputArgs.filter((value) => value === '-i').length;
  if (scene.audio?.file && existsSync(scene.audio.file)) {
    audioArgs.push('-i', scene.audio.file);
    if (scene.audio?.ambientFile && existsSync(scene.audio.ambientFile)) {
      audioArgs.push('-stream_loop', '-1', '-i', scene.audio.ambientFile);
      const gain = Number(scene.audio.ambientGain ?? 0.24);
      const fadeOut = Math.max(0.5, Number(scene.audio.ambientFadeOutSec ?? 5.8));
      filterChain += `;[${audioInputBase}:a]atrim=duration=${scene.durationSec},apad=pad_dur=${scene.durationSec},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11:linear=true,asetnsamples=n=1024:p=0,asplit=2[voice_main][voice_sc];[${audioInputBase + 1}:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS,volume=${gain},afade=t=in:st=0:d=0.18,afade=t=out:st=${Math.max(0, Number(scene.durationSec) - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)},aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,asetnsamples=n=1024:p=0[bed];[bed][voice_sc]sidechaincompress=threshold=0.035:ratio=3:attack=60:release=420:makeup=1:link=average[duckedbed];[voice_main][duckedbed]amix=inputs=2:duration=first:dropout_transition=1,alimiter=limit=0.92,asetnsamples=n=1024:p=0[aout]`;
    } else {
      filterChain += `;[${audioInputBase}:a]atrim=duration=${scene.durationSec},apad=pad_dur=${scene.durationSec},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11:linear=true,asetnsamples=n=1024:p=0[aout]`;
    }
  } else if (scene.audio?.ambientFile && existsSync(scene.audio.ambientFile)) {
    audioArgs.push('-stream_loop', '-1', '-i', scene.audio.ambientFile);
    const gain = Number(scene.audio.ambientGain ?? 0.24);
    const fadeOut = Math.max(0.5, Number(scene.audio.ambientFadeOutSec ?? 0.72));
    const premasterFilters = scene.audio?.preMastered
      ? ''
      : `,volume=${gain},afade=t=in:st=0:d=0.18,afade=t=out:st=${Math.max(0, Number(scene.durationSec) - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`;
    const premasterGain = scene.audio?.preMastered && gain !== 1 ? `,volume=${gain}` : '';
    filterChain += `;[${audioInputBase}:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS${premasterGain}${premasterFilters},aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,asetnsamples=n=1024:p=0[aout]`;
  } else {
    // Generate silent audio
    audioArgs.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`);
    filterChain += `;[${audioInputBase}:a]atrim=duration=${scene.durationSec},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[aout]`;
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
    execFileSync(FFMPEG_BIN, ffmpegArgs, { stdio: verbose ? 'inherit' : 'pipe' });
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
const expectedDurationSec = config.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0);

mkdirSync(dirname(finalOutput), { recursive: true });

try {
  const concatInputs = segmentPaths.flatMap((segmentPath) => ['-i', segmentPath]);
  const concatLabels = segmentPaths.map((_, index) => `[${index}:v:0][${index}:a:0]`).join('');
  // Keep enough encoded true-peak headroom for AAC overshoot. A -1.5 dBFS
  // sample limiter was insufficient for some narration/cafe transients after
  // AAC encoding; 0.72 (-2.85 dBFS) keeps the delivered master at or below
  // the canonical -1 dBTP ceiling without flattening scene dynamics.
  const concatFilter = `${concatLabels}concat=n=${segmentPaths.length}:v=1:a=1[vconcat][aconcat];[aconcat]aresample=48000:async=1,asetpts=N/SR/TB,alimiter=limit=0.72:level=0[aout]`;
  execFileSync(FFMPEG_BIN, [
    '-hide_banner', '-loglevel', verbose ? 'info' : 'error', '-y',
    ...concatInputs,
    '-filter_complex', concatFilter,
    '-map', '[vconcat]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
    '-t', expectedDurationSec.toFixed(3),
    '-shortest',
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
} catch {}

console.log(`[render-storyboard] ✓ Complete: ${finalOutput}`);
