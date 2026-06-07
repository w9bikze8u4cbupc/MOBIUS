/**
 * Tests for renderExecutor.js storyboard renderer wiring.
 * Verifies that the executor defaults to the real storyboard renderer
 * and correctly adapts configs.
 */

const path = require('path');

// We need to use dynamic import for the ESM module
let buildCommand, adaptConfigForStoryboardRenderer, DEFAULT_STORYBOARD_RENDERER;

beforeAll(async () => {
  const mod = await import('../../src/api/renderExecutor.js');
  buildCommand = mod.buildCommand;
  adaptConfigForStoryboardRenderer = mod.adaptConfigForStoryboardRenderer;
  DEFAULT_STORYBOARD_RENDERER = mod.DEFAULT_STORYBOARD_RENDERER;
});

describe('renderExecutor storyboard wiring', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    delete process.env.RENDERER_COMMAND;
    delete process.env.RENDERER_ENTRYPOINT;
    delete process.env.RENDERER_ARGS;
    delete process.env.RENDERER_DRY_RUN;
  });

  describe('buildCommand', () => {
    test('defaults to storyboard renderer when no RENDERER_COMMAND or RENDERER_ENTRYPOINT', () => {
      delete process.env.RENDERER_COMMAND;
      delete process.env.RENDERER_ENTRYPOINT;

      const result = buildCommand({
        jobId: 'test-job',
        configPath: '/tmp/config.json',
        jobOutputDir: '/tmp/output',
        outputFilePath: '/tmp/output/preview.mp4',
      });

      expect(result.command).toBe('node');
      expect(result.isStoryboardRenderer).toBe(true);
      expect(result.args).toContain(DEFAULT_STORYBOARD_RENDERER);
      expect(result.args).toContain('--config');
      expect(result.args).toContain('/tmp/config.json');
      expect(result.args).toContain('--out');
      expect(result.args).toContain('/tmp/output/preview.mp4');
    });

    test('uses RENDERER_ENTRYPOINT when set', () => {
      process.env.RENDERER_ENTRYPOINT = '/custom/renderer.js';

      const result = buildCommand({
        jobId: 'test-job',
        configPath: '/tmp/config.json',
        jobOutputDir: '/tmp/output',
      });

      expect(result.command).toBe('node');
      expect(result.isStoryboardRenderer).toBe(false);
      expect(result.args).toContain('/custom/renderer.js');
      expect(result.args).toContain('--job-id');
    });

    test('uses RENDERER_COMMAND when set', () => {
      process.env.RENDERER_COMMAND = 'python3';
      process.env.RENDERER_ENTRYPOINT = '/custom/render.py';

      const result = buildCommand({
        jobId: 'test-job',
        configPath: '/tmp/config.json',
        jobOutputDir: '/tmp/output',
      });

      expect(result.command).toBe('python3');
      expect(result.isStoryboardRenderer).toBe(false);
      expect(result.args).toContain('/custom/render.py');
    });

    test('includes --dry-run when RENDERER_DRY_RUN is true', () => {
      delete process.env.RENDERER_COMMAND;
      delete process.env.RENDERER_ENTRYPOINT;
      process.env.RENDERER_DRY_RUN = 'true';

      const result = buildCommand({
        jobId: 'test-job',
        configPath: '/tmp/config.json',
        jobOutputDir: '/tmp/output',
      });

      expect(result.args).toContain('--dry-run');
    });
  });

  describe('adaptConfigForStoryboardRenderer', () => {
    test('adapts a render job config with storyboard scenes', () => {
      const jobConfig = {
        projectId: 'hanamikoji',
        video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
        assets: {
          storyboardScenes: [
            { id: 'scene-intro', durationSec: 5, type: 'intro' },
            { id: 'scene-setup-1', durationSec: 8, type: 'setup_step' },
          ],
        },
        timing: { totalDurationSec: 13, scenes: [] },
      };

      const adapted = adaptConfigForStoryboardRenderer(jobConfig);

      expect(adapted.projectId).toBe('hanamikoji');
      expect(adapted.video.resolution.width).toBe(1920);
      expect(adapted.video.fps).toBe(30);
      expect(adapted.scenes).toHaveLength(2);
      expect(adapted.scenes[0].id).toBe('scene-intro');
      expect(adapted.scenes[0].durationSec).toBe(5);
      expect(adapted.scenes[1].id).toBe('scene-setup-1');
    });

    test('falls back to timing scenes when storyboard scenes are empty', () => {
      const jobConfig = {
        projectId: 'test',
        video: { resolution: { width: 1280, height: 720 }, fps: 30 },
        assets: { storyboardScenes: [] },
        timing: {
          totalDurationSec: 10,
          scenes: [
            { id: 'scene-1', durationSec: 4 },
            { id: 'scene-2', durationSec: 6 },
          ],
        },
      };

      const adapted = adaptConfigForStoryboardRenderer(jobConfig);

      expect(adapted.scenes).toHaveLength(2);
      expect(adapted.scenes[0].id).toBe('scene-1');
      expect(adapted.scenes[1].id).toBe('scene-2');
    });

    test('creates placeholder scene when no scenes are available', () => {
      const jobConfig = {
        projectId: 'empty-game',
        gameName: 'Test Game',
        video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
        timing: { totalDurationSec: 6, scenes: [] },
      };

      const adapted = adaptConfigForStoryboardRenderer(jobConfig);

      expect(adapted.scenes).toHaveLength(1);
      expect(adapted.scenes[0].id).toBe('scene-placeholder');
      expect(adapted.scenes[0].durationSec).toBe(6);
      expect(adapted.scenes[0].overlays[0].text).toBe('Test Game');
    });

    test('preserves output path when provided', () => {
      const jobConfig = {
        projectId: 'test',
        video: { resolution: { width: 1280, height: 720 }, fps: 30 },
        timing: { totalDurationSec: 5, scenes: [{ id: 's1', durationSec: 5 }] },
      };

      const adapted = adaptConfigForStoryboardRenderer(jobConfig, {
        outputPath: '/out/preview.mp4',
      });

      expect(adapted._outputPath).toBe('/out/preview.mp4');
    });
  });
});
