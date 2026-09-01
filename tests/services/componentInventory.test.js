import {
  COMPONENT_INVENTORY_CONTRACT_VERSION,
  deterministicInventory,
  findComponentSection,
  parseQuantity,
  validateComponentEligibility,
} from '../../src/services/componentInventory.js';

describe('component inventory extraction', () => {
  test('exposes a checkpoint version for deterministic inventory changes', () => {
    expect(COMPONENT_INVENTORY_CONTRACT_VERSION).toBe('component-inventory-v2-source-fallback');
  });

  test.each([
    ['Components', true],
    ["What's in the Box:", true],
    ['Game Contents', true],
    ['Material', true],
    ['Composants', true],
    ['Contenu de la boîte', true],
    ['Matériel', true],
    ['Éléments du jeu', true],
  ])('detects EN/FR component heading %s', (heading, found) => {
    expect(findComponentSection(`${heading}\n71 Exploration cards\nSetup\nShuffle the deck`).found).toBe(found);
  });

  test.each([
    ['71 Exploration cards', 'Exploration cards', 71],
    ['Lords: 35', 'Lords', 35],
    ['20 Locations', 'Locations', 20],
    ['20 Monster tokens', 'Monster tokens', 20],
  ])('parses deterministic quantity format %s', (line, name, quantity) => {
    const parsed = parseQuantity(line);
    expect(parsed.name).toBe(name);
    expect(parsed.quantity).toBe(quantity);
  });

  test('preserves qualifiers for of-each and per-player quantities', () => {
    expect(parseQuantity('10 of each Key token')).toMatchObject({ name: 'Key token', quantity: 10, qualifier: 'of each' });
    expect(parseQuantity('2 Exploration cards per player')).toMatchObject({ name: 'Exploration cards', quantity: 2, qualifier: 'per player' });
  });

  test('admits only quantified named physical records from a contents section', () => {
    const result = deterministicInventory([
      'Components',
      '71 Exploration cards',
      '20 Monster tokens',
      '10 Key tokens',
      'Setup',
      'Shuffle the deck',
    ].join('\n'));

    expect(result.sectionFound).toBe(true);
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Exploration cards', category: 'card', quantity: 71, reviewRequired: false, eligibility: 'contents', matchEligible: true }),
      expect.objectContaining({ name: 'Monster tokens', category: 'token', quantity: 20, reviewRequired: false, eligibility: 'contents', matchEligible: true }),
      expect.objectContaining({ name: 'Key tokens', category: 'token', quantity: 10, reviewRequired: false, eligibility: 'contents', matchEligible: true }),
    ]));
    expect(result.components).toHaveLength(3);
  });

  test('rejects generic and sentence-like evidence when no component section exists', () => {
    const result = deterministicInventory('Then, turn over the top six cards and place them in the Court.\ncard\nTrack');
    expect(result.sectionFound).toBe(false);
    expect(result.reviewRequired).toBe(true);
    expect(result.components).toHaveLength(0);
    expect(result.rawRows.every((row) => row.reviewRequired && row.sourceQuote)).toBe(true);
    expect(result.rawRows.every((row) => /Excluded non-component evidence/.test(row.reason))).toBe(true);
  });

  test('does not treat an empty table of contents as the component inventory', () => {
    const result = deterministicInventory([
      {
        number: 1,
        blocks: [
          { text: 'CONTENTS' },
          { text: 'Game Overview 3' },
          { text: 'GAME OVERVIEW' },
          { text: 'The game board is placed in the center.' },
          { text: 'Resource cubes are stored on the player board.' },
        ],
      },
    ]);

    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'game board', eligibility: 'setup', reviewRequired: true }),
      expect.objectContaining({ name: 'cubes', eligibility: 'setup', reviewRequired: true }),
    ]));
    expect(result.coverage.validPhysicalComponentCount).toBe(0);
    expect(result.reviewRequired).toBe(true);
  });
});

describe('strict eligibility validation', () => {
  test('accepts a quantified contents record and setup-derived physical object', () => {
    expect(validateComponentEligibility({
      name: '71 Exploration cards',
      parsed: { quantity: 71 },
      source: { sectionIndex: 0 },
    }).eligible).toBe(true);
    expect(validateComponentEligibility({
      name: 'Threat token',
      parsed: { quantity: null },
      source: { sectionIndex: 0 },
      inferred: true,
    })).toMatchObject({ eligible: true, reviewRequired: true, kind: 'setup' });
  });

  test.each([
    'Then, turn over the top six cards and place them in the Court.',
    'EXPLORATION TRACK',
    'Track',
    'tile',
    'Front of a Location',
    'Back of the Lords',
  ])('rejects non-component candidate %s', (name) => {
    expect(validateComponentEligibility({ name, parsed: {}, source: { sectionIndex: 0 } })).toMatchObject({
      eligible: false,
      reviewRequired: true,
      reason: expect.stringMatching(/Excluded non-component evidence/),
    });
  });
});

describe('Abyss contents coverage', () => {
  const abyssContents = require('../fixtures/component-inventory/abyss-contents.json');
  const falseComponentNames = [
    'Then, turn over the top six cards and place them in the Court.',
    'EXPLORATION TRACK',
    'Track',
    'tile',
    'Front of a Location',
    'Back of the Lords',
  ];

  test('preserves every extracted contents row while admitting only matching-eligible physical objects', () => {
    const result = deterministicInventory({ pages: abyssContents.pages });
    const componentNames = result.components.map((component) => component.name);

    expect(result.sectionFound).toBe(true);
    expect(result.candidateHeadings).toEqual(expect.arrayContaining([
      expect.objectContaining({ heading: 'Contents & Setup', sourcePage: 2 }),
    ]));
    expect(result.coverage.rawRowCount).toBeGreaterThan(0);
    expect(result.rawRows).toHaveLength(result.coverage.rawRowCount);
    expect(result.coverage.silentlyDroppedRowCount).toBe(0);
    expect(result.rawRows.every((row) => row.status === 'parsed' || row.reviewRequired)).toBe(true);
    expect(result.unparsedRows.every((row) => row.reviewRequired && row.sourceQuote)).toBe(true);
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Exploration cards', quantity: 71, sourcePage: 2, category: 'card', eligibility: 'contents' }),
      expect.objectContaining({ name: 'Lords', quantity: 35, sourcePage: 2, category: 'card', eligibility: 'contents' }),
      expect.objectContaining({ name: 'Locations', quantity: 20, sourcePage: 3, category: 'tile', eligibility: 'contents' }),
      expect.objectContaining({ name: 'Monster tokens', quantity: 20, sourcePage: 3, category: 'token', eligibility: 'contents' }),
      expect.objectContaining({ name: 'game board', sourcePage: 2, category: 'board', reviewRequired: true, eligibility: 'setup' }),
      expect.objectContaining({ name: 'Threat token', sourcePage: 3, category: 'token', reviewRequired: true, eligibility: 'setup' }),
      expect.objectContaining({ name: 'Key tokens', quantity: 10, sourcePage: 3, category: 'token', reviewRequired: true, eligibility: 'setup' }),
      expect.objectContaining({ name: 'Pearl', quantity: 1, sourcePage: 3, category: 'currency', reviewRequired: true, eligibility: 'setup' }),
      expect.objectContaining({ name: 'plastic cups', sourcePage: 3, reviewRequired: true, eligibility: 'setup' }),
    ]));
    falseComponentNames.forEach((name) => expect(componentNames).not.toContain(name));
    expect(result.rawRows.some((row) => row.sourceQuote === 'Front of a Location' && /Excluded non-component evidence/.test(row.reason))).toBe(true);
    expect(result.coverage).toMatchObject({
      validPhysicalComponentCount: 4,
      setupDerivedComponentCount: 5,
      nonComponentEvidenceCount: expect.any(Number),
    });
  });
});

test('parses semicolon-separated and table-like rows without admitting generic labels', () => {
  const result = deterministicInventory('Components\n71 Exploration cards; 4 tokens    2 dice\nSetup');
  expect(result.coverage).toMatchObject({ rawRowCount: 3, silentlyDroppedRowCount: 0 });
  expect(result.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Exploration cards', quantity: 71, category: 'card' }),
    expect.objectContaining({ name: 'dice', quantity: 2, category: 'dice' }),
  ]));
  expect(result.components.map((component) => component.name)).not.toContain('tokens');
});

test('parses a wrapped quantity-first component row while preserving source-row coverage', () => {
  const result = deterministicInventory('Components\n71 Exploration\ncards\nSetup');
  expect(result.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Exploration cards', quantity: 71, category: 'card' }),
  ]));
  expect(result.coverage).toMatchObject({ rawRowCount: 2, silentlyDroppedRowCount: 0 });
  expect(result.rawRows.every((row) => row.status === 'parsed' || row.reviewRequired)).toBe(true);
});
