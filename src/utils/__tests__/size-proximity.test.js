import { scoreImageCandidate } from '../scoring.js';

describe('Size and Proximity Scoring', () => {
  test('sizeScore increases with area', () => {
    const a = scoreImageCandidate({ w: 200, h: 150, sectionDistance: 3, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    const b = scoreImageCandidate({ w: 400, h: 300, sectionDistance: 3, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    expect(b.scores.sizeScore).toBeGreaterThan(a.scores.sizeScore);
  });

  test('proximityScore increases when closer to components', () => {
    const far = scoreImageCandidate({ w: 320, h: 240, sectionDistance: 6, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    const near = scoreImageCandidate({ w: 320, h: 240, sectionDistance: 1, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    expect(near.scores.proximityScore).toBeGreaterThan(far.scores.proximityScore);
  });

  test('sizeScore is capped to prevent outliers', () => {
    // Test with a very large image (10MP)
    const large = scoreImageCandidate({ w: 4000, h: 2500, sectionDistance: 3, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    // Size score should be capped at 1.0 (normalized to 1MP)
    expect(large.scores.sizeScore).toBeLessThanOrEqual(1.0);
  });

  test('proximityScore uses exponential decay', () => {
    const veryClose = scoreImageCandidate({ w: 320, h: 240, sectionDistance: 0, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    const close = scoreImageCandidate({ w: 320, h: 240, sectionDistance: 1, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    const far = scoreImageCandidate({ w: 320, h: 240, sectionDistance: 5, providerWeight: 1, qualityFocus: 0.1, uniquenessScore: 0.5 });
    
    // Very close should have higher proximity score than close
    expect(veryClose.scores.proximityScore).toBeGreaterThan(close.scores.proximityScore);
    // Close should have higher proximity score than far
    expect(close.scores.proximityScore).toBeGreaterThan(far.scores.proximityScore);
    // All should be between 0 and 1
    expect(veryClose.scores.proximityScore).toBeGreaterThanOrEqual(0);
    expect(far.scores.proximityScore).toBeLessThanOrEqual(1);
  });
});