const { auditFocusCueTimeline, compileFocusCueTimeline } = require('../../src/services/focusCueTimeline.cjs');

describe('clause-level visual focus', () => {
  const regions = {
    constructionCost: { x: 0.05, y: 0.2, width: 0.2, height: 0.1 },
    productionOrEffect: { x: 0.4, y: 0.2, width: 0.2, height: 0.1 },
  };

  test('moves focus with the narration clause', () => {
    const timeline = compileFocusCueTimeline({
      sceneId: 'construct', durationSec: 10, cardSemanticRegions: regions,
      clauses: [
        { narrationClause: 'payer le coût', startSec: 1, endSec: 4, assetId: 'card', semanticRegion: 'constructionCost' },
        { narrationClause: 'résoudre la production', startSec: 5, endSec: 8, assetId: 'card', semanticRegion: 'productionOrEffect' },
      ],
    });
    expect(timeline.validation.status).toBe('PASS');
    expect(timeline.cues.map((cue) => cue.semanticRegion)).toEqual(['constructionCost', 'productionOrEffect']);
  });

  test('rejects missing semantic regions and conflicting overlaps', () => {
    const timeline = compileFocusCueTimeline({
      sceneId: 'bad', durationSec: 10, cardSemanticRegions: regions,
      clauses: [
        { narrationClause: 'cost', startSec: 1, endSec: 6, assetId: 'card', semanticRegion: 'constructionCost' },
        { narrationClause: 'effect', startSec: 4, endSec: 8, assetId: 'card', semanticRegion: 'unknown' },
      ],
    });
    expect(timeline.validation.status).toBe('FAIL');
    expect(auditFocusCueTimeline({ timeline }).status).toBe('FAIL');
  });
});
