#!/usr/bin/env node

/**
 * generate-tutorial-preview.js — First visible tutorial video vertical slice.
 *
 * Generates a complete tutorial preview pipeline from fixture data:
 *   fixture → script → storyboard → captions/SRT → render config
 *
 * Usage:
 *   node scripts/generate-tutorial-preview.js
 *   node scripts/generate-tutorial-preview.js --fixture tests/fixtures/tutorial-vertical-slice/gem-collectors.json
 *   node scripts/generate-tutorial-preview.js --out out/tutorial-preview
 *   node scripts/generate-tutorial-preview.js --render  (attempts FFmpeg render if available)
 */

const fs = require('fs');
const path = require('path');
const { generateTutorialScript } = require('../src/services/tutorialScriptGenerator');
const { generateStoryboardFromIngestion } = require('../src/storyboard/storyboard_from_ingestion');
const { generateSrtContent, getSrtMetadata } = require('../src/services/srtWriter');
const { generateCaptionCues } = require('../src/services/captionTiming');

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
const renderConfig = {
  projectId: fixture.gameId,
  video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
  scenes: segments.map((seg) => ({
    id: seg.id,
    durationSec: seg.durationSec,
    background: { color: seg.type === 'hook' || seg.type === 'end_card' ? '#1a1a2e' : '#2d2d44' },
    overlays: [
      { type: seg.type === 'hook' || seg.type === 'end_card' ? 'title' : 'body', text: seg.narration, position: 'center' }
    ]
  }))
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
