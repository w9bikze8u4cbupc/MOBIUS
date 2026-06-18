const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../scripts/validate-tutorial-preview-golden-baseline.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'golden-baseline-validate-'));
}

function runValidator(dir, baselinePath, extraArgs = []) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    const output = execFileSync('node', [VALIDATOR_SCRIPT, '--dir', dir, '--baseline', baselinePath, ...extraArgs], {
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

function createValidBaseline() {
  return {
    fixture: { gameId: 'gem-collectors', gameName: 'Gem Collectors' },
    coreFiles: ['preview.mp4', 'script.json', 'storyboard.json', 'captions.srt', 'render-config.json', 'manifest.json', 'ffprobe.json'],
    visualQaFiles: ['visual-qa/contact-sheet.jpg', 'visual-qa/visual-qa-manifest.json'],
    script: { segmentCount: 11 },
    storyboard: { sceneCount: 13 },
    captions: { cueCount: 23 },
    renderConfig: { sceneCount: 11 },
    video: { codec: 'h264', audioCodec: 'aac', width: 1920, height: 1080, fps: 30, durationRange: { min: 80, max: 90 }, streamCount: 2 },
    visualQa: { frameCount: 8, grid: { cols: 4, rows: 2 }, timestamps: [4.25, 15.18, 26.11, 37.05, 47.98, 58.91, 69.84, 80.77], timestampTolerance: 1.0, ffmpegVersionPrefix: 'n7.1.4' },
    fileSizeRanges: { 'preview.mp4': { min: 400, max: 800000 }, 'script.json': { min: 100, max: 80000 } },
  };
}

function createValidArtifactDir(dir) {
  const vqaDir = path.join(dir, 'visual-qa', 'frames');
  fs.mkdirSync(vqaDir, { recursive: true });

  // Core files
  fs.writeFileSync(path.join(dir, 'preview.mp4'), Buffer.alloc(1024, 0xFF));
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({
    segments: Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, narration: 'text', durationSec: 5 })),
  }));
  fs.writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify({
    scenes: Array.from({ length: 13 }, (_, i) => ({ id: `sc${i}`, durationSec: 6.5 })),
  }));
  // captions.srt with 23 cues
  let srt = '';
  for (let i = 1; i <= 23; i++) {
    srt += `${i}\n00:00:${String(i).padStart(2, '0')},000 --> 00:00:${String(i).padStart(2, '0')},500\nCue ${i}\n\n`;
  }
  fs.writeFileSync(path.join(dir, 'captions.srt'), srt);
  fs.writeFileSync(path.join(dir, 'render-config.json'), JSON.stringify({
    projectId: 'gem-collectors',
    video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
    scenes: Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, durationSec: 5, background: { color: '#000' } })),
  }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ generatedAt: '2026-01-01', game: { id: 'gem-collectors', name: 'Gem Collectors' } }));
  fs.writeFileSync(path.join(dir, 'ffprobe.json'), JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '85.0', size: '581180' },
  }));

  // Visual QA
  fs.writeFileSync(path.join(dir, 'visual-qa', 'contact-sheet.jpg'), Buffer.alloc(512, 0xFF));
  fs.writeFileSync(path.join(dir, 'visual-qa', 'visual-qa-manifest.json'), JSON.stringify({
    frameCount: 8, grid: { cols: 4, rows: 2 },
    timestamps: [4.25, 15.18, 26.11, 37.05, 47.98, 58.91, 69.84, 80.77],
    ffmpegVersion: 'n7.1.4-39-ga5faeca88f-20260615 Copyright',
  }));
}

function cleanDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('validate-tutorial-preview-golden-baseline.mjs', () => {
  let tmpDir;
  let baselineFile;

  beforeEach(() => {
    tmpDir = createTmpDir();
    baselineFile = path.join(tmpDir, 'baseline.json');
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('passes with valid metadata', () => {
    test('exits 0 when generated metadata matches baseline', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      fs.writeFileSync(baselineFile, JSON.stringify(createValidBaseline()));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ALL CHECKS PASSED');
    });
  });

  describe('fails on segment count drift', () => {
    test('exits 1 when script segment count differs', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      const bl = createValidBaseline();
      bl.script.segmentCount = 15;
      fs.writeFileSync(baselineFile, JSON.stringify(bl));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('script.segmentCount');
    });
  });

  describe('fails on storyboard scene count drift', () => {
    test('exits 1 when storyboard scene count differs', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      const bl = createValidBaseline();
      bl.storyboard.sceneCount = 20;
      fs.writeFileSync(baselineFile, JSON.stringify(bl));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('storyboard.sceneCount');
    });
  });

  describe('fails on caption cue count drift', () => {
    test('exits 1 when caption cue count differs', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      const bl = createValidBaseline();
      bl.captions.cueCount = 50;
      fs.writeFileSync(baselineFile, JSON.stringify(bl));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('captions.cueCount');
    });
  });

  describe('fails on video duration outside range', () => {
    test('exits 1 when duration is outside baseline range', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      // Override ffprobe with short duration
      fs.writeFileSync(path.join(artDir, 'ffprobe.json'), JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '30.0' },
      }));
      fs.writeFileSync(baselineFile, JSON.stringify(createValidBaseline()));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('video.duration');
    });
  });

  describe('fails on wrong codec', () => {
    test('exits 1 when video codec does not match baseline', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      fs.writeFileSync(path.join(artDir, 'ffprobe.json'), JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'vp9', width: 1920, height: 1080, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '85.0' },
      }));
      fs.writeFileSync(baselineFile, JSON.stringify(createValidBaseline()));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('video.codec');
    });
  });

  describe('fails on visual QA timestamp drift', () => {
    test('exits 1 when timestamps drift beyond tolerance', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      // Override VQA manifest with drifted timestamps
      fs.writeFileSync(path.join(artDir, 'visual-qa', 'visual-qa-manifest.json'), JSON.stringify({
        frameCount: 8, grid: { cols: 4, rows: 2 },
        timestamps: [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0],
        ffmpegVersion: 'n7.1.4-test',
      }));
      fs.writeFileSync(baselineFile, JSON.stringify(createValidBaseline()));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('visualQa.timestamps');
    });
  });

  describe('fails on file size outside range', () => {
    test('exits 1 when preview.mp4 is too small', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      // Make preview.mp4 tiny (10 bytes) — below min of 400
      fs.writeFileSync(path.join(artDir, 'preview.mp4'), Buffer.alloc(10));
      fs.writeFileSync(baselineFile, JSON.stringify(createValidBaseline()));
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('fileSizeRanges');
      expect(result.stderr).toContain('preview.mp4');
    });
  });

  describe('fails on missing baseline file', () => {
    test('exits 1 when baseline path does not exist', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      const result = runValidator(artDir, path.join(tmpDir, 'nonexistent.json'));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('fails on malformed baseline', () => {
    test('exits 1 when baseline is not valid JSON', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifactDir(artDir);
      fs.writeFileSync(baselineFile, 'not json at all');
      const result = runValidator(artDir, baselineFile);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid baseline JSON');
    });
  });
});
