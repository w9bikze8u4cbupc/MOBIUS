/**
 * Full-Flow Tutorial Smoke Test v1
 *
 * Proves the core tutorial pipeline can run end-to-end from a deterministic
 * fixture to a rendered MP4, without manual Tutorial Preview Demo dispatch.
 *
 * Pipeline: fixture → script → storyboard → render-config → MP4 render → artifact validation
 *
 * Requires FFmpeg with drawtext filter. Skips gracefully on machines without FFmpeg.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GENERATE_SCRIPT = path.resolve(__dirname, '../../scripts/generate-tutorial-preview.mjs');
const RENDER_SCRIPT = path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs');
const VALIDATE_SCRIPT = path.resolve(__dirname, '../../scripts/validate-tutorial-preview-artifact.mjs');
const FIXTURE = path.resolve(__dirname, '../fixtures/tutorial-vertical-slice/gem-collectors.json');

// ---------------------------------------------------------------------------
// FFmpeg availability detection (same pattern as storyboard_ffmpeg_real_mp4)
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

function hasDrawtextFilter() {
  if (!isFfmpegAvailable()) return false;
  try {
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

const CAN_RUN = isFfmpegAvailable() && isFfprobeAvailable() && hasDrawtextFilter();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-full-flow-smoke-'));
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
describe('Full-Flow Tutorial Smoke (fixture → MP4)', () => {
  if (!CAN_RUN) {
    test('SKIPPED: FFmpeg/ffprobe not available or missing drawtext filter', () => {
      console.log('FFmpeg not found or drawtext filter unavailable — skipping full-flow smoke test.');
      expect(true).toBe(true);
    });
    return;
  }

  // Ensure sufficient timeout for CI rendering (~90s video)
  jest.setTimeout(240000);

  let tmpDir;
  let outDir;
  let mp4Path;

  beforeAll(() => {
    tmpDir = createTempDir();
    outDir = path.join(tmpDir, 'tutorial-preview');
    mp4Path = path.join(outDir, 'preview.mp4');

    // Step 1: Generate tutorial artifacts from fixture
    execFileSync('node', [
      GENERATE_SCRIPT,
      '--fixture', FIXTURE,
      '--slug', 'gem-collectors',
      '--out', outDir,
    ], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000,
      cwd: path.resolve(__dirname, '../..'),
    });

    // Step 2: Render MP4 preview
    execFileSync('node', [
      RENDER_SCRIPT,
      '--config', path.join(outDir, 'render-config.json'),
      '--out', mp4Path,
    ], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120000,
      cwd: path.resolve(__dirname, '../..'),
    });

    // Step 3: Capture ffprobe.json (required by artifact validator)
    const ffprobeOutput = execFileSync('ffprobe', [
      '-hide_banner', '-loglevel', 'error',
      '-print_format', 'json',
      '-show_format', '-show_streams',
      mp4Path,
    ], { encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
    fs.writeFileSync(path.join(outDir, 'ffprobe.json'), ffprobeOutput, 'utf8');
  }, 240000);

  afterAll(() => {
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('preview.mp4 exists', () => {
    expect(fs.existsSync(mp4Path)).toBe(true);
  });

  test('preview.mp4 is non-empty (> 10KB)', () => {
    const stat = fs.statSync(mp4Path);
    expect(stat.size).toBeGreaterThan(10240);
  });

  test('script.json exists', () => {
    expect(fs.existsSync(path.join(outDir, 'script.json'))).toBe(true);
  });

  test('storyboard.json exists', () => {
    expect(fs.existsSync(path.join(outDir, 'storyboard.json'))).toBe(true);
  });

  test('render-config.json exists', () => {
    expect(fs.existsSync(path.join(outDir, 'render-config.json'))).toBe(true);
  });

  test('manifest.json exists', () => {
    expect(fs.existsSync(path.join(outDir, 'manifest.json'))).toBe(true);
  });

  test('captions.srt exists', () => {
    expect(fs.existsSync(path.join(outDir, 'captions.srt'))).toBe(true);
  });

  test('ffprobe.json exists', () => {
    expect(fs.existsSync(path.join(outDir, 'ffprobe.json'))).toBe(true);
  });

  test('video has correct resolution (1920x1080)', () => {
    const probe = probeVideo(mp4Path);
    const videoStream = probe.streams.find((s) => s.codec_type === 'video');
    expect(videoStream).toBeDefined();
    expect(Number(videoStream.width)).toBe(1920);
    expect(Number(videoStream.height)).toBe(1080);
  });

  test('video codec is H.264', () => {
    const probe = probeVideo(mp4Path);
    const videoStream = probe.streams.find((s) => s.codec_type === 'video');
    expect(videoStream.codec_name).toBe('h264');
  });

  test('audio stream exists', () => {
    const probe = probeVideo(mp4Path);
    const audioStream = probe.streams.find((s) => s.codec_type === 'audio');
    expect(audioStream).toBeDefined();
  });

  test('video duration is reasonable (60-120 seconds)', () => {
    const probe = probeVideo(mp4Path);
    const duration = Number(probe.format.duration);
    expect(duration).toBeGreaterThan(60);
    expect(duration).toBeLessThan(120);
  });

  test('artifact contract validator passes', () => {
    const result = execFileSync('node', [
      VALIDATE_SCRIPT,
      '--dir', outDir,
    ], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000,
      cwd: path.resolve(__dirname, '../..'),
    });
    // Validator exits 0 on success
    expect(result).toBeDefined();
  });
});
