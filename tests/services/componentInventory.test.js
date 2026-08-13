import {
  deterministicInventory,
  extractComponentInventory,
  findComponentSection,
  parseQuantity,
} from '../../src/services/componentInventory.js';

describe('component inventory extraction', () => {
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
    expect(findComponentSection(`${heading}\n7 Cards\nSetup\nShuffle the deck`).found).toBe(found);
  });

  test.each([
    ['7 Cards', 'Cards', 7],
    ['Cards: 7', 'Cards', 7],
    ['Cards (7)', 'Cards', 7],
    ['4 cartes', 'cartes', 4],
    ['10 jetons', 'jetons', 10],
  ])('parses deterministic quantity format %s', (line, name, quantity) => {
    const parsed = parseQuantity(line);
    expect(parsed.name).toBe(name);
    expect(parsed.quantity).toBe(quantity);
  });

  test('preserves qualifiers for of-each and per-player quantities', () => {
    expect(parseQuantity('10 of each token')).toMatchObject({ name: 'token', quantity: 10, qualifier: 'of each' });
    expect(parseQuantity('2 cards per player')).toMatchObject({ name: 'cards', quantity: 2, qualifier: 'per player' });
  });

  test('extracts named records with the required provenance schema', () => {
    const result = deterministicInventory([
      'Components',
      '7 Cards',
      'Cards: 7',
      '4 cartes',
      '10 jetons',
      'Setup',
      'Shuffle the deck',
    ].join('\n'));

    expect(result.sectionFound).toBe(true);
    expect(result.components).toHaveLength(2);
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Cards', category: 'card', quantity: 7, reviewRequired: false }),
      expect.objectContaining({ name: 'jetons', category: 'token', quantity: 10 }),
    ]));
    for (const component of result.components) {
      expect(component).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        normalizedName: expect.any(String),
        category: expect.any(String),
        quantity: expect.any(Number),
        sourcePage: null,
        sourceQuote: expect.any(String),
        confidence: expect.any(Number),
        reviewRequired: expect.any(Boolean),
      }));
    }
  });

  test('returns review-required candidates when no component section exists', () => {
    const result = deterministicInventory('The game includes 3 cards and a board.');
    expect(result.sectionFound).toBe(false);
    expect(result.reviewRequired).toBe(true);
    expect(result.components.length).toBeGreaterThan(0);
    expect(result.components[0].reviewRequired).toBe(true);
  });

  test('uses structured JSON LLM fallback only when configured', async () => {
    const llm = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '[{"name":"Ocean cards","category":"card","quantity":12,"sourcePage":3,"sourceQuote":"12 Ocean cards","confidence":0.9}]' } }],
          }),
        },
      },
    };
    const result = await extractComponentInventory('A rulebook paragraph without a contents heading.', {
      llm,
      llmConfigured: true,
    });
    expect(llm.chat.completions.create).toHaveBeenCalled();
    expect(result.extractionMethod).toBe('deterministic-plus-llm');
    expect(result.components[0]).toMatchObject({ name: 'Ocean cards', quantity: 12, category: 'card', reviewRequired: false });
  });
});
