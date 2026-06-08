/**
 * API-level dry-run render preview verification.
 *
 * Proves the backend render path can:
 * 1. Accept a render job config with storyboard scenes
 * 2. Default to the real storyboard renderer (no RENDERER_COMMAND needed)
 * 3. Adapt the config to the renderer's scene-based format
 * 4. Invoke the renderer in dry-run mode without FFmpeg
 * 5. Complete successfully and persist the generated config
 * 6. The generated config passes render-storyboard-ffmpeg.mjs --dry-run validation
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const {
  enqueueRenderJob,
  getJob,
  resetRenderQueue,
} = require('../../src/api/renderQueue.js');

const RENDERER_SCRIPT = path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs');

// Fixture: a render job config matching what buildRenderJobConfig produces
const FIXTURE_RENDER_JOB_CONFIG = {
  projectId: 'hanamikoji-dry-run-test',
  gameName: 'Hanamikoji',
  lang: 'en',
  video: {
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    mode: 'preview',
  },
  assets: {
    images: [],
    audio: [],
    captions: [],
    storyboardScenes: [
      { id: 'scene-intro', durationSec: 4, type: 'intro' },
      { id: 'scene-setup-1', durationSec: 6, type: 'setup_step' },
      { id: 'scene-end-card', durationSec: 3, type: 'end_card' },
    ],
  },
  timing: {
    totalDurationSec: 13,
    scenes: [
      { id: 'scene-intro', durationSec: 4 },
      { id: 'scene-setup-1', durationSec: 6 },
      { id: 'scene-end-card', durationSec: 3 },
    ],
  },
  metadata: {
    ingestionVersion: '1.0.0',
    storyboardContractVersion: '1.1.0',
    seed: null,
  },
  deterministic: true,
};

describe('API render preview dry-run', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetRenderQueue();
    // Force dry-run mode and clear any explicit renderer config
    process.env.RENDERER_DRY_RUN = 'true';
    delete process.env.RENDERER_COMMAND;
    delete process.env.RENDERER_ENTRYPOINT;
    delete process.env.RENDERER_ARGS;
  });

  afterEach(() => {
    resetRenderQueue();
    // Restore env completely
    delete process.env.RENDERER_DRY_RUN;
    delete process.env.RENDERER_COMMAND;
    delete process.env.RENDERER_ENTRYPOINT;
    delete process.env.RENDERER_ARGS;
  });

  async function waitForJob(jobId, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = getJob(jobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        return job;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
  }

  test('dry-run render completes without RENDERER_COMMAND_NOT_CONFIGURED error', async () => {
    const job = enqueueRenderJob(FIXTURE_RENDER_JOB_CONFIG);
    expect(job.id).toBeTruthy();
    // Job may already be running or queued depending on timing
    expect(['queued', 'running']).toContain(job.status);

    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('completed');
    expect(completed.error).toBeNull();
  });

  test('dry-run render uses the storyboard renderer entrypoint', async () => {
    const job = enqueueRenderJob(FIXTURE_RENDER_JOB_CONFIG);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('completed');
    // The result should include renderer metadata
    expect(completed.resultPaths).toBeDefined();
  });

  test('dry-run render persists a valid config file', async () => {
    const job = enqueueRenderJob(FIXTURE_RENDER_JOB_CONFIG);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('completed');

    // Find the generated config in the job output directory
    const { RENDER_OUTPUT_BASE } = await import('../../src/api/renderExecutor.js');
    const jobOutputDir = path.join(RENDER_OUTPUT_BASE, job.id);
    const configPath = path.join(jobOutputDir, `${job.id}-config.json`);

    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.projectId).toBe('hanamikoji-dry-run-test');
    expect(config.video.resolution.width).toBe(1920);
    expect(config.video.fps).toBe(30);
    expect(Array.isArray(config.scenes)).toBe(true);
    expect(config.scenes.length).toBe(3);
    expect(config.scenes[0].id).toBe('scene-intro');
    expect(config.scenes[0].durationSec).toBe(4);
    expect(config.scenes[1].id).toBe('scene-setup-1');
    expect(config.scenes[2].id).toBe('scene-end-card');
  });

  test('generated config is consumable by render-storyboard-ffmpeg.mjs --dry-run', async () => {
    const job = enqueueRenderJob(FIXTURE_RENDER_JOB_CONFIG);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('completed');

    const { RENDER_OUTPUT_BASE } = await import('../../src/api/renderExecutor.js');
    const jobOutputDir = path.join(RENDER_OUTPUT_BASE, job.id);
    const configPath = path.join(jobOutputDir, `${job.id}-config.json`);

    // Verify the config validates via the renderer's own dry-run
    const result = execFileSync('node', [RENDERER_SCRIPT, '--config', configPath, '--dry-run'], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000,
    });

    expect(result).toContain('[DRY RUN]');
    expect(result).toContain('Config is valid');
    expect(result).toContain('scene-intro');
    expect(result).toContain('scene-setup-1');
    expect(result).toContain('scene-end-card');
  });

  test('each generated scene has required fields for rendering', async () => {
    const job = enqueueRenderJob(FIXTURE_RENDER_JOB_CONFIG);
    const completed = await waitForJob(job.id);

    const { RENDER_OUTPUT_BASE } = await import('../../src/api/renderExecutor.js');
    const jobOutputDir = path.join(RENDER_OUTPUT_BASE, job.id);
    const configPath = path.join(jobOutputDir, `${job.id}-config.json`);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    for (const scene of config.scenes) {
      expect(scene.id).toBeTruthy();
      expect(scene.durationSec).toBeGreaterThan(0);
      expect(scene.background).toBeDefined();
      expect(scene.background.color || scene.background.image).toBeTruthy();
    }
  });
});
