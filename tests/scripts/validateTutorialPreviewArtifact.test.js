const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../scripts/validate-tutorial-preview-artifact.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial-preview-validate-'));
}

function runValidator(dir, opts = {}) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    const output = execFileSync('node', [VALIDATOR_SCRIPT, '--dir', dir], {
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

/**
 * Creates a minimal valid artifact directory for testing.
 */
function createValidArtifact(dir) {
  const ffprobeData = {
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        r_frame_rate: '30/1',
      },
      {
        codec_type: 'audio',
        codec_name: 'aac',
      },
    ],
    format: {
      duration: '85.000000',
      size: '581180',
    },
  };

  const segments = Array.from({ length: 17 }, (_, i) => ({
    id: `seg-${i + 1}`,
    type: i === 0 ? 'hook' : i === 16 ? 'end_card' : 'explanation',
    narration: `This is narration for segment ${i + 1}.`,
    durationSec: 5,
  }));

  const scriptData = {
    segments,
    warnings: [],
    metadata: { totalDurationSec: 85, eliteS1Valid: true },
  };

  const storyboardData = {
    scenes: segments.map((s) => ({
      id: s.id,
      durationSec: s.durationSec,
      narration: s.narration,
    })),
  };

  const renderConfigData = {
    projectId: 'gem-collectors',
    video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
    scenes: segments.map((s) => ({
      id: s.id,
      durationSec: s.durationSec,
      background: { color: '#1a1a2e' },
      overlays: [{ type: 'body', text: s.narration, position: 'center' }],
    })),
  };

  const manifestData = {
    generatedAt: '2026-06-18T17:50:58Z',
    fixture: 'gem-collectors.json',
    game: { id: 'gem-collectors', name: 'Gem Collectors' },
    script: { segments: 17, totalDurationSec: 85 },
    storyboard: { scenes: 17 },
    captions: { cues: 34, totalDurationMs: 85000 },
    render: { scenes: 17, mode: 'render' },
  };

  // Generate SRT with 34 cues
  let srt = '';
  for (let i = 1; i <= 34; i++) {
    const startSec = (i - 1) * 2.5;
    const endSec = startSec + 2.3;
    const startTs = formatSrtTime(startSec);
    const endTs = formatSrtTime(endSec);
    srt += `${i}\n${startTs} --> ${endTs}\nCaption text for cue ${i}.\n\n`;
  }

  fs.writeFileSync(path.join(dir, 'preview.mp4'), Buffer.alloc(1024, 0xFF)); // Non-empty binary
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(scriptData, null, 2));
  fs.writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify(storyboardData, null, 2));
  fs.writeFileSync(path.join(dir, 'captions.srt'), srt);
  fs.writeFileSync(path.join(dir, 'render-config.json'), JSON.stringify(renderConfigData, null, 2));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifestData, null, 2));
  fs.writeFileSync(path.join(dir, 'ffprobe.json'), JSON.stringify(ffprobeData, null, 2));
}

function formatSrtTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

describe('validate-tutorial-preview-artifact.mjs', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('passes with valid artifact', () => {
    test('exits 0 with all checks passed message', () => {
      createValidArtifact(tmpDir);
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ALL CHECKS PASSED');
    });
  });

  describe('fails on missing files', () => {
    test('exits 1 when preview.mp4 is missing', () => {
      createValidArtifact(tmpDir);
      fs.unlinkSync(path.join(tmpDir, 'preview.mp4'));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('preview.mp4');
    });

    test('exits 1 when script.json is missing', () => {
      createValidArtifact(tmpDir);
      fs.unlinkSync(path.join(tmpDir, 'script.json'));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('script.json');
    });

    test('exits 1 when ffprobe.json is missing', () => {
      createValidArtifact(tmpDir);
      fs.unlinkSync(path.join(tmpDir, 'ffprobe.json'));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('ffprobe.json');
    });
  });

  describe('fails on zero-byte files', () => {
    test('exits 1 when preview.mp4 is empty', () => {
      createValidArtifact(tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'preview.mp4'), '');
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('empty');
      expect(result.stderr).toContain('preview.mp4');
    });
  });

  describe('fails on invalid ffprobe.json', () => {
    test('exits 1 when ffprobe.json has invalid JSON', () => {
      createValidArtifact(tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'ffprobe.json'), 'not json');
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid JSON');
    });

    test('exits 1 when no video stream in ffprobe.json', () => {
      createValidArtifact(tmpDir);
      const data = { streams: [{ codec_type: 'audio', codec_name: 'aac' }], format: { duration: '85.0' } };
      fs.writeFileSync(path.join(tmpDir, 'ffprobe.json'), JSON.stringify(data));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('no video stream');
    });

    test('exits 1 when no audio stream in ffprobe.json', () => {
      createValidArtifact(tmpDir);
      const data = {
        streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' }],
        format: { duration: '85.0' },
      };
      fs.writeFileSync(path.join(tmpDir, 'ffprobe.json'), JSON.stringify(data));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('no audio stream');
    });

    test('exits 1 when video resolution is wrong', () => {
      createValidArtifact(tmpDir);
      const data = {
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '85.0' },
      };
      fs.writeFileSync(path.join(tmpDir, 'ffprobe.json'), JSON.stringify(data));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('width');
    });

    test('exits 1 when duration is out of range', () => {
      createValidArtifact(tmpDir);
      const data = {
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '30.0' },
      };
      fs.writeFileSync(path.join(tmpDir, 'ffprobe.json'), JSON.stringify(data));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('duration');
    });
  });

  describe('fails on malformed captions.srt', () => {
    test('exits 1 when captions.srt has fewer than 20 cues', () => {
      createValidArtifact(tmpDir);
      // Write only 5 cues
      let srt = '';
      for (let i = 1; i <= 5; i++) {
        srt += `${i}\n00:00:0${i},000 --> 00:00:0${i},500\nShort.\n\n`;
      }
      fs.writeFileSync(path.join(tmpDir, 'captions.srt'), srt);
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('cues');
    });
  });

  describe('fails on invalid script.json', () => {
    test('exits 1 when segments count is less than 10', () => {
      createValidArtifact(tmpDir);
      const data = {
        segments: [{ id: 's1', narration: 'Hello', durationSec: 5 }],
        warnings: [],
        metadata: {},
      };
      fs.writeFileSync(path.join(tmpDir, 'script.json'), JSON.stringify(data));
      const result = runValidator(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('segment count');
    });
  });
});
