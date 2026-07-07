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
    expect(stderr).toContain('Usage');
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
