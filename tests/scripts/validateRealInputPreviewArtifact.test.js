/**
 * Unit tests for validate-real-input-preview-artifact
 *
 * Tests the validateRealInputArtifact function with synthetic artifact
 * directories to verify pass/fail behavior against expected contracts.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { validateRealInputArtifact } = require('../../scripts/validate-real-input-preview-artifact.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-validator-test-'));
}

function writeFile(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}

function writeBinary(dir, name, sizeBytes) {
  const buf = Buffer.alloc(sizeBytes, 0x42);
  fs.writeFileSync(path.join(dir, name), buf);
}

/**
 * Build a minimal valid artifact set that passes all contract checks.
 */
function buildValidArtifacts(dir, overrides = {}) {
  const gameId = overrides.gameId || 'sakura-market';
  const gameName = overrides.gameName || 'Sakura Market';
  const fixtureSlug = overrides.fixtureSlug || 'sakura-market';
  const duration = overrides.duration || '120.5';
  const videoCodec = overrides.videoCodec || 'h264';
  const width = overrides.width || 1920;
  const height = overrides.height || 1080;
  const includeAudio = overrides.includeAudio !== false;
  const mp4Size = overrides.mp4Size || 20000;

  // preview.mp4
  writeBinary(dir, 'preview.mp4', mp4Size);

  // script.json
  writeFile(dir, 'script.json', JSON.stringify({ segments: [{ id: '1', narration: 'test', durationSec: 5 }] }));

  // storyboard.json
  writeFile(dir, 'storyboard.json', JSON.stringify({ scenes: [{ id: '1', durationSec: 5 }] }));

  // captions.srt
  writeFile(dir, 'captions.srt', '1\n00:00:00,000 --> 00:00:05,000\nTest caption\n');

  // render-config.json
  writeFile(dir, 'render-config.json', JSON.stringify({ projectId: 'test', scenes: [{}] }));

  // manifest.json
  writeFile(dir, 'manifest.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    game: { id: gameId, name: gameName },
    fixtureSlug,
    script: {},
    storyboard: {},
    captions: {},
    render: {},
  }));

  // ffprobe.json
  const streams = [
    { codec_type: 'video', codec_name: videoCodec, width, height, r_frame_rate: '30/1' },
  ];
  if (includeAudio) {
    streams.push({ codec_type: 'audio', codec_name: 'aac' });
  }
  writeFile(dir, 'ffprobe.json', JSON.stringify({
    streams,
    format: { duration },
  }));
}

/**
 * Minimal valid contract matching buildValidArtifacts defaults.
 */
function buildContract(overrides = {}) {
  return {
    gameId: 'sakura-market',
    gameName: 'Sakura Market',
    fixtureSlug: 'sakura-market',
    durationRange: { min: 60, max: 180 },
    requiredArtifacts: [
      'script.json',
      'storyboard.json',
      'captions.srt',
      'render-config.json',
      'manifest.json',
      'preview.mp4',
      'ffprobe.json',
    ],
    media: {
      video: { codec: 'h264', width: 1920, height: 1080 },
      audio: { required: true },
    },
    manifest: {
      gameId: 'sakura-market',
      gameName: 'Sakura Market',
      fixtureSlug: 'sakura-market',
    },
    minMp4Bytes: 10240,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('validateRealInputArtifact', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('passes with a minimal valid artifact set', () => {
    buildValidArtifacts(tmpDir);
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('fails when a required file is missing', () => {
    buildValidArtifacts(tmpDir);
    fs.unlinkSync(path.join(tmpDir, 'captions.srt'));
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('captions.srt'))).toBe(true);
  });

  test('fails when a required file is empty', () => {
    buildValidArtifacts(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'script.json'), '');
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('script.json') && e.includes('empty'))).toBe(true);
  });

  test('fails when manifest has wrong gameId', () => {
    buildValidArtifacts(tmpDir, { gameId: 'wrong-game' });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('game.id') && e.includes('wrong-game'))).toBe(true);
  });

  test('fails when manifest has wrong gameName', () => {
    buildValidArtifacts(tmpDir, { gameName: 'Wrong Name' });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('game.name') && e.includes('Wrong Name'))).toBe(true);
  });

  test('fails when manifest has wrong fixtureSlug', () => {
    buildValidArtifacts(tmpDir, { fixtureSlug: 'wrong-slug' });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('fixtureSlug') && e.includes('wrong-slug'))).toBe(true);
  });

  test('fails when duration is below min', () => {
    buildValidArtifacts(tmpDir, { duration: '30.0' });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('duration') && e.includes('30'))).toBe(true);
  });

  test('fails when duration is above max', () => {
    buildValidArtifacts(tmpDir, { duration: '250.0' });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('duration') && e.includes('250'))).toBe(true);
  });

  test('fails when audio stream is missing and audio is required', () => {
    buildValidArtifacts(tmpDir, { includeAudio: false });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('audio') && e.includes('required'))).toBe(true);
  });

  test('passes when audio stream is missing but audio is not required', () => {
    buildValidArtifacts(tmpDir, { includeAudio: false });
    const contract = buildContract({ media: { video: { codec: 'h264', width: 1920, height: 1080 }, audio: { required: false } } });
    const result = validateRealInputArtifact(tmpDir, contract);
    expect(result.passed).toBe(true);
  });

  test('fails when video resolution is wrong', () => {
    buildValidArtifacts(tmpDir, { width: 1280, height: 720 });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('width') && e.includes('1280'))).toBe(true);
    expect(result.errors.some((e) => e.includes('height') && e.includes('720'))).toBe(true);
  });

  test('fails when video codec is wrong', () => {
    buildValidArtifacts(tmpDir, { videoCodec: 'hevc' });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('video codec') && e.includes('hevc'))).toBe(true);
  });

  test('fails when ffprobe.json is malformed', () => {
    buildValidArtifacts(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'ffprobe.json'), 'not json at all');
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('ffprobe.json') && e.includes('invalid JSON'))).toBe(true);
  });

  test('fails when manifest.json is malformed', () => {
    buildValidArtifacts(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{broken');
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('manifest.json') && e.includes('invalid JSON'))).toBe(true);
  });

  test('fails when preview.mp4 is below minimum size', () => {
    buildValidArtifacts(tmpDir, { mp4Size: 100 });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('preview.mp4') && e.includes('100'))).toBe(true);
  });

  test('reports multiple errors simultaneously', () => {
    buildValidArtifacts(tmpDir, { gameId: 'wrong', duration: '10.0', includeAudio: false });
    const result = validateRealInputArtifact(tmpDir, buildContract());
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('passes with contract that has no media checks', () => {
    buildValidArtifacts(tmpDir);
    const contract = buildContract({ media: undefined });
    const result = validateRealInputArtifact(tmpDir, contract);
    expect(result.passed).toBe(true);
  });

  test('passes with contract that has no duration range', () => {
    buildValidArtifacts(tmpDir, { duration: '5.0' });
    const contract = buildContract({ durationRange: undefined });
    const result = validateRealInputArtifact(tmpDir, contract);
    expect(result.passed).toBe(true);
  });
});
