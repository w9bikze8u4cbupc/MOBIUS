/**
 * Unit tests for realInputSmokeCoverageReport helper.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  SCHEMA_VERSION,
  createReport,
  buildFixtureEntry,
  writeReport,
} = require('../helpers/realInputSmokeCoverageReport.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-coverage-report-test-'));
}

function buildValidArtifactDir(dir) {
  fs.writeFileSync(path.join(dir, 'preview.mp4'), Buffer.alloc(20000, 0x42));
  fs.writeFileSync(path.join(dir, 'script.json'), '{"segments":[]}');
  fs.writeFileSync(path.join(dir, 'storyboard.json'), '{"scenes":[]}');
  fs.writeFileSync(path.join(dir, 'captions.srt'), '1\n00:00:00,000 --> 00:00:05,000\nTest\n');
  fs.writeFileSync(path.join(dir, 'render-config.json'), '{"projectId":"test"}');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    game: { id: 'test-game', name: 'Test Game' },
    fixtureSlug: 'test-game',
  }));
  fs.writeFileSync(path.join(dir, 'ffprobe.json'), JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '95.5' },
  }));
}

// ---------------------------------------------------------------------------
// Tests: createReport
// ---------------------------------------------------------------------------
describe('createReport', () => {
  test('returns report with correct schema version', () => {
    const report = createReport({ registryPath: '/path/to/fixtures.json', enabledCount: 2 });
    expect(report._schema).toBe(SCHEMA_VERSION);
  });

  test('returns report with generatedAt timestamp', () => {
    const before = new Date().toISOString();
    const report = createReport({ registryPath: '/path', enabledCount: 1 });
    const after = new Date().toISOString();
    expect(report.generatedAt >= before).toBe(true);
    expect(report.generatedAt <= after).toBe(true);
  });

  test('returns report with registryPath and enabledFixtureCount', () => {
    const report = createReport({ registryPath: '/my/registry.json', enabledCount: 3 });
    expect(report.registryPath).toBe('/my/registry.json');
    expect(report.enabledFixtureCount).toBe(3);
  });

  test('returns report with empty fixtures array', () => {
    const report = createReport({ registryPath: '/path', enabledCount: 0 });
    expect(report.fixtures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildFixtureEntry
// ---------------------------------------------------------------------------
describe('buildFixtureEntry', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    buildValidArtifactDir(tmpDir);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('populates slug, gameName, and profile', () => {
    const entry = buildFixtureEntry({
      slug: 'test-game',
      gameName: 'Test Game',
      profile: 'Test profile',
      metadataFile: 'test.metadata.json',
      rulebookExtractFile: 'test.rulebook-extract.json',
      expectedFile: 'test.expected.json',
      normalizedFixturePath: '/tmp/test.json',
      artifactDir: tmpDir,
      ffprobeData: JSON.parse(fs.readFileSync(path.join(tmpDir, 'ffprobe.json'), 'utf8')),
      manifestData: JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf8')),
      requiredArtifacts: ['preview.mp4', 'script.json'],
      contractValidation: { passed: true, errors: [] },
    });
    expect(entry.slug).toBe('test-game');
    expect(entry.gameName).toBe('Test Game');
    expect(entry.profile).toBe('Test profile');
  });

  test('reports artifact presence correctly', () => {
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: null, manifestData: null,
      requiredArtifacts: ['preview.mp4', 'script.json', 'nonexistent.txt'],
      contractValidation: { passed: false, errors: ['missing'] },
    });
    expect(entry.artifactPresence['preview.mp4']).toBe(true);
    expect(entry.artifactPresence['script.json']).toBe(true);
    expect(entry.artifactPresence['nonexistent.txt']).toBe(false);
  });

  test('extracts media metadata from ffprobeData', () => {
    const ffprobe = {
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      format: { duration: '118.3' },
    };
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: ffprobe, manifestData: null,
      requiredArtifacts: [],
      contractValidation: { passed: true, errors: [] },
    });
    expect(entry.media.duration).toBeCloseTo(118.3);
    expect(entry.media.videoCodec).toBe('h264');
    expect(entry.media.videoWidth).toBe(1920);
    expect(entry.media.videoHeight).toBe(1080);
    expect(entry.media.audioPresent).toBe(true);
  });

  test('handles missing audio stream', () => {
    const ffprobe = {
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 }],
      format: { duration: '60.0' },
    };
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: ffprobe, manifestData: null,
      requiredArtifacts: [],
      contractValidation: { passed: true, errors: [] },
    });
    expect(entry.media.audioPresent).toBe(false);
  });

  test('handles null ffprobeData gracefully', () => {
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: null, manifestData: null,
      requiredArtifacts: [],
      contractValidation: { passed: true, errors: [] },
    });
    expect(entry.media.duration).toBeNull();
    expect(entry.media.videoCodec).toBeNull();
    expect(entry.media.audioPresent).toBe(false);
  });

  test('extracts manifest identity', () => {
    const manifest = { game: { id: 'my-game', name: 'My Game' }, fixtureSlug: 'my-game' };
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: null, manifestData: manifest,
      requiredArtifacts: [],
      contractValidation: { passed: true, errors: [] },
    });
    expect(entry.manifestIdentity.gameId).toBe('my-game');
    expect(entry.manifestIdentity.gameName).toBe('My Game');
    expect(entry.manifestIdentity.fixtureSlug).toBe('my-game');
  });

  test('handles null manifestData gracefully', () => {
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: null, manifestData: null,
      requiredArtifacts: [],
      contractValidation: { passed: true, errors: [] },
    });
    expect(entry.manifestIdentity).toBeNull();
  });

  test('includes contract validation result', () => {
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: null, manifestData: null,
      requiredArtifacts: [],
      contractValidation: { passed: false, errors: ['err1', 'err2'] },
    });
    expect(entry.contractValidation.passed).toBe(false);
    expect(entry.contractValidation.errorCount).toBe(2);
    expect(entry.contractValidation.errors).toEqual(['err1', 'err2']);
  });

  test('handles null contractValidation gracefully', () => {
    const entry = buildFixtureEntry({
      slug: 'x', gameName: 'X', profile: 'p',
      metadataFile: 'a', rulebookExtractFile: 'b', expectedFile: 'c',
      normalizedFixturePath: '/tmp/x.json',
      artifactDir: tmpDir,
      ffprobeData: null, manifestData: null,
      requiredArtifacts: [],
      contractValidation: null,
    });
    expect(entry.contractValidation.passed).toBe(false);
    expect(entry.contractValidation.errorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: writeReport
// ---------------------------------------------------------------------------
describe('writeReport', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('writes valid JSON to disk', () => {
    const report = createReport({ registryPath: '/path', enabledCount: 1 });
    report.fixtures.push({ slug: 'test' });
    const outputPath = path.join(tmpDir, 'coverage.json');
    writeReport(outputPath, report);

    expect(fs.existsSync(outputPath)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(loaded._schema).toBe(SCHEMA_VERSION);
    expect(loaded.fixtures).toHaveLength(1);
    expect(loaded.fixtures[0].slug).toBe('test');
  });

  test('report is human-readable (indented)', () => {
    const report = createReport({ registryPath: '/path', enabledCount: 0 });
    const outputPath = path.join(tmpDir, 'report.json');
    writeReport(outputPath, report);

    const raw = fs.readFileSync(outputPath, 'utf8');
    expect(raw).toContain('\n');
    expect(raw).toContain('  ');
  });
});
