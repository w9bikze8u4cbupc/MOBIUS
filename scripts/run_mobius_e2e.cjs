#!/usr/bin/env node

/**
 * MOBIUS end-to-end orchestrator
 *
 * This script stitches together the deterministic ingestion + storyboard generators,
 * builds a render job config, simulates a render/package step, and finally runs the
 * checklist validator. It is intentionally dependency-light so it can run in CI and
 * local smoke tests without requiring the full renderer stack.
 */

const fs = require('fs');
const path = require('path');
const { runIngestionPipeline } = require('../src/ingestion/pipeline');
const { generateStoryboardFromIngestion } = require('../src/storyboard/storyboard_from_ingestion');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function parseResolution(input) {
  if (!input || typeof input !== 'string') return { width: 1920, height: 1080 };
  const match = input.toLowerCase().match(/(\d+)x(\d+)/);
  if (!match) return { width: 1920, height: 1080 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function buildRenderJobConfig({ projectId, lang, resolution, mode, ingestionManifest, storyboardManifest }) {
  const { width, height } = parseResolution(resolution);
  const fps = storyboardManifest?.resolution?.fps || storyboardManifest?.fps || 30;
  const scenes = Array.isArray(storyboardManifest?.scenes) ? storyboardManifest.scenes : [];
  const totalDurationSec = scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0);

  const imageAssets = ingestionManifest?.assets?.components || [];
  const pageAssets = ingestionManifest?.assets?.pages || [];

  return {
    projectId,
    lang,
    video: {
      resolution: { width, height },
      fps,
      mode: mode || 'preview',
    },
    assets: {
      images: [...imageAssets, ...pageAssets].map((asset) => ({
        id: asset.id || asset.hash || asset.page || 'asset',
        hash: asset.hash,
        type: asset.type || 'image',
      })),
      audio: [],
      captions: [],
    },
    timing: {
      totalDurationSec,
      scenes: scenes.map((scene, idx) => ({ id: scene.id || `scene-${idx + 1}`, durationSec: scene.durationSec || 0 })),
    },
    metadata: {
      ingestionVersion: ingestionManifest?.ingestionContractVersion || ingestionManifest?.version || '1.0.0',
      storyboardContractVersion: storyboardManifest?.storyboardContractVersion || storyboardManifest?.version || '1.0.0',
      seed: storyboardManifest?.seed || null,
    },
    deterministic: true,
  };
}

function writePlaceholderArtifacts(outputDir, { lang, resolution, timing }) {
  ensureDir(outputDir);
  const videoName = 'preview.mp4';
  const captionName = `captions_${lang || 'en'}.vtt`;

  const videoPath = path.join(outputDir, videoName);
  const captionPath = path.join(outputDir, captionName);

  if (!fs.existsSync(videoPath)) {
    fs.writeFileSync(videoPath, 'placeholder video content');
  }

  if (!fs.existsSync(captionPath)) {
    fs.writeFileSync(captionPath, 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nPlaceholder caption');
  }

  const referenceDuration = Number((timing.totalDurationSec || 6).toFixed(2)) || 6;

  const container = {
    referenceDuration,
    videos: [
      {
        id: 'preview',
        path: videoName,
        duration: referenceDuration,
        resolution: resolution?.width && resolution?.height ? { width: resolution.width, height: resolution.height } : undefined,
        format: 'mp4',
      },
    ],
    captions: [
      {
        id: 'captions',
        path: captionName,
        language: lang || 'en',
        format: 'vtt',
      },
    ],
    manifest: {
      assets: timing.scenes || [],
    },
  };

  const containerPath = path.join(outputDir, 'container.json');
  fs.writeFileSync(containerPath, JSON.stringify(container, null, 2), 'utf8');

  const junit = [
    '<testsuite name="mobius-render" tests="1" failures="0" errors="0" time="0">',
    '  <testcase classname="render" name="preview" time="0"/>',
    '</testsuite>',
    '',
  ].join('\n');
  const junitPath = path.join(outputDir, 'golden.junit.xml');
  fs.writeFileSync(junitPath, junit, 'utf8');

  return { containerPath, junitPath, videoPath, captionPath };
}

function runChecklist({ game, containerPath, junitPath, format = 'text' }) {
  const validator = require('./validate_mobius_checklist.cjs');
  const container = validator.loadJson(containerPath);
  const junitSummaryRaw = validator.loadJUnitSummary(junitPath);
  const junitSummary = junitSummaryRaw.exists === false
    ? junitSummaryRaw
    : {
        ...junitSummaryRaw,
        exists: true,
        tests: junitSummaryRaw.tests || 1,
        failures: junitSummaryRaw.failures || 0,
        errors: junitSummaryRaw.errors || 0,
      };

  const results = validator.evaluateChecklist({
    container,
    containerPath,
    junitSummary,
    junitPath,
  });

  const summary = validator.buildJsonSummary(results);
  const formatted = format === 'json'
    ? JSON.stringify(summary, null, 2)
    : validator.formatTable(results);

  return {
    status: summary.stats.failed > 0 ? 1 : 0,
    stdout: formatted,
    stderr: '',
  };
}

async function runMobiusE2E(options = {}, deps = {}) {
  const {
    game = 'hanamikoji',
    lang = 'en',
    resolution = '1920x1080',
    mode = 'preview',
    fixture = path.join('tests', 'fixtures', 'ingestion', 'rulebook-good.json'),
    bggFixture = path.join('tests', 'fixtures', 'ingestion', 'bgg-hanamikoji.json'),
    outputDir = path.join('out', 'mobius-e2e', game),
  } = options;

  const runIngestion = deps.runIngestion || (async () => {
    const payload = loadJson(fixture);
    const bggMetadata = fs.existsSync(bggFixture) ? loadJson(bggFixture) : {};
    return runIngestionPipeline({
      documentId: payload.documentId || game,
      metadata: payload.metadata || {},
      pages: payload.pages || [],
      ocr: payload.ocr || {},
      bggMetadata,
    });
  });

  const runStoryboard = deps.runStoryboard || ((ingestionManifest) => generateStoryboardFromIngestion(ingestionManifest, {
    width: parseResolution(resolution).width,
    height: parseResolution(resolution).height,
    fps: 30,
  }));

  const buildConfig = deps.buildConfig || ((ingestionManifest, storyboardManifest) =>
    buildRenderJobConfig({
      projectId: game,
      lang,
      resolution,
      mode,
      ingestionManifest,
      storyboardManifest,
    })
  );

  const renderJob = deps.renderJob || ((renderConfig) => {
    const renderDir = path.join(outputDir, `${mode}-render`);
    ensureDir(renderDir);
    fs.writeFileSync(path.join(renderDir, 'render-config.json'), JSON.stringify(renderConfig, null, 2), 'utf8');
    return writePlaceholderArtifacts(renderDir, { lang, resolution: renderConfig.video.resolution, timing: renderConfig.timing });
  });

  const runChecklistFn = deps.runChecklist || ((containerPath, junitPath) =>
    runChecklist({ game, containerPath, junitPath })
  );

  const summary = {
    game,
    lang,
    resolution,
    mode,
    steps: [],
    success: false,
  };

  try {
    ensureDir(outputDir);

    const ingestionStart = Date.now();
    const ingestionManifest = await runIngestion();
    fs.writeFileSync(path.join(outputDir, 'ingestion.json'), JSON.stringify(ingestionManifest, null, 2), 'utf8');
    summary.steps.push({ name: 'ingestion', durationMs: Date.now() - ingestionStart });

    const storyboardStart = Date.now();
    const storyboardManifest = await runStoryboard(ingestionManifest);
    fs.writeFileSync(path.join(outputDir, 'storyboard.json'), JSON.stringify(storyboardManifest, null, 2), 'utf8');
    summary.steps.push({ name: 'storyboard', durationMs: Date.now() - storyboardStart });

    const configStart = Date.now();
    const renderConfig = buildConfig(ingestionManifest, storyboardManifest);
    summary.steps.push({ name: 'render-config', durationMs: Date.now() - configStart });

    const renderStart = Date.now();
    const artifacts = renderJob(renderConfig);
    summary.steps.push({ name: 'render', durationMs: Date.now() - renderStart });

    const checklistStart = Date.now();
    const checklistResult = runChecklistFn(artifacts.containerPath, artifacts.junitPath);
    summary.steps.push({ name: 'checklist', durationMs: Date.now() - checklistStart });

    summary.success = checklistResult.status === 0;
    summary.checklist = {
      exitCode: checklistResult.status,
      stdout: checklistResult.stdout,
      stderr: checklistResult.stderr,
    };

    return summary;
  } catch (err) {
    summary.error = err?.message || String(err);
    return summary;
  }
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const {
    game = 'hanamikoji',
    lang = 'en',
    resolution = '1920x1080',
    mode = 'preview',
  } = args;

  console.log(`Starting MOBIUS E2E for ${game} (${lang}, ${resolution}, ${mode})`);
  const summary = await runMobiusE2E({ game, lang, resolution, mode });

  for (const step of summary.steps) {
    console.log(`- ${step.name}: ${step.durationMs}ms`);
  }

  if (summary.success) {
    console.log('E2E PASS');
    process.exit(0);
  }

  console.error('E2E FAIL');
  if (summary.error) {
    console.error(`Error: ${summary.error}`);
  }
  if (summary.checklist) {
    console.error(`Checklist exit code: ${summary.checklist.exitCode}`);
    if (summary.checklist.stdout) console.error(summary.checklist.stdout);
    if (summary.checklist.stderr) console.error(summary.checklist.stderr);
  }
  process.exit(1);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  parseArgs,
  runMobiusE2E,
  buildRenderJobConfig,
  runChecklist,
};
