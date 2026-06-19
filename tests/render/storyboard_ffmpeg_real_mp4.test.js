/**
 * Real MP4 generation smoke test for render-storyboard-ffmpeg.mjs.
 *
 * These tests require FFmpeg and ffprobe to be installed.
 * If unavailable, tests skip with a clear message rather than failing.
 *
 * In CI (build-and-qa), FFmpeg is always available via setup-ffmpeg action.
 * Locally, these tests skip gracefully on machines without FFmpeg.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RENDERER_SCRIPT = path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs');
const FIXTURE_CONFIG = path.resolve(__dirname, '../fixtures/render/two-scene-config.json');

// ---------------------------------------------------------------------------
// FFmpeg availability detection
// ---------------------------------------------------------------------------
function isFfmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function isFfprobeAvailable() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const HAS_FFMPEG = isFfmpegAvailable();
const HAS_FFPROBE = isFfprobeAvailable();

function hasDrawtextFilter() {
  if (!HAS_FFMPEG) return false;
  try {
    // Check filter exists AND can actually render (fontconfig available)
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1',
      '-vf', 'drawtext=text=X:fontsize=12',
      '-frames:v', '1', '-f', 'null', '-',
    ], { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

const CAN_RUN_REAL_RENDER = HAS_FFMPEG && HAS_FFPROBE && hasDrawtextFilter();

const describeIfFfmpeg = CAN_RUN_REAL_RENDER ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-render-smoke-'));
}

function probeVideo(filePath) {
  const raw = execFileSync('ffprobe', [
    '-hide_banner', '-loglevel', 'error',
    '-print_format', 'json',
    '-show_format', '-show_streams',
    filePath,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Real MP4 render smoke (requires FFmpeg)', () => {
  if (!CAN_RUN_REAL_RENDER) {
    test('SKIPPED: FFmpeg/ffprobe not available or missing drawtext filter', () => {
      console.log('FFmpeg not found or drawtext filter unavailable — skipping real MP4 render tests.');
      expect(true).toBe(true);
    });
    return;
  }

  let tmpDir;
  let outputPath;

  beforeAll(() => {
    tmpDir = createTempDir();
    outputPath = path.join(tmpDir, 'smoke-output.mp4');

    // Run the real renderer
    execFileSync('node', [
      RENDERER_SCRIPT,
      '--config', FIXTURE_CONFIG,
      '--out', outputPath,
    ], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60000,
      cwd: path.resolve(__dirname, '../..'),
    });
  });

  afterAll(() => {
    // Cleanup
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('output MP4 file exists', () => {
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('output MP4 file has non-trivial size (> 1KB)', () => {
    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(1024);
  });

  test('output contains a video stream with correct resolution', () => {
    const probe = probeVideo(outputPath);
    const videoStream = probe.streams.find((s) => s.codec_type === 'video');
    expect(videoStream).toBeDefined();
    // Fixture specifies 1280x720
    expect(Number(videoStream.width)).toBe(1280);
    expect(Number(videoStream.height)).toBe(720);
  });

  test('output contains an audio stream', () => {
    const probe = probeVideo(outputPath);
    const audioStream = probe.streams.find((s) => s.codec_type === 'audio');
    expect(audioStream).toBeDefined();
  });

  test('output duration approximately matches fixture total (7s)', () => {
    const probe = probeVideo(outputPath);
    const duration = Number(probe.format.duration);
    // Fixture: 3s + 4s = 7s total, allow ±0.5s tolerance
    expect(duration).toBeGreaterThan(6.5);
    expect(duration).toBeLessThan(7.5);
  });

  test('video codec is H.264', () => {
    const probe = probeVideo(outputPath);
    const videoStream = probe.streams.find((s) => s.codec_type === 'video');
    expect(videoStream.codec_name).toBe('h264');
  });
});
