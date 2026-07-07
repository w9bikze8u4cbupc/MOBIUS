/**
 * Unit tests for validate-real-input-source-contract.cjs
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const {
  validateMetadata,
  validateRulebookExtract,
  validateSourceContract,
} = require('../../scripts/validate-real-input-source-contract.cjs');

const CLI_SCRIPT = path.resolve(__dirname, '../../scripts/validate-real-input-source-contract.cjs');

// ---------------------------------------------------------------------------
// Helpers: valid baseline objects
// ---------------------------------------------------------------------------
function validMetadata() {
  return {
    slug: 'test-game',
    title: 'Test Game',
    playerCount: { min: 2, max: 4 },
    designers: ['Author One'],
    playtimeMinutes: { min: 30, max: 45 },
    description: 'A test game.',
  };
}

function validExtract() {
  return {
    objective: 'Win the game by scoring points.',
    components: [{ name: 'Cards', quantity: 50, category: 'cards' }],
    setup: ['Place the board in the center.'],
    turnStructure: {
      phases: ['Draw', 'Play'],
      description: 'Draw a card, then play a card.',
      endCondition: 'Deck runs out.',
    },
    coreMechanic: { name: 'Card Play', description: 'Play cards to score.' },
    scoring: { description: 'Count points.', winCondition: 'Most points wins.' },
  };
}

// ---------------------------------------------------------------------------
// validateMetadata
// ---------------------------------------------------------------------------
describe('validateMetadata', () => {
  test('passes with valid metadata', () => {
    const result = validateMetadata(validMetadata());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('fails on null', () => {
    const result = validateMetadata(null);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('non-null object');
  });

  test('fails on missing slug', () => {
    const meta = validMetadata();
    delete meta.slug;
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('slug'))).toBe(true);
  });

  test('fails on empty title', () => {
    const meta = validMetadata();
    meta.title = '';
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('title'))).toBe(true);
  });

  test('fails on missing playerCount', () => {
    const meta = validMetadata();
    delete meta.playerCount;
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('playerCount'))).toBe(true);
  });

  test('fails on playerCount.min > playerCount.max', () => {
    const meta = validMetadata();
    meta.playerCount = { min: 5, max: 2 };
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('must not exceed'))).toBe(true);
  });

  test('fails on empty designers array', () => {
    const meta = validMetadata();
    meta.designers = [];
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('designers'))).toBe(true);
  });

  test('fails on designer with empty string', () => {
    const meta = validMetadata();
    meta.designers = ['Good', ''];
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('designers[1]'))).toBe(true);
  });

  test('fails on invalid playtimeMinutes', () => {
    const meta = validMetadata();
    meta.playtimeMinutes = { min: -5, max: 30 };
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('playtimeMinutes.min'))).toBe(true);
  });

  test('passes without playtimeMinutes (optional)', () => {
    const meta = validMetadata();
    delete meta.playtimeMinutes;
    const result = validateMetadata(meta);
    expect(result.passed).toBe(true);
  });

  test('fails on non-string description', () => {
    const meta = validMetadata();
    meta.description = 123;
    const result = validateMetadata(meta);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateRulebookExtract
// ---------------------------------------------------------------------------
describe('validateRulebookExtract', () => {
  test('passes with valid extract', () => {
    const result = validateRulebookExtract(validExtract());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('fails on null', () => {
    const result = validateRulebookExtract(null);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('non-null object');
  });

  test('fails on missing objective', () => {
    const ext = validExtract();
    delete ext.objective;
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('objective'))).toBe(true);
  });

  test('fails on empty components', () => {
    const ext = validExtract();
    ext.components = [];
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('components'))).toBe(true);
  });

  test('fails on component without name', () => {
    const ext = validExtract();
    ext.components = [{ quantity: 5 }];
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('components[0].name'))).toBe(true);
  });

  test('fails on empty setup', () => {
    const ext = validExtract();
    ext.setup = [];
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('setup'))).toBe(true);
  });

  test('fails on setup with empty string', () => {
    const ext = validExtract();
    ext.setup = ['Good step', ''];
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('setup[1]'))).toBe(true);
  });

  test('fails on missing turnStructure', () => {
    const ext = validExtract();
    delete ext.turnStructure;
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('turnStructure'))).toBe(true);
  });

  test('fails on empty turnStructure.phases', () => {
    const ext = validExtract();
    ext.turnStructure.phases = [];
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('turnStructure.phases'))).toBe(true);
  });

  test('fails on missing coreMechanic', () => {
    const ext = validExtract();
    delete ext.coreMechanic;
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('coreMechanic'))).toBe(true);
  });

  test('fails on missing scoring', () => {
    const ext = validExtract();
    delete ext.scoring;
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('scoring'))).toBe(true);
  });

  test('fails on missing scoring.winCondition', () => {
    const ext = validExtract();
    ext.scoring = { description: 'Count.' };
    const result = validateRulebookExtract(ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('winCondition'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSourceContract (combined + identity)
// ---------------------------------------------------------------------------
describe('validateSourceContract', () => {
  test('passes with valid metadata + extract', () => {
    const result = validateSourceContract(validMetadata(), validExtract());
    expect(result.passed).toBe(true);
  });

  test('combines errors from both metadata and extract', () => {
    const meta = validMetadata();
    delete meta.slug;
    const ext = validExtract();
    delete ext.objective;
    const result = validateSourceContract(meta, ext);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('slug'))).toBe(true);
    expect(result.errors.some((e) => e.includes('objective'))).toBe(true);
  });

  test('detects identity mismatch: slug', () => {
    const meta = validMetadata();
    const registry = { slug: 'different-slug', gameName: 'Test Game' };
    const result = validateSourceContract(meta, validExtract(), registry);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('Identity mismatch') && e.includes('slug'))).toBe(true);
  });

  test('detects identity mismatch: gameName', () => {
    const meta = validMetadata();
    const registry = { slug: 'test-game', gameName: 'Different Name' };
    const result = validateSourceContract(meta, validExtract(), registry);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('Identity mismatch') && e.includes('gameName'))).toBe(true);
  });

  test('passes identity check when registry matches', () => {
    const meta = validMetadata();
    const registry = { slug: 'test-game', gameName: 'Test Game' };
    const result = validateSourceContract(meta, validExtract(), registry);
    expect(result.passed).toBe(true);
  });

  test('passes without registry entry (no identity check)', () => {
    const result = validateSourceContract(validMetadata(), validExtract(), null);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI tests
// ---------------------------------------------------------------------------
describe('validate-real-input-source-contract CLI', () => {
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

  test('exits 2 for unknown fixture slug', () => {
    const { exitCode, stderr } = runCLI(['--fixture', 'nonexistent']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Unknown fixture slug');
  });

  test('exits 0 for --all with valid fixtures', () => {
    const { exitCode, stdout } = runCLI(['--all']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('ALL PASSED');
  });

  test('exits 0 for --fixture sakura-market', () => {
    const { exitCode, stdout } = runCLI(['--fixture', 'sakura-market']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('PASSED');
  });

  test('exits 0 for --fixture stellar-drift', () => {
    const { exitCode, stdout } = runCLI(['--fixture', 'stellar-drift']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('PASSED');
  });
});
