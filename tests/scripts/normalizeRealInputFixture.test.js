/**
 * Unit tests for normalize-real-input-fixture
 */

const path = require('path');
const fs = require('fs');
const { normalizeRealInput } = require('../../scripts/normalize-real-input-fixture.cjs');

const METADATA_PATH = path.resolve(__dirname, '../fixtures/tutorial-real-input/sakura-market.metadata.json');
const EXTRACT_PATH = path.resolve(__dirname, '../fixtures/tutorial-real-input/sakura-market.rulebook-extract.json');

const STELLAR_METADATA_PATH = path.resolve(__dirname, '../fixtures/tutorial-real-input/stellar-drift.metadata.json');
const STELLAR_EXTRACT_PATH = path.resolve(__dirname, '../fixtures/tutorial-real-input/stellar-drift.rulebook-extract.json');

function loadMetadata() {
  return JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
}

function loadExtract() {
  return JSON.parse(fs.readFileSync(EXTRACT_PATH, 'utf8'));
}

function loadStellarMetadata() {
  return JSON.parse(fs.readFileSync(STELLAR_METADATA_PATH, 'utf8'));
}

function loadStellarExtract() {
  return JSON.parse(fs.readFileSync(STELLAR_EXTRACT_PATH, 'utf8'));
}

describe('normalizeRealInput', () => {
  test('produces canonical fixture with correct gameId and gameName', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.gameId).toBe('sakura-market');
    expect(result.gameName).toBe('Sakura Market');
  });

  test('maps player count from metadata', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.playerCount).toEqual({ min: 2, max: 5 });
  });

  test('formats duration from playtime range', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.duration).toBe('30-45 minutes');
  });

  test('formats designer from designers array', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.designer).toBe('Offline Fixture Author');
  });

  test('preserves objective from extract', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.objective).toContain('merchant');
  });

  test('preserves components array', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.components).toHaveLength(7);
    expect(result.components[0].name).toBe('Goods cards');
  });

  test('preserves setup array', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.setup).toHaveLength(7);
  });

  test('preserves turn structure', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.turnStructure.phases).toEqual(['Move', 'Trade', 'Refresh']);
  });

  test('preserves core mechanic', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.coreMechanic.name).toBe('Market Timing');
  });

  test('preserves scoring', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.scoring.winCondition).toContain('most coins');
  });

  test('preserves edge cases', () => {
    const result = normalizeRealInput(loadMetadata(), loadExtract());
    expect(result.edgeCases).toHaveLength(4);
  });

  test('output is deterministic across repeated calls', () => {
    const a = normalizeRealInput(loadMetadata(), loadExtract());
    const b = normalizeRealInput(loadMetadata(), loadExtract());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('throws on missing metadata', () => {
    expect(() => normalizeRealInput(null, loadExtract())).toThrow('metadata is required');
  });

  test('throws on missing extract', () => {
    expect(() => normalizeRealInput(loadMetadata(), null)).toThrow('rulebook extract is required');
  });

  test('throws on missing metadata.slug', () => {
    const meta = loadMetadata();
    delete meta.slug;
    expect(() => normalizeRealInput(meta, loadExtract())).toThrow('metadata.slug is required');
  });

  test('throws on missing extract.objective', () => {
    const ext = loadExtract();
    delete ext.objective;
    expect(() => normalizeRealInput(loadMetadata(), ext)).toThrow('extract.objective is required');
  });

  test('throws on empty components', () => {
    const ext = loadExtract();
    ext.components = [];
    expect(() => normalizeRealInput(loadMetadata(), ext)).toThrow('non-empty array');
  });
});


describe('normalizeRealInput — stellar-drift fixture', () => {
  test('produces canonical fixture with correct gameId and gameName', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.gameId).toBe('stellar-drift');
    expect(result.gameName).toBe('Stellar Drift');
  });

  test('maps player count from metadata', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.playerCount).toEqual({ min: 1, max: 4 });
  });

  test('formats duration from equal min/max playtime', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.duration).toBe('20 minutes');
  });

  test('joins multiple designers', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.designer).toBe('Offline Fixture Author, Second Designer');
  });

  test('preserves objective from extract', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.objective).toContain('asteroid field');
  });

  test('preserves components array', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.components).toHaveLength(6);
    expect(result.components[0].name).toBe('Navigation tiles');
  });

  test('preserves setup array', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.setup).toHaveLength(6);
  });

  test('preserves turn structure with different phases', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.turnStructure.phases).toEqual(['Draw', 'Place', 'Drift']);
  });

  test('preserves cooperative core mechanic', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.coreMechanic.name).toBe('Cooperative Tile Placement');
  });

  test('preserves cooperative scoring', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.scoring.winCondition).toContain('ship-to-gate path');
  });

  test('preserves edge cases', () => {
    const result = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(result.edgeCases).toHaveLength(4);
  });

  test('output is deterministic across repeated calls', () => {
    const a = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    const b = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('output differs from sakura-market', () => {
    const sakura = normalizeRealInput(loadMetadata(), loadExtract());
    const stellar = normalizeRealInput(loadStellarMetadata(), loadStellarExtract());
    expect(stellar.gameId).not.toBe(sakura.gameId);
    expect(stellar.gameName).not.toBe(sakura.gameName);
    expect(stellar.turnStructure.phases).not.toEqual(sakura.turnStructure.phases);
  });
});
