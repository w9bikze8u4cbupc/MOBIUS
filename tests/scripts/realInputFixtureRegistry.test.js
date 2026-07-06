/**
 * Unit tests for the real-input fixture registry.
 *
 * Validates that fixtures.json is well-formed and all referenced files exist,
 * preventing silent breakage when adding or modifying fixtures.
 */

const path = require('path');
const fs = require('fs');

const REGISTRY_DIR = path.resolve(__dirname, '../fixtures/tutorial-real-input');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'fixtures.json');

// ---------------------------------------------------------------------------
// Load registry
// ---------------------------------------------------------------------------
let registry;

beforeAll(() => {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  registry = JSON.parse(raw);
});

// ---------------------------------------------------------------------------
// Registry structure tests
// ---------------------------------------------------------------------------
describe('fixtures.json registry structure', () => {
  test('registry file exists and is valid JSON', () => {
    expect(fs.existsSync(REGISTRY_PATH)).toBe(true);
    expect(registry).toBeDefined();
  });

  test('registry has a fixtures array', () => {
    expect(Array.isArray(registry.fixtures)).toBe(true);
  });

  test('registry has at least one enabled fixture', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    expect(enabled.length).toBeGreaterThan(0);
  });

  test('no duplicate slugs', () => {
    const slugs = registry.fixtures.map((f) => f.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  test('each fixture has required fields', () => {
    const REQUIRED = ['slug', 'gameName', 'profile', 'enabled', 'metadataFile', 'rulebookExtractFile', 'expectedFile'];
    for (const fixture of registry.fixtures) {
      for (const field of REQUIRED) {
        expect(fixture).toHaveProperty(field);
      }
    }
  });

  test('each slug is a non-empty string', () => {
    for (const fixture of registry.fixtures) {
      expect(typeof fixture.slug).toBe('string');
      expect(fixture.slug.length).toBeGreaterThan(0);
    }
  });

  test('each gameName is a non-empty string', () => {
    for (const fixture of registry.fixtures) {
      expect(typeof fixture.gameName).toBe('string');
      expect(fixture.gameName.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// File existence tests
// ---------------------------------------------------------------------------
describe('fixtures.json — referenced files exist', () => {
  test('each enabled fixture has a metadata file', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const filePath = path.join(REGISTRY_DIR, fixture.metadataFile);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test('each enabled fixture has a rulebook-extract file', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const filePath = path.join(REGISTRY_DIR, fixture.rulebookExtractFile);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test('each enabled fixture has an expected-contract file', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const filePath = path.join(REGISTRY_DIR, fixture.expectedFile);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Identity consistency tests
// ---------------------------------------------------------------------------
describe('fixtures.json — identity consistency', () => {
  test('metadata slug matches registry slug', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const metadata = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.metadataFile), 'utf8'));
      expect(metadata.slug).toBe(fixture.slug);
    }
  });

  test('metadata title matches registry gameName', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const metadata = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.metadataFile), 'utf8'));
      expect(metadata.title).toBe(fixture.gameName);
    }
  });

  test('expected contract gameId matches registry slug', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const expected = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.expectedFile), 'utf8'));
      expect(expected.gameId).toBe(fixture.slug);
    }
  });

  test('expected contract gameName matches registry gameName', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const expected = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.expectedFile), 'utf8'));
      expect(expected.gameName).toBe(fixture.gameName);
    }
  });

  test('expected contract fixtureSlug matches registry slug', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const expected = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.expectedFile), 'utf8'));
      expect(expected.fixtureSlug).toBe(fixture.slug);
    }
  });
});

// ---------------------------------------------------------------------------
// Rulebook extract completeness tests
// ---------------------------------------------------------------------------
describe('fixtures.json — rulebook extract completeness', () => {
  test('each enabled fixture rulebook-extract has required sections', () => {
    const REQUIRED_SECTIONS = ['objective', 'components', 'setup', 'turnStructure', 'coreMechanic', 'scoring'];
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const extract = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.rulebookExtractFile), 'utf8'));
      for (const section of REQUIRED_SECTIONS) {
        expect(extract).toHaveProperty(section);
      }
    }
  });

  test('each enabled fixture rulebook-extract has non-empty components', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const extract = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.rulebookExtractFile), 'utf8'));
      expect(Array.isArray(extract.components)).toBe(true);
      expect(extract.components.length).toBeGreaterThan(0);
    }
  });

  test('each enabled fixture rulebook-extract has non-empty setup', () => {
    const enabled = registry.fixtures.filter((f) => f.enabled);
    for (const fixture of enabled) {
      const extract = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, fixture.rulebookExtractFile), 'utf8'));
      expect(Array.isArray(extract.setup)).toBe(true);
      expect(extract.setup.length).toBeGreaterThan(0);
    }
  });
});
