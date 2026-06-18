const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../scripts/validate-tutorial-preview-visual-qa.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'visual-qa-validate-'));
}

function runValidator(dir, extraArgs = []) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    const output = execFileSync('node', [VALIDATOR_SCRIPT, '--dir', dir, ...extraArgs], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000,
    });
    result.stdout = output;
  } catch (err) {
    result.stdout = err.stdout || '';
    result.stderr = err.stderr || '';
    result.exitCode = err.status || 1;
  }
  return result;
}

function createValidVisualQa(dir) {
  const framesDir = path.join(dir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  // Create 8 frame files
  for (let i = 1; i <= 8; i++) {
    fs.writeFileSync(path.join(framesDir, `frame-${String(i).padStart(2, '0')}.jpg`), Buffer.alloc(1024, 0xFF));
  }

  // Contact sheet
  fs.writeFileSync(path.join(dir, 'contact-sheet.jpg'), Buffer.alloc(2048, 0xFF));

  // Manifest
  const manifest = {
    generatedAt: '2026-06-18T20:35:32.525Z',
    sourceVideo: 'out/tutorial-preview/preview.mp4',
    videoDuration: 85.022982,
    frameCount: 8,
    timestamps: [4.25, 15.18, 26.11, 37.05, 47.98, 58.91, 69.84, 80.77],
    frames: Array.from({ length: 8 }, (_, i) => ({
      name: `frame-${String(i + 1).padStart(2, '0')}.jpg`,
      timestamp: [4.25, 15.18, 26.11, 37.05, 47.98, 58.91, 69.84, 80.77][i],
    })),
    contactSheet: 'contact-sheet.jpg',
    grid: { cols: 4, rows: 2 },
    ffmpegVersion: 'n7.1.4-39-ga5faeca88f-20260615 Copyright (c) 2000-2026 the FFmpeg developers',
  };
  fs.writeFileSync(path.join(dir, 'visual-qa-manifest.json'), JSON.stringify(manifest, null, 2));
}

function cleanDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('validate-tutorial-preview-visual-qa.mjs', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('passes with valid visual QA output', () => {
    test('exits 0 with all checks passed message', () => {
      createValidVisualQa(tmpDir);
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ALL CHECKS PASSED');
    });
  });

  describe('fails on missing contact-sheet.jpg', () => {
    test('exits 1 when contact-sheet.jpg is missing', () => {
      createValidVisualQa(tmpDir);
      fs.unlinkSync(path.join(tmpDir, 'contact-sheet.jpg'));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('contact-sheet.jpg');
    });
  });

  describe('fails on zero-byte contact sheet', () => {
    test('exits 1 when contact-sheet.jpg is empty', () => {
      createValidVisualQa(tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'contact-sheet.jpg'), '');
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('empty');
      expect(result.stderr).toContain('contact-sheet.jpg');
    });
  });

  describe('fails on missing frame', () => {
    test('exits 1 when frame-04.jpg is missing', () => {
      createValidVisualQa(tmpDir);
      fs.unlinkSync(path.join(tmpDir, 'frames', 'frame-04.jpg'));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('frame-04.jpg');
    });
  });

  describe('fails on zero-byte frame', () => {
    test('exits 1 when a frame file is empty', () => {
      createValidVisualQa(tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'frames', 'frame-02.jpg'), '');
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('empty');
      expect(result.stderr).toContain('frame-02.jpg');
    });
  });

  describe('fails on malformed manifest', () => {
    test('exits 1 when manifest is not valid JSON', () => {
      createValidVisualQa(tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), 'not json');
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid JSON');
    });
  });

  describe('fails on wrong frame count', () => {
    test('exits 1 when manifest frameCount does not match expected', () => {
      createValidVisualQa(tmpDir);
      const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), 'utf8'));
      manifest.frameCount = 4;
      fs.writeFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), JSON.stringify(manifest));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('frameCount');
    });
  });

  describe('fails on non-increasing timestamps', () => {
    test('exits 1 when timestamps are not strictly increasing', () => {
      createValidVisualQa(tmpDir);
      const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), 'utf8'));
      manifest.timestamps = [4.25, 15.18, 10.0, 37.05, 47.98, 58.91, 69.84, 80.77];
      fs.writeFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), JSON.stringify(manifest));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('increasing');
    });
  });

  describe('fails on invalid grid layout', () => {
    test('exits 1 when grid cols/rows do not match expected', () => {
      createValidVisualQa(tmpDir);
      const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), 'utf8'));
      manifest.grid = { cols: 2, rows: 4 };
      fs.writeFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), JSON.stringify(manifest));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('grid.cols');
    });
  });

  describe('fails on missing FFmpeg metadata', () => {
    test('exits 1 when ffmpegVersion is absent', () => {
      createValidVisualQa(tmpDir);
      const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), 'utf8'));
      delete manifest.ffmpegVersion;
      fs.writeFileSync(path.join(tmpDir, 'visual-qa-manifest.json'), JSON.stringify(manifest));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('ffmpegVersion');
    });
  });
});
