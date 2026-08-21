/**
 * MOBIUS end-to-end orchestrator
 *
 * Runs the deterministic ingestion and storyboard fixtures through the same
 * render-job contract used by the operator flow, produces a real FFmpeg MP4,
 * emits a timed caption sidecar, packages checksummed artifacts, and then
 * validates the resulting release checklist.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { runIngestionPipeline } = require('../src/ingestion/pipeline');
const { generateStoryboardFromIngestion } = require('../src/storyboard/storyboard_from_ingestion');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STORYBOARD_RENDERER = path.join(PROJECT_ROOT, 'scripts', 'render-storyboard-ffmpeg.mjs');

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

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writePhysicalRenderJUnit(junitPath, { projectId, durationSec, captionCount }) {
  const cases = [
    ['renderer_exit', 'FFmpeg storyboard renderer completed successfully'],
    ['video_probe', `MP4 is readable (${Number(durationSec).toFixed(3)}s)`],
    ['captions', `${captionCount} timed caption cue(s) generated`],
    ['packaging', 'Checksummed container manifest generated'],
  ];

  const content = [
    `<testsuite name="mobius-real-render" tests="${cases.length}" failures="0" errors="0" time="0">`,
    ...cases.map(([name, message]) => `  <testcase classname="${xmlEscape(projectId)}" name="${name}"><system-out>${xmlEscape(message)}</system-out></testcase>`),
    '</testsuite>',
    '',
  ].join('\n');
  fs.writeFileSync(junitPath, content, 'utf8');
}

async function loadCanonicalRenderModules() {
  const [
    renderJobConfigModule,
    renderExecutorModule,
    packagingModule,
    captionTimingModule,
    srtWriterModule,
  ] = await Promise.all([
    import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'api', 'renderJobConfig.js')).href),
    import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'api', 'renderExecutor.js')).href),
    import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'api', 'packaging.js')).href),
    import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'services', 'captionTiming.js')).href),
    import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'services', 'srtWriter.js')).href),
  ]);

  return {
    buildRenderJobConfig: renderJobConfigModule.buildRenderJobConfig,
    adaptConfigForStoryboardRenderer: renderExecutorModule.adaptConfigForStoryboardRenderer,
    packageRenderJob: packagingModule.packageRenderJob,
    generateCaptionCues: captionTimingModule.generateCaptionCues,
    validateCaptionCues: captionTimingModule.validateCaptionCues,
    generateSrtContent: srtWriterModule.generateSrtContent,
  };
}

async function buildCanonicalRenderConfig({
  projectId,
  lang,
  resolution,
  mode,
  ingestionManifest,
  storyboardManifest,
}) {
  const { buildRenderJobConfig } = await loadCanonicalRenderModules();
  return buildRenderJobConfig({
    projectId,
    metadata: {
      gameName: storyboardManifest?.game?.name || ingestionManifest?.document?.title || projectId,
      captionLocales: [lang],
    },
    ingestionManifest,
    storyboardManifest,
    lang,
    resolution: parseResolution(resolution),
    fps: storyboardManifest?.resolution?.fps || storyboardManifest?.fps || 30,
    mode,
  });
}

async function renderRealPreview({ game, lang, outputDir, renderConfig }) {
  const {
    adaptConfigForStoryboardRenderer,
    packageRenderJob,
    generateCaptionCues,
    validateCaptionCues,
    generateSrtContent,
  } = await loadCanonicalRenderModules();

  const renderDir = path.join(outputDir, `${renderConfig.video?.mode || 'preview'}-render`);
  ensureDir(renderDir);

  const outputPath = path.join(renderDir, 'preview.mp4');
  const sceneConfig = adaptConfigForStoryboardRenderer(renderConfig, { outputPath });
  const configPath = path.join(renderDir, 'render-config.json');
  fs.writeFileSync(configPath, JSON.stringify(sceneConfig, null, 2), 'utf8');

  const renderer = spawnSync(
    process.execPath,
    [STORYBOARD_RENDERER, '--config', configPath, '--out', outputPath],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 240000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  if (renderer.error) {
    throw new Error(`REAL_RENDER_EXECUTION_ERROR: ${renderer.error.message}`);
  }
  if (renderer.status !== 0) {
    const details = [renderer.stdout, renderer.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`REAL_RENDER_FAILED (exit ${renderer.status}): ${details || 'No renderer diagnostics available'}`);
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 10240) {
    throw new Error('REAL_RENDER_OUTPUT_INVALID: FFmpeg did not produce a non-empty MP4 preview.');
  }

  let probe;
  try {
    probe = JSON.parse(execFileSync('ffprobe', [
      '-hide_banner', '-loglevel', 'error', '-print_format', 'json',
      '-show_format', '-show_streams', outputPath,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 15000,
    }));
  } catch (error) {
    throw new Error(`REAL_RENDER_OUTPUT_UNREADABLE: ${error.message}`);
  }

  const videoStream = (probe.streams || []).find((stream) => stream.codec_type === 'video');
  if (!videoStream || videoStream.codec_name !== 'h264') {
    throw new Error('REAL_RENDER_OUTPUT_INVALID: expected an H.264 video stream.');
  }

  const captionScenes = sceneConfig.scenes.map((scene) => ({
    ...scene,
    narrationText: (scene.overlays || [])
      .map((overlay) => overlay.text)
      .filter(Boolean)
      .join(' '),
  }));
  const captionResult = generateCaptionCues(captionScenes, { language: lang });
  const captionValidation = validateCaptionCues(captionResult.cues);
  if (captionResult.cues.length === 0 || !captionValidation.valid) {
    throw new Error(`REAL_RENDER_CAPTIONS_INVALID: ${captionValidation.warnings.join('; ') || 'no caption cues generated'}`);
  }

  const captionPath = path.join(renderDir, `captions_${lang}.srt`);
  fs.writeFileSync(captionPath, generateSrtContent(captionResult.cues), 'utf8');

  const packagingResult = await packageRenderJob({
    jobId: game,
    outputDir: renderDir,
    jobConfig: renderConfig,
  });

  const durationSec = Number(packagingResult.manifest?.media?.video?.[0]?.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('REAL_RENDER_PACKAGE_INVALID: packaged manifest has no readable video duration.');
  }

  const junitPath = path.join(renderDir, 'golden.junit.xml');
  writePhysicalRenderJUnit(junitPath, {
    projectId: game,
    durationSec,
    captionCount: captionResult.cues.length,
  });

  return {
    containerPath: packagingResult.manifestPath,
    junitPath,
    videoPath: outputPath,
    captionPath,
    configPath,
    rendererOutput: renderer.stdout,
  };
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
    buildCanonicalRenderConfig({
      projectId: game,
      lang,
      resolution,
      mode,
      ingestionManifest,
      storyboardManifest,
    })
  );

  const renderJob = deps.renderJob || ((renderConfig) => renderRealPreview({
    game,
    lang,
    outputDir,
    renderConfig,
  }));

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
    const renderConfig = await buildConfig(ingestionManifest, storyboardManifest);
    fs.writeFileSync(path.join(outputDir, 'render-job-config.json'), JSON.stringify(renderConfig, null, 2), 'utf8');
    summary.steps.push({ name: 'render-config', durationMs: Date.now() - configStart });

    const renderStart = Date.now();
    const artifacts = await renderJob(renderConfig);
    summary.steps.push({ name: 'render', durationMs: Date.now() - renderStart });

    const checklistStart = Date.now();
    const checklistResult = await runChecklistFn(artifacts.containerPath, artifacts.junitPath);
    summary.steps.push({ name: 'checklist', durationMs: Date.now() - checklistStart });

    summary.success = checklistResult.status === 0;
    summary.checklist = {
      exitCode: checklistResult.status,
      stdout: checklistResult.stdout,
      stderr: checklistResult.stderr,
    };
    summary.artifacts = {
      containerPath: artifacts.containerPath,
      junitPath: artifacts.junitPath,
      videoPath: artifacts.videoPath,
      captionPath: artifacts.captionPath,
      configPath: artifacts.configPath,
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
    console.log('E2E PASS (real MP4 rendered and checklist validated)');
    if (summary.artifacts?.videoPath) console.log(`- video: ${summary.artifacts.videoPath}`);
    if (summary.artifacts?.containerPath) console.log(`- manifest: ${summary.artifacts.containerPath}`);
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
  runChecklist,
  renderRealPreview,
};
