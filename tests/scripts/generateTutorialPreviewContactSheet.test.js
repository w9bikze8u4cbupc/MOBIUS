const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../scripts/generate-tutorial-preview-contact-sheet.mjs');

function run(args, opts = {}) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    const output = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000,
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

describe('generate-tutorial-preview-contact-sheet.mjs', () => {
  describe('CLI argument validation', () => {
    test('exits with error when no --video is provided', () => {
      const result = run([]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Usage:');
    });

    test('exits with error when video file does not exist', () => {
      const result = run(['--video', 'nonexistent-video.mp4', '--dry-run']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('dry-run mode', () => {
    let tmpVideo;

    beforeAll(() => {
      // Create a dummy video file for dry-run (content doesn't matter)
      tmpVideo = path.join(os.tmpdir(), 'contact-sheet-test-dummy.mp4');
      fs.writeFileSync(tmpVideo, Buffer.alloc(256, 0xFF));
    });

    afterAll(() => {
      try { fs.unlinkSync(tmpVideo); } catch { /* ignore */ }
    });

    test('dry-run succeeds with a dummy video file', () => {
      const result = run(['--video', tmpVideo, '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DRY RUN]');
      expect(result.stdout).toContain('contact-sheet.jpg');
    });

    test('dry-run shows default 8 frame timestamps', () => {
      const result = run(['--video', tmpVideo, '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('frames: 8');
      expect(result.stdout).toContain('timestamps:');
    });

    test('dry-run respects custom --frames count', () => {
      const result = run(['--video', tmpVideo, '--frames', '4', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('frames: 4');
      // Should show 4 frame entries
      const frameLines = result.stdout.split('\n').filter((l) => l.includes('frame-'));
      expect(frameLines.length).toBe(4);
    });

    test('dry-run respects custom --out-dir', () => {
      const customDir = path.join(os.tmpdir(), 'custom-qa-dir');
      const result = run(['--video', tmpVideo, '--out-dir', customDir, '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(customDir);
    });
  });

  describe('calculateTimestamps logic', () => {
    // We test the exported function indirectly via dry-run output since Jest CJS
    // can't directly import ESM. The dry-run shows computed timestamps.
    let tmpVideo;

    beforeAll(() => {
      tmpVideo = path.join(os.tmpdir(), 'contact-sheet-test-dummy.mp4');
      if (!fs.existsSync(tmpVideo)) {
        fs.writeFileSync(tmpVideo, Buffer.alloc(256, 0xFF));
      }
    });

    test('timestamps avoid frame 0 and end', () => {
      // With 85s duration assumed in dry-run, first frame should be > 0 and last < 85
      const result = run([
        '--video', tmpVideo,
        '--frames', '8',
        '--dry-run',
      ]);
      expect(result.exitCode).toBe(0);
      const tsLine = result.stdout.split('\n').find((l) => l.includes('timestamps:'));
      expect(tsLine).toBeDefined();
      // Parse timestamps
      const tsValues = tsLine.match(/(\d+\.\d+)s/g).map((s) => parseFloat(s));
      expect(tsValues.length).toBe(8);
      // First timestamp should be > 0 (avoids blank frame 0)
      expect(tsValues[0]).toBeGreaterThan(0);
      // Last timestamp should be < 85
      expect(tsValues[tsValues.length - 1]).toBeLessThan(85);
      // Timestamps should be ordered ascending
      for (let i = 1; i < tsValues.length; i++) {
        expect(tsValues[i]).toBeGreaterThan(tsValues[i - 1]);
      }
    });

    test('single frame lands at midpoint', () => {
      const result = run([
        '--video', tmpVideo,
        '--frames', '1',
        '--dry-run',
      ]);
      expect(result.exitCode).toBe(0);
      const tsLine = result.stdout.split('\n').find((l) => l.includes('timestamps:'));
      const tsValues = tsLine.match(/(\d+\.\d+)s/g).map((s) => parseFloat(s));
      expect(tsValues.length).toBe(1);
      // Should be near the center of the 5%-95% range of 85s (~42.5s)
      expect(tsValues[0]).toBeGreaterThan(30);
      expect(tsValues[0]).toBeLessThan(55);
    });
  });
});
