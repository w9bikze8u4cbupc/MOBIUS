const path = require('node:path');
const {
  rankSourceAssetCandidates,
  resolveSourceAssets,
} = require('../../src/services/sourceAssetResolver.cjs');
const { sourceAuthorityRank } = require('../../src/services/sourceDetailLineage.cjs');

const existingFile = path.resolve(__dirname, '../../package.json');

function asset(id, overrides = {}) {
  return {
    id,
    filePath: existingFile,
    width: 2400,
    height: 1600,
    sourceAuthority: 'OFFICIAL_PUBLISHER_HIGH_RES',
    semanticObjects: ['game board'],
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    reviewState: 'accepted',
    sourceRefs: [{ page: 1 }],
    ...overrides,
  };
}

test('canonical resolver prefers authority and true detail over a weak PDF object', () => {
  const ranked = rankSourceAssetCandidates({
    requirement: { requiredObjects: ['game board'] },
    candidates: [
      asset('tiny-xobject', { width: 219, height: 339, sourceAuthority: 'NATIVE_EMBEDDED' }),
      asset('publisher-master'),
    ],
    displayBounds: { width: 900, height: 600 },
  });
  expect(ranked[0].candidate.id).toBe('publisher-master');
  expect(ranked.find((entry) => entry.candidate.id === 'tiny-xobject').hardViolations).toContain('source-detail-insufficient');
});

test('canonical resolver auto-accepts only an unambiguous high-confidence candidate', () => {
  const atom = { id: 'board-setup', visualRequirement: { requiredObjects: ['game board'] } };
  const resolved = resolveSourceAssets({ atom, candidates: [asset('board')], displayBounds: { width: 900, height: 600 } });
  expect(resolved.status).toBe('AUTO_ACCEPTED');
  expect(resolved.reviewItem).toBeNull();

  const ambiguous = resolveSourceAssets({ atom, candidates: [asset('board-a'), asset('board-b')], displayBounds: { width: 900, height: 600 } });
  expect(ambiguous.status).toBe('REVIEW_REQUIRED');
  expect(ambiguous.reviewItem.status).toBe('needs_visual_review');
});

test('exact-game authorized BGG originals outrank native PDF rasters but not publisher masters', () => {
  expect(sourceAuthorityRank('OFFICIAL_PUBLISHER_HIGH_RES')).toBeGreaterThan(sourceAuthorityRank('OFFICIAL_BGG_ASSET'));
  expect(sourceAuthorityRank('OFFICIAL_BGG_ASSET')).toBeGreaterThan(sourceAuthorityRank('NATIVE_EMBEDDED'));
});
