const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const RENDERER_SCRIPT = path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs');
const VALID_FIXTURE = path.resolve(__dirname, '../fixtures/render/two-scene-config.json');

function runRenderer(args, opts = {}) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    const output = execFileSync('node', [RENDERER_SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000,
      ...opts,
    });
    result.stdout = output;
  } catch (err) {
    result.stdout = err.stdout || '';
    result.stderr = err.stderr || '';
    result.exitCode = err.status || 1;
  }
  return result;
}

describe('render-storyboard-ffmpeg.mjs', () => {
  describe('Config Validation', () => {
    test('exits with error when no --config is provided', () => {
      const result = runRenderer([]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Usage:');
    });

    test('exits with error when config file does not exist', () => {
      const result = runRenderer(['--config', 'nonexistent.json', '--dry-run']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('not found');
    });

    test('exits with error for config missing projectId', () => {
      const badConfig = path.resolve(__dirname, '../fixtures/render/tmp-bad-config.json');
      fs.writeFileSync(badConfig, JSON.stringify({
        video: { resolution: { width: 1280, height: 720 }, fps: 30 },
        scenes: [{ id: 's1', durationSec: 2, background: { color: '#000' } }]
      }));
      try {
        const result = runRenderer(['--config', badConfig, '--dry-run']);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('projectId');
      } finally {
        fs.unlinkSync(badConfig);
      }
    });

    test('exits with error for scene with zero duration', () => {
      const badConfig = path.resolve(__dirname, '../fixtures/render/tmp-bad-duration.json');
      fs.writeFileSync(badConfig, JSON.stringify({
        projectId: 'test',
        video: { resolution: { width: 1280, height: 720 }, fps: 30 },
        scenes: [{ id: 's1', durationSec: 0, background: { color: '#000' } }]
      }));
      try {
        const result = runRenderer(['--config', badConfig, '--dry-run']);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('durationSec');
      } finally {
        fs.unlinkSync(badConfig);
      }
    });

    test('exits with error for scene missing background', () => {
      const badConfig = path.resolve(__dirname, '../fixtures/render/tmp-no-bg.json');
      fs.writeFileSync(badConfig, JSON.stringify({
        projectId: 'test',
        video: { resolution: { width: 1280, height: 720 }, fps: 30 },
        scenes: [{ id: 's1', durationSec: 2 }]
      }));
      try {
        const result = runRenderer(['--config', badConfig, '--dry-run']);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('background');
      } finally {
        fs.unlinkSync(badConfig);
      }
    });
  });

  describe('Dry Run', () => {
    test('dry-run validates config and prints planned stages', () => {
      const result = runRenderer(['--config', VALID_FIXTURE, '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DRY RUN]');
      expect(result.stdout).toContain('scene-intro');
      expect(result.stdout).toContain('scene-setup');
      expect(result.stdout).toContain('Config is valid');
    });

    test('dry-run shows correct scene count', () => {
      const result = runRenderer(['--config', VALID_FIXTURE, '--dry-run']);
      expect(result.stdout).toContain('Scene 1/2');
      expect(result.stdout).toContain('Scene 2/2');
    });
  });
});
