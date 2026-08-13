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
