const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../scripts/validate-tutorial-preview-frame-fingerprints.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frame-fingerprints-validate-'));
}

function runValidator(dir, baselinePath) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    const output = execFileSync('node', [VALIDATOR_SCRIPT, '--dir', dir, '--baseline', baselinePath], {
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

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function createValidArtifact(dir) {
  const framesDir = path.join(dir, 'visual-qa', 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const images = [];
  const timestamps = [];

  // Contact sheet
  const csData = Buffer.from('contact-sheet-content-for-test');
  fs.writeFileSync(path.join(dir, 'visual-qa', 'contact-sheet.jpg'), csData);
  images.push({ path: 'visual-qa/contact-sheet.jpg', role: 'contactSheet', sha256: sha256(csData), size: csData.length });

  // 8 frames
  for (let i = 1; i <= 8; i++) {
    const frameData = Buffer.from(`frame-${i}-content-deterministic-test-data`);
    const frameName = `frame-${String(i).padStart(2, '0')}.jpg`;
    fs.writeFileSync(path.join(framesDir, frameName), frameData);
    const ts = 4.0 + (i - 1) * 10.5;
    timestamps.push(ts);
    images.push({
      path: `visual-qa/frames/${frameName}`,
      role: 'frame',
      index: i,
      timestamp: ts,
      sha256: sha256(frameData),
      size: frameData.length,
    });
  }

  // Visual QA manifest
  fs.writeFileSync(path.join(dir, 'visual-qa', 'visual-qa-manifest.json'), JSON.stringify({
    frameCount: 8,
    timestamps,
    grid: { cols: 4, rows: 2 },
    ffmpegVersion: 'n7.1.4-test',
  }));

  return { images, timestamps };
}

function createBaseline(images) {
  return { _baselineVersion: 1, timestampTolerance: 0.5, images };
}

function cleanDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('validate-tutorial-preview-frame-fingerprints.mjs', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('passes with valid fingerprints', () => {
    test('exits 0 when all hashes match', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(images)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ALL FINGERPRINTS MATCH');
    });
  });

  describe('fails on missing baseline file', () => {
    test('exits 1 when baseline path does not exist', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      const result = runValidator(artDir, path.join(tmpDir, 'nonexistent.json'));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('fails on malformed baseline', () => {
    test('exits 1 when baseline is not valid JSON', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, 'not json');
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid baseline JSON');
    });
  });

  describe('fails on missing contact sheet', () => {
    test('exits 1 when contact-sheet.jpg is missing', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      fs.unlinkSync(path.join(artDir, 'visual-qa', 'contact-sheet.jpg'));
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(images)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing file');
      expect(result.stderr).toContain('contact-sheet.jpg');
    });
  });

  describe('fails on missing frame', () => {
    test('exits 1 when a frame file is missing', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      fs.unlinkSync(path.join(artDir, 'visual-qa', 'frames', 'frame-05.jpg'));
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(images)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing file');
      expect(result.stderr).toContain('frame-05.jpg');
    });
  });

  describe('fails on zero-byte frame', () => {
    test('exits 1 when a frame is empty', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      fs.writeFileSync(path.join(artDir, 'visual-qa', 'frames', 'frame-03.jpg'), '');
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(images)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('empty');
    });
  });

  describe('fails on hash drift', () => {
    test('exits 1 when a frame hash does not match baseline', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      // Overwrite frame-02 with different content
      fs.writeFileSync(path.join(artDir, 'visual-qa', 'frames', 'frame-02.jpg'), 'different-content');
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(images)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('SHA-256 drift');
      expect(result.stderr).toContain('frame-02.jpg');
    });
  });

  describe('fails on byte-size drift', () => {
    test('exits 1 when file size does not match baseline', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      // Modify baseline to expect different size for contact sheet
      const modImages = [...images];
      modImages[0] = { ...modImages[0], size: 99999 };
      // But keep the hash correct (so only size check fails)
      modImages[0].sha256 = sha256(fs.readFileSync(path.join(artDir, 'visual-qa', 'contact-sheet.jpg')));
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(modImages)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Size drift');
    });
  });

  describe('fails on timestamp drift', () => {
    test('exits 1 when manifest timestamp drifts beyond tolerance', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { images } = createValidArtifact(artDir);
      // Override manifest with drifted timestamps
      const manifestPath = path.join(artDir, 'visual-qa', 'visual-qa-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.timestamps[0] = 50.0; // Huge drift from baseline 4.0
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(images)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Timestamp drift');
    });
  });

  describe('fails on empty images array in baseline', () => {
    test('exits 1 when baseline has no images', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify({ images: [] }));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('empty');
    });
  });
});
