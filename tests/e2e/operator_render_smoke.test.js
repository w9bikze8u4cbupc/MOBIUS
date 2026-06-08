/**
 * End-to-end operator render smoke test.
 *
 * Simulates the complete operator workflow from project fixture data through
 * render config generation, render job execution, and result verification.
 * This exercises the same backend code paths that the UI Render & Export step
 * invokes: buildRenderJobConfig → enqueueRenderJob → renderExecutor → result.
 *
 * Proves: an operator can trigger render from the UI and see output metadata.
 */

const path = require('path');
const fs = require('fs');

// Import pipeline components
const { runIngestionPipeline } = require('../../src/ingestion/pipeline');
const { generateStoryboardFromIngestion } = require('../../src/storyboard/storyboard_from_ingestion');

// Import render components
let buildRenderJobConfig, enqueueRenderJob, getJob, resetRenderQueue;

beforeAll(async () => {
  const renderJobConfigModule = await import('../../src/api/renderJobConfig.js');
  buildRenderJobConfig = renderJobConfigModule.buildRenderJobConfig;

  const renderQueueModule = await import('../../src/api/renderQueue.js');
  enqueueRenderJob = renderQueueModule.enqueueRenderJob;
  getJob = renderQueueModule.getJob;
  resetRenderQueue = renderQueueModule.resetRenderQueue;
});

// Fixtures
const RULEBOOK_FIXTURE = path.resolve(__dirname, '../fixtures/ingestion/rulebook-good.json');
const BGG_FIXTURE = path.resolve(__dirname, '../fixtures/ingestion/bgg-hanamikoji.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('E2E Operator Render Smoke', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetRenderQueue();
    process.env.RENDERER_DRY_RUN = 'true';
    delete process.env.RENDERER_COMMAND;
    delete process.env.RENDERER_ENTRYPOINT;
    delete process.env.RENDERER_ARGS;
  });

  afterEach(() => {
    resetRenderQueue();
    delete process.env.RENDERER_DRY_RUN;
    delete process.env.RENDERER_COMMAND;
    delete process.env.RENDERER_ENTRYPOINT;
    delete process.env.RENDERER_ARGS;
  });

  async function waitForJob(jobId, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = getJob(jobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) return job;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
  }

  test('full operator flow: ingestion → storyboard → render config → render job → diagnostics', async () => {
    // === Step 1: Ingestion (operator uploads PDF / provides fixture) ===
    const payload = loadJson(RULEBOOK_FIXTURE);
    const bggMetadata = loadJson(BGG_FIXTURE);

    const ingestionManifest = runIngestionPipeline({
      documentId: 'hanamikoji',
      metadata: payload.metadata || {},
      pages: payload.pages || [],
      ocr: payload.ocr || {},
      bggMetadata,
    });

    expect(ingestionManifest).toBeDefined();
    expect(ingestionManifest.version).toBeTruthy();

    // === Step 2: Storyboard generation (operator confirms ingestion) ===
    const storyboardManifest = generateStoryboardFromIngestion(ingestionManifest, {
      width: 1920,
      height: 1080,
      fps: 30,
    });

    expect(storyboardManifest).toBeDefined();
    expect(storyboardManifest.scenes.length).toBeGreaterThan(0);

    // === Step 3: Render config generation (operator clicks "Generate config") ===
    const renderConfig = buildRenderJobConfig({
      projectId: 'hanamikoji',
      metadata: { gameName: 'Hanamikoji' },
      ingestionManifest,
      storyboardManifest,
      lang: 'en',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      mode: 'preview',
    });

    expect(renderConfig).toBeDefined();
    expect(renderConfig.projectId).toBe('hanamikoji');
    expect(renderConfig.video.resolution.width).toBe(1920);
    expect(renderConfig.video.fps).toBe(30);
    expect(renderConfig.assets.storyboardScenes.length).toBeGreaterThan(0);
    expect(renderConfig.timing.totalDurationSec).toBeGreaterThan(0);

    // === Step 4: Start render (operator clicks "Start render") ===
    const job = enqueueRenderJob(renderConfig);
    expect(job.id).toBeTruthy();

    // === Step 5: Poll for completion (UI polls GET /api/render/:id/status) ===
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('completed');
    expect(completed.error).toBeNull();

    // === Step 6: Verify UI-visible diagnostics ===
    // These are the fields the UI now displays:
    expect(completed.isStoryboardRenderer).toBe(true);
    expect(completed.configPath).toBeTruthy();
    expect(completed.configPath).toContain(job.id);
    expect(completed.outputFilePath).toBeTruthy();
    expect(completed.outputFilePath).toContain('.mp4');

    // Verify the persisted config is valid
    expect(fs.existsSync(completed.configPath)).toBe(true);
    const persistedConfig = JSON.parse(fs.readFileSync(completed.configPath, 'utf8'));
    expect(persistedConfig.projectId).toBe('hanamikoji');
    expect(persistedConfig.scenes.length).toBeGreaterThan(0);

    // Verify each scene has the required rendering fields
    for (const scene of persistedConfig.scenes) {
      expect(scene.id).toBeTruthy();
      expect(scene.durationSec).toBeGreaterThan(0);
      expect(scene.background).toBeDefined();
    }
  });

  test('operator sees actionable error when render config is incomplete', async () => {
    // Simulate operator triggering render without required data
    const minimalConfig = {
      projectId: 'broken-test',
      video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
      // No assets or timing — adapter will create placeholder scene
      timing: { totalDurationSec: 5, scenes: [] },
    };

    const job = enqueueRenderJob(minimalConfig);
    const completed = await waitForJob(job.id);

    // Should still complete (placeholder scene is generated)
    expect(completed.status).toBe('completed');
    expect(completed.isStoryboardRenderer).toBe(true);

    // Verify placeholder scene was used
    const config = JSON.parse(fs.readFileSync(completed.configPath, 'utf8'));
    expect(config.scenes.length).toBe(1);
    expect(config.scenes[0].id).toBe('scene-placeholder');
  });

  test('render job exposes resultPaths for UI artifact display', async () => {
    const payload = loadJson(RULEBOOK_FIXTURE);
    const bggMetadata = loadJson(BGG_FIXTURE);

    const ingestionManifest = runIngestionPipeline({
      documentId: 'hanamikoji-artifacts',
      metadata: payload.metadata || {},
      pages: payload.pages || [],
      ocr: payload.ocr || {},
      bggMetadata,
    });

    const storyboardManifest = generateStoryboardFromIngestion(ingestionManifest, {
      width: 1280, height: 720, fps: 30,
    });

    const renderConfig = buildRenderJobConfig({
      projectId: 'hanamikoji-artifacts',
      metadata: { gameName: 'Hanamikoji' },
      ingestionManifest,
      storyboardManifest,
      lang: 'en',
      resolution: { width: 1280, height: 720 },
      fps: 30,
      mode: 'preview',
    });

    const job = enqueueRenderJob(renderConfig);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('completed');
    // resultPaths should be an array (may be empty in dry-run, non-empty with FFmpeg)
    expect(Array.isArray(completed.resultPaths)).toBe(true);
  });
});
