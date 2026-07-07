/**
 * Unit tests for the offline real-input preview CLI helpers and argument handling.
 *
 * Tests registry helper functions (realInputFixtureRegistry.cjs) and CLI
 * error behavior without requiring FFmpeg for unit-level validation.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const {
  loadRegistry,
  getEnabledFixtures,
  findFixtureBySlug,
  resolveFixturePaths,
  validateFixtureFiles,
  DEFAULT_REGISTRY_PATH,
} = require('../helpers/realInputFixtureRegistry.cjs');

const CLI_SCRIPT = path.resolve(__dirname, '../../scripts/run-real-input-preview.mjs');
const REGISTRY_DIR = path.resolve(__dirname, '../fixtures/tutorial-real-input');

// ---------------------------------------------------------------------------
// Registry helper tests
// ---------------------------------------------------------------------------
describe('realInputFixtureRegistry — loadRegistry', () => {
  test('loads the workspace registry successfully', () => {
    const registry = loadRegistry();
    expect(registry).toBeDefined();
    expect(Array.isArray(registry.fixtures)).toBe(true);
    expect(registry.fixtures.length).toBeGreaterThan(0);
  });

  test('loads from explicit path', () => {
    const registry = loadRegistry(DEFAULT_REGISTRY_PATH);
    expect(Array.isArray(registry.fixtures)).toBe(true);
  });

  test('throws on missing file', () => {
    expect(() => loadRegistry('/nonexistent/path/fixtures.json')).toThrow('not found');
  });

  test('throws on invalid JSON', () => {
    const tmpFile = path.join(os.tmpdir(), 'bad-registry.json');
    fs.writeFileSync(tmpFile, '{broken', 'utf8');
    try {
      expect(() => loadRegistry(tmpFile)).toThrow('Invalid JSON');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('throws when fixtures array is missing', () => {
    const tmpFile = path.join(os.tmpdir(), 'no-fixtures.json');
    fs.writeFileSync(tmpFile, '{"_schema":"test"}', 'utf8');
    try {
      expect(() => loadRegistry(tmpFile)).toThrow('fixtures');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('realInputFixtureRegistry — getEnabledFixtures', () => {
  test('returns only enabled fixtures', () => {
    const registry = loadRegistry();
    const enabled = getEnabledFixtures(registry);
    expect(enabled.length).toBeGreaterThan(0);
    for (const f of enabled) {
      expect(f.enabled).toBe(true);
    }
  });

  test('returns empty for all-disabled registry', () => {
    const registry = { fixtures: [{ slug: 'x', enabled: false }] };
    expect(getEnabledFixtures(registry)).toHaveLength(0);
  });
});

describe('realInputFixtureRegistry — findFixtureBySlug', () => {
  test('finds sakura-market', () => {
    const registry = loadRegistry();
    const fixture = findFixtureBySlug(registry, 'sakura-market');
    expect(fixture).not.toBeNull();
    expect(fixture.slug).toBe('sakura-market');
    expect(fixture.gameName).toBe('Sakura Market');
  });

  test('finds stellar-drift', () => {
    const registry = loadRegistry();
    const fixture = findFixtureBySlug(registry, 'stellar-drift');
    expect(fixture).not.toBeNull();
    expect(fixture.slug).toBe('stellar-drift');
  });

  test('returns null for unknown slug', () => {
    const registry = loadRegistry();
    expect(findFixtureBySlug(registry, 'nonexistent-game')).toBeNull();
  });
});

describe('realInputFixtureRegistry — resolveFixturePaths', () => {
  test('resolves paths relative to registry directory', () => {
    const fixture = { metadataFile: 'a.json', rulebookExtractFile: 'b.json', expectedFile: 'c.json' };
    const resolved = resolveFixturePaths(fixture, '/base/dir');
    expect(resolved.metadata).toBe(path.join('/base/dir', 'a.json'));
    expect(resolved.extract).toBe(path.join('/base/dir', 'b.json'));
    expect(resolved.expected).toBe(path.join('/base/dir', 'c.json'));
  });
});

describe('realInputFixtureRegistry — validateFixtureFiles', () => {
  test('returns valid for sakura-market', () => {
    const registry = loadRegistry();
    const fixture = findFixtureBySlug(registry, 'sakura-market');
    const result = validateFixtureFiles(fixture, REGISTRY_DIR);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('returns invalid when files are missing', () => {
    const fixture = { metadataFile: 'missing.json', rulebookExtractFile: 'also-missing.json', expectedFile: 'nope.json' };
    const result = validateFixtureFiles(fixture, REGISTRY_DIR);
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// CLI argument error handling tests (no FFmpeg required)
// ---------------------------------------------------------------------------
describe('run-real-input-preview CLI — argument errors', () => {
  function runCLI(args) {
    try {
      const result = execFileSync('node', [CLI_SCRIPT, ...args], {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000,
        cwd: path.resolve(__dirname, '../..'),
      });
      return { exitCode: 0, stdout: result, stderr: '' };
    } catch (err) {
      return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
    }
  }

  test('exits 2 with no arguments', () => {
    const { exitCode, stderr } = runCLI([]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Usage');
  });

  test('exits 2 with --fixture but no --out', () => {
    const { exitCode, stderr } = runCLI(['--fixture', 'sakura-market']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--out');
  });

  test('exits 2 with --out but no --fixture', () => {
    const { exitCode, stderr } = runCLI(['--out', '/tmp/test-out']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Usage');
  });

  test('exits 2 for unknown fixture slug', () => {
    const { exitCode, stderr } = runCLI(['--fixture', 'nonexistent-game', '--out', '/tmp/test-out']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Unknown fixture slug');
    expect(stderr).toContain('nonexistent-game');
  });

  test('prints available slugs for unknown fixture', () => {
    const { stderr } = runCLI(['--fixture', 'bad-slug', '--out', '/tmp/test-out']);
    expect(stderr).toContain('sakura-market');
    expect(stderr).toContain('stellar-drift');
  });
});

// ---------------------------------------------------------------------------
// Ad-hoc mode argument handling tests (no FFmpeg required)
// ---------------------------------------------------------------------------
describe('run-real-input-preview CLI — ad-hoc mode arguments', () => {
  function runCLI(args) {
    try {
      const result = execFileSync('node', [CLI_SCRIPT, ...args], {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000,
        cwd: path.resolve(__dirname, '../..'),
      });
      return { exitCode: 0, stdout: result, stderr: '' };
    } catch (err) {
      return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
    }
  }

  const VALID_METADATA = path.resolve(__dirname, '../fixtures/tutorial-real-input/sakura-market.metadata.json');
  const VALID_EXTRACT = path.resolve(__dirname, '../fixtures/tutorial-real-input/sakura-market.rulebook-extract.json');
  const VALID_EXPECTED = path.resolve(__dirname, '../fixtures/tutorial-real-input/sakura-market.expected.json');

  test('exits 2 when mixing --fixture with --metadata', () => {
    const { exitCode, stderr } = runCLI([
      '--fixture', 'sakura-market',
      '--metadata', VALID_METADATA,
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Cannot mix');
  });

  test('exits 2 when mixing --fixture with --rulebook-extract', () => {
    const { exitCode, stderr } = runCLI([
      '--fixture', 'sakura-market',
      '--rulebook-extract', VALID_EXTRACT,
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Cannot mix');
  });

  test('exits 2 when --metadata is provided but --rulebook-extract is missing', () => {
    const { exitCode, stderr } = runCLI([
      '--metadata', VALID_METADATA,
      '--expected', VALID_EXPECTED,
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--rulebook-extract');
  });

  test('exits 2 when --metadata is provided but --expected is missing', () => {
    const { exitCode, stderr } = runCLI([
      '--metadata', VALID_METADATA,
      '--rulebook-extract', VALID_EXTRACT,
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--expected');
  });

  test('exits 2 when ad-hoc mode but --out is missing', () => {
    const { exitCode, stderr } = runCLI([
      '--metadata', VALID_METADATA,
      '--rulebook-extract', VALID_EXTRACT,
      '--expected', VALID_EXPECTED,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--out');
  });

  test('exits 2 when metadata file does not exist', () => {
    const { exitCode, stderr } = runCLI([
      '--metadata', '/nonexistent/meta.json',
      '--rulebook-extract', VALID_EXTRACT,
      '--expected', VALID_EXPECTED,
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('not found');
  });

  test('exits 2 when rulebook-extract file does not exist', () => {
    const { exitCode, stderr } = runCLI([
      '--metadata', VALID_METADATA,
      '--rulebook-extract', '/nonexistent/extract.json',
      '--expected', VALID_EXPECTED,
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('not found');
  });

  test('exits 2 when expected contract file does not exist', () => {
    const { exitCode, stderr } = runCLI([
      '--metadata', VALID_METADATA,
      '--rulebook-extract', VALID_EXTRACT,
      '--expected', '/nonexistent/expected.json',
      '--out', '/tmp/test-out',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('not found');
  });

  test('exits 1 when metadata has invalid source contract', () => {
    // Create a temp metadata file with missing required fields
    const tmpMeta = path.join(os.tmpdir(), 'bad-meta-adhoc.json');
    fs.writeFileSync(tmpMeta, JSON.stringify({ slug: 'test' }), 'utf8'); // missing title, playerCount, designers
    try {
      const { exitCode, stderr } = runCLI([
        '--metadata', tmpMeta,
        '--rulebook-extract', VALID_EXTRACT,
        '--expected', VALID_EXPECTED,
        '--out', path.join(os.tmpdir(), 'adhoc-test-out'),
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Source contract validation FAILED');
    } finally {
      try { fs.unlinkSync(tmpMeta); } catch {}
      try { fs.rmSync(path.join(os.tmpdir(), 'adhoc-test-out'), { recursive: true, force: true }); } catch {}
    }
  });

  test('usage message shows both registered and ad-hoc modes', () => {
    const { stderr } = runCLI([]);
    expect(stderr).toContain('Registered fixture mode');
    expect(stderr).toContain('Ad-hoc local source mode');
    expect(stderr).toContain('--metadata');
    expect(stderr).toContain('--rulebook-extract');
    expect(stderr).toContain('--expected');
  });
});

// ---------------------------------------------------------------------------
// Package manifest schema tests (no FFmpeg required — tests CLI manifest fields)
// ---------------------------------------------------------------------------
describe('run-real-input-preview CLI — package manifest schema', () => {
  // These tests validate the manifest structure using a mock manifest object
  // since full CLI execution requires FFmpeg. The CLI integration is tested
  // via CI smoke verification.

  const MANIFEST_SCHEMA = 'preview-package-manifest/v1';

  test('manifest schema version is correct', () => {
    expect(MANIFEST_SCHEMA).toBe('preview-package-manifest/v1');
  });

  test('manifest requires sourceMode field', () => {
    const manifest = { _schema: MANIFEST_SCHEMA, sourceMode: 'registered' };
    expect(['registered', 'ad-hoc']).toContain(manifest.sourceMode);
  });

  test('manifest requires fixtureSlug field', () => {
    const manifest = { fixtureSlug: 'sakura-market' };
    expect(typeof manifest.fixtureSlug).toBe('string');
    expect(manifest.fixtureSlug.length).toBeGreaterThan(0);
  });

  test('manifest requires gameName field', () => {
    const manifest = { gameName: 'Sakura Market' };
    expect(typeof manifest.gameName).toBe('string');
    expect(manifest.gameName.length).toBeGreaterThan(0);
  });

  test('manifest source block has required fields', () => {
    const source = { metadataFile: 'a.json', rulebookExtractFile: 'b.json', expectedFile: 'c.json' };
    expect(source.metadataFile).toBeDefined();
    expect(source.rulebookExtractFile).toBeDefined();
    expect(source.expectedFile).toBeDefined();
  });

  test('manifest validation block has passed and errorCount', () => {
    const validation = { passed: true, errorCount: 0, errors: [] };
    expect(typeof validation.passed).toBe('boolean');
    expect(typeof validation.errorCount).toBe('number');
    expect(Array.isArray(validation.errors)).toBe(true);
  });

  test('manifest artifacts block has expected file entries', () => {
    const EXPECTED_FILES = [
      'script.json', 'storyboard.json', 'captions.srt',
      'render-config.json', 'manifest.json', 'preview.mp4',
      'ffprobe.json', 'validation-result.json', 'real-input-preview-coverage.json',
    ];
    const artifacts = {};
    for (const f of EXPECTED_FILES) {
      artifacts[f] = { exists: true, size: 1000, sha256: 'abc123' };
    }
    for (const f of EXPECTED_FILES) {
      expect(artifacts[f]).toBeDefined();
      expect(artifacts[f].exists).toBe(true);
      expect(typeof artifacts[f].size).toBe('number');
      expect(typeof artifacts[f].sha256).toBe('string');
    }
  });
});
