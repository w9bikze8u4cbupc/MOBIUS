#!/usr/bin/env node

/**
 * generate-tutorial-preview.mjs — First visible tutorial video vertical slice.
 *
 * Generates a complete tutorial preview pipeline from fixture data:
 *   fixture → script → storyboard → captions/SRT → render config
 *
 * Usage:
 *   node scripts/generate-tutorial-preview.mjs
 *   node scripts/generate-tutorial-preview.mjs --fixture tests/fixtures/tutorial-vertical-slice/gem-collectors.json
 *   node scripts/generate-tutorial-preview.mjs --out out/tutorial-preview
 *   node scripts/generate-tutorial-preview.mjs --render  (attempts FFmpeg render if available)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// CJS modules (src/storyboard/ is CommonJS)
const { generateTutorialScript } = require('../src/services/tutorialScriptGenerator.cjs');
const { generateStoryboardFromIngestion } = require('../src/storyboard/storyboard_from_ingestion');

// ESM modules (src/services/ is ESM)
import { generateSrtContent, getSrtMetadata } from '../src/services/srtWriter.js';
import { generateCaptionCues } from '../src/services/captionTiming.js';

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

const fixturePath = getArg('fixture') || path.join(__dirname, '../tests/fixtures/tutorial-vertical-slice/gem-collectors.json');
const outDir = getArg('out') || path.join(__dirname, '../out/tutorial-preview');
const doRender = hasFlag('render');

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------
if (!fs.existsSync(fixturePath)) {
  console.error(`Fixture not found: ${fixturePath}`);
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
console.log(`[1/6] Loaded fixture: ${fixture.gameName} (${fixture.gameId})`);

// ---------------------------------------------------------------------------
// Generate tutorial script
// ---------------------------------------------------------------------------
const { segments, warnings, metadata: scriptMeta } = generateTutorialScript(fixture);
console.log(`[2/6] Generated script: ${segments.length} segments, ${scriptMeta.totalDurationSec}s total`);
if (warnings.length) {
  console.log(`  Warnings: ${warnings.join('; ')}`);
}

// ---------------------------------------------------------------------------
// Convert to storyboard
// ---------------------------------------------------------------------------
const ingestionForStoryboard = {
  game: { slug: fixture.gameId, name: fixture.gameName },
  structure: {
    setupSteps: segments.map((seg, i) => ({
      id: seg.id,
      order: i,
      text: seg.narration,
      componentRefs: []
    }))
  }
};

const storyboard = generateStoryboardFromIngestion(ingestionForStoryboard, {
  width: 1920,
  height: 1080,
  fps: 30
});
console.log(`[3/6] Generated storyboard: ${storyboard.scenes.length} scenes`);

// ---------------------------------------------------------------------------
// Generate captions
// ---------------------------------------------------------------------------
const scenesWithNarration = storyboard.scenes.map((scene, i) => ({
  ...scene,
  narration: segments[i] ? segments[i].narration : ''
}));

const { cues, warnings: captionWarnings } = generateCaptionCues(scenesWithNarration, { language: 'en' });
const srtContent = generateSrtContent(cues);
const srtMeta = getSrtMetadata(cues);
console.log(`[4/6] Generated captions: ${srtMeta.cueCount} cues, ${Math.round(srtMeta.totalDurationMs / 1000)}s`);

// ---------------------------------------------------------------------------
// Generate render config
// ---------------------------------------------------------------------------

// Cookbook-style visual palette
const COOKBOOK_PALETTE = {
  hook:           { bg: '#0f172a', accent: '#38bdf8' },  // Deep navy + sky blue accent
  game_identity:  { bg: '#1e1b4b', accent: '#a78bfa' },  // Indigo + violet accent
  objective:      { bg: '#162044', accent: '#60a5fa' },  // Dark blue + blue accent
  components:     { bg: '#1a2332', accent: '#34d399' },  // Dark teal + emerald accent
  setup:          { bg: '#1c2333', accent: '#fbbf24' },  // Dark slate + amber accent
  turn_structure: { bg: '#1e2a3a', accent: '#fb923c' },  // Dark blue-gray + orange accent
  core_mechanic:  { bg: '#1a1f3a', accent: '#f472b6' },  // Dark purple + pink accent
  scoring:        { bg: '#1e293b', accent: '#a3e635' },  // Slate + lime accent
  edge_cases:     { bg: '#27272a', accent: '#fca5a5' },  // Zinc + red accent
  recap:          { bg: '#1e1b4b', accent: '#c4b5fd' },  // Indigo + light violet
  end_card:       { bg: '#0f172a', accent: '#38bdf8' },  // Matches hook (bookend)
};

const DEFAULT_PALETTE = { bg: '#1e293b', accent: '#94a3b8' };

function getStepLabel(seg, index, totalSegments) {
  // Cookbook-style: number content steps, skip hook/end_card
  if (seg.type === 'hook') return 'WELCOME';
  if (seg.type === 'end_card') return 'READY TO PLAY';
  if (seg.type === 'recap') return 'RECAP';
  if (seg.type === 'game_identity') return 'THE GAME';
  // Number the instructional steps
  const contentTypes = ['objective', 'components', 'setup', 'turn_structure', 'core_mechanic', 'scoring', 'edge_cases'];
  const contentIndex = contentTypes.indexOf(seg.type);
  if (contentIndex >= 0) return `STEP ${contentIndex + 1}`;
  return `STEP ${index}`;
}

function getTypeHeading(seg) {
  const headings = {
    hook: '',
    game_identity: 'About the Game',
    objective: 'Your Objective',
    components: 'Components',
    setup: 'Setting Up',
    turn_structure: 'Turn Structure',
    core_mechanic: 'Core Mechanic',
    scoring: 'Scoring',
    edge_cases: 'Special Rules',
    recap: 'Quick Recap',
    end_card: '',
  };
  return headings[seg.type] || seg.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const renderConfig = {
  projectId: fixture.gameId,
  video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
  scenes: segments.map((seg, idx) => {
    const palette = COOKBOOK_PALETTE[seg.type] || DEFAULT_PALETTE;
    const stepLabel = getStepLabel(seg, idx, segments.length);
    const heading = getTypeHeading(seg);
    const isBookend = seg.type === 'hook' || seg.type === 'end_card';

    const overlays = [];

    // Step badge / label (top-left for content, centered for bookends)
    if (isBookend) {
      // Bookend: game title large centered
      overlays.push({
        type: 'title',
        text: fixture.gameName,
        position: 'center',
        fontColor: palette.accent,
      });
      // Subtitle below
      overlays.push({
        type: 'body',
        text: seg.narration,
        position: 'bottom',
        fontColor: 'white',
      });
    } else {
      // Step label badge (top-left)
      overlays.push({
        type: 'badge',
        text: stepLabel,
        position: 'top',
        fontColor: palette.accent,
      });
      // Section heading (upper area)
      if (heading) {
        overlays.push({
          type: 'heading',
          text: heading,
          position: 'upper',
          fontColor: 'white',
        });
      }
      // Body narration (center-lower)
      overlays.push({
        type: 'body',
        text: seg.narration,
        position: 'center',
        fontColor: 'white',
      });
    }

    return {
      id: seg.id,
      durationSec: seg.durationSec,
      background: { color: palette.bg },
      overlays,
    };
  })
};
console.log(`[5/6] Generated render config: ${renderConfig.scenes.length} scenes`);

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });

const outputs = {
  script: path.join(outDir, 'script.json'),
  storyboard: path.join(outDir, 'storyboard.json'),
  captions: path.join(outDir, 'captions.srt'),
  renderConfig: path.join(outDir, 'render-config.json'),
  manifest: path.join(outDir, 'manifest.json')
};

fs.writeFileSync(outputs.script, JSON.stringify({ segments, warnings, metadata: scriptMeta }, null, 2));
fs.writeFileSync(outputs.storyboard, JSON.stringify(storyboard, null, 2));
fs.writeFileSync(outputs.captions, srtContent);
fs.writeFileSync(outputs.renderConfig, JSON.stringify(renderConfig, null, 2));

const manifest = {
  generatedAt: new Date().toISOString(),
  fixture: path.basename(fixturePath),
  game: { id: fixture.gameId, name: fixture.gameName },
  script: { segments: segments.length, totalDurationSec: scriptMeta.totalDurationSec, eliteS1Valid: scriptMeta.eliteS1Valid },
  storyboard: { scenes: storyboard.scenes.length },
  captions: { cues: srtMeta.cueCount, totalDurationMs: srtMeta.totalDurationMs },
  render: { scenes: renderConfig.scenes.length, mode: doRender ? 'render' : 'dry-run' },
  outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, path.relative(process.cwd(), v)])),
  warnings
};

fs.writeFileSync(outputs.manifest, JSON.stringify(manifest, null, 2));

console.log(`[6/6] Wrote artifacts to ${outDir}/`);
console.log(`  - script.json (${segments.length} segments)`);
console.log(`  - storyboard.json (${storyboard.scenes.length} scenes)`);
console.log(`  - captions.srt (${srtMeta.cueCount} cues)`);
console.log(`  - render-config.json (ready for render-storyboard-ffmpeg.mjs)`);
console.log(`  - manifest.json (pipeline summary)`);

if (doRender) {
  console.log('\n[RENDER] Attempting FFmpeg render...');
  console.log(`  Run: node scripts/render-storyboard-ffmpeg.mjs --config ${outputs.renderConfig} --out out/tutorial-preview/preview.mp4`);
  try {
    const { execFileSync } = require('child_process');
    execFileSync('node', [
      path.join(__dirname, 'render-storyboard-ffmpeg.mjs'),
      '--config', outputs.renderConfig,
      '--out', path.join(outDir, 'preview.mp4')
    ], { stdio: 'inherit' });
  } catch (err) {
    console.warn('[RENDER] FFmpeg render skipped or failed. Artifacts are still valid for manual render.');
  }
} else {
  console.log('\n[DRY RUN] Render skipped. Use --render to attempt FFmpeg output.');
  console.log(`  Manual: node scripts/render-storyboard-ffmpeg.mjs --config ${path.relative(process.cwd(), outputs.renderConfig)} --out out/tutorial-preview/preview.mp4`);
}

console.log('\n✓ Tutorial vertical slice complete.');
