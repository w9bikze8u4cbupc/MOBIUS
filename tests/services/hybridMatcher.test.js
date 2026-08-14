import { rankInventoryCandidates, ruleBasedMatch } from '../../src/services/hybridMatcher.js';

describe('inventory-guided hybrid matching', () => {
  const component = {
    id: 'comp-card',
    name: 'Ocean Card',
    category: 'card',
    quantity: 12,
    sourcePage: 4,
  };
  const images = [
    {
      id: 'img-ocean-card',
      source: 'hephaestus',
      label: 'Ocean Card artwork',
      type: 'card',
      metadata: { classification: 'card', page: 4, curation: { score: 0.9, candidate: true } },
      curation: { score: 0.9, candidate: true },
    },
    {
      id: 'img-uncertain',
      source: 'hephaestus',
      label: 'blue star decoration',
      type: 'other',
      metadata: { classification: 'other', curation: { score: 0.4, candidate: true } },
      curation: { score: 0.4, candidate: true },
    },
  ];

  test('returns ranked candidates with explainable reasons', () => {
    const ranked = rankInventoryCandidates([component], images)['comp-card'];
    expect(ranked[0]).toMatchObject({ imageId: 'img-ocean-card', autoLink: true });
    expect(ranked[0].score).toBeGreaterThanOrEqual(0.72);
    expect(ranked[0].reasons.join(' ')).toMatch(/category|name|page|curation/i);
    expect(ranked[1].autoLink).toBe(false);
  });

  test('auto-links only high-confidence candidates and leaves uncertain assets reviewable', () => {
    const result = ruleBasedMatch([component], images);
    expect(result.matches).toEqual({ 'comp-card': ['img-ocean-card'] });
    expect(result.rankedCandidates['comp-card'][1].autoLink).toBe(false);
  });
});

  test('recognizes currency aliases as a category match', () => {
    const ranked = rankInventoryCandidates(
      [{ id: 'comp-pearl', name: 'Pearls', category: 'currency' }],
      [{ id: 'img-pearl', source: 'hephaestus', label: 'Pearl coin', type: 'other', metadata: { classification: 'currency', curation: { candidate: true, score: 0.8 } }, curation: { candidate: true, score: 0.8 } }],
    )['comp-pearl'];
    expect(ranked[0].reasons).toContain('category/type match');
  });


test('never auto-links a blank board-like candidate to game board from generic category and area scoring', () => {
  const result = ruleBasedMatch(
    [{ id: 'comp-game-board', name: 'game board', category: 'board', quantity: null, sourcePage: 2, reviewRequired: true, eligibility: 'setup', inferenceReason: 'Setup-derived physical object; confirm this component before matching.' }],
    [{
      id: 'img-blank-board',
      source: 'hephaestus',
      label: 'Native board image',
      type: 'board',
      metadata: { classification: 'board', page: 2, confidence: 1, curation: { candidate: true, score: 1, lowInformation: true } },
      curation: { candidate: true, score: 1, lowInformation: true },
    }],
  );

  expect(result.matches).toEqual({});
  expect(result.rankedCandidates['comp-game-board'][0]).toMatchObject({ imageId: 'img-blank-board', autoLink: false });
  expect(result.rankedCandidates['comp-game-board'][0].reasons).toEqual(expect.arrayContaining([
    'category/type match',
    'same source page',
    'low-information asset; operator review required',
  ]));
});
