const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../scripts/validate-tutorial-preview-mp4-fingerprint.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mp4-fingerprint-validate-'));
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
  const mp4Data = Buffer.from('fake-mp4-content-for-deterministic-testing-1234567890');
  fs.writeFileSync(path.join(dir, 'preview.mp4'), mp4Data);

  // ffprobe.json for metadata cross-check
  fs.writeFileSync(path.join(dir, 'ffprobe.json'), JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '85.0', size: String(mp4Data.length) },
  }));

  return { mp4Data, hash: sha256(mp4Data), size: mp4Data.length };
}

function createBaseline(hash, size) {
  return {
    _baselineVersion: 1,
    file: 'preview.mp4',
    sha256: hash,
    size: size,
    expectedMedia: {
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      fps: 30,
      durationRange: { min: 80, max: 90 },
      streamCount: 2,
    },
  };
}

function cleanDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('validate-tutorial-preview-mp4-fingerprint.mjs', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('passes with valid MP4 hash', () => {
    test('exits 0 when hash and size match', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { hash, size } = createValidArtifact(artDir);
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(hash, size)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('MP4 FINGERPRINT MATCHES BASELINE');
    });
  });

  describe('fails on missing baseline file', () => {
    test('exits 1 when baseline does not exist', () => {
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

  describe('fails on missing preview.mp4', () => {
    test('exits 1 when preview.mp4 does not exist', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      // No preview.mp4 created
      fs.writeFileSync(path.join(artDir, 'ffprobe.json'), '{}');
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline('abc123', 1000)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing file');
    });
  });

  describe('fails on zero-byte preview.mp4', () => {
    test('exits 1 when preview.mp4 is empty', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      fs.writeFileSync(path.join(artDir, 'preview.mp4'), '');
      fs.writeFileSync(path.join(artDir, 'ffprobe.json'), '{}');
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline('abc123', 1000)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('empty');
    });
  });

  describe('fails on hash drift', () => {
    test('exits 1 when SHA-256 does not match baseline', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { size } = createValidArtifact(artDir);
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline('0000000000000000000000000000000000000000000000000000000000000000', size)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('SHA-256 drift');
    });
  });

  describe('fails on byte-size drift', () => {
    test('exits 1 when size does not match baseline', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { hash } = createValidArtifact(artDir);
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(hash, 99999)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Size drift');
    });
  });

  describe('fails on codec metadata drift', () => {
    test('exits 1 when ffprobe shows wrong codec', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const { hash, size } = createValidArtifact(artDir);
      // Override ffprobe with wrong codec
      fs.writeFileSync(path.join(artDir, 'ffprobe.json'), JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'vp9', width: 1920, height: 1080, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '85.0' },
      }));
      const blFile = path.join(tmpDir, 'baseline.json');
      fs.writeFileSync(blFile, JSON.stringify(createBaseline(hash, size)));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('video codec');
    });
  });

  describe('passes without ffprobe.json when no metadata cross-check needed', () => {
    test('exits 0 when ffprobe.json is missing but hash matches', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      const mp4Data = Buffer.from('test-mp4-no-ffprobe');
      fs.writeFileSync(path.join(artDir, 'preview.mp4'), mp4Data);
      const hash = sha256(mp4Data);
      const blFile = path.join(tmpDir, 'baseline.json');
      // Baseline without expectedMedia
      fs.writeFileSync(blFile, JSON.stringify({ _baselineVersion: 1, file: 'preview.mp4', sha256: hash, size: mp4Data.length }));
      const result = runValidator(artDir, blFile);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('MP4 FINGERPRINT MATCHES BASELINE');
    });
  });
});
