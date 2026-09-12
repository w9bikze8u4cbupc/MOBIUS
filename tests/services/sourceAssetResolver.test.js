const path = require('node:path');
const {
  rankSourceAssetCandidates,
  resolveSourceAssets,
  normalizeVisualReferents,
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

test('normalizes a source-grounded component binding into resolver semantics without auto-accepting it', () => {
  const normalized = normalizeVisualReferents({
    sourceAssets: [asset('native-token', { sourceAuthority: 'NATIVE_EMBEDDED', cropCompleteness: 'unknown', cropPurity: 'unknown' })],
    componentEvidence: {
      assets: [{ id: 'native-token', sourceImage: existingFile, pageNumber: 3, componentName: 'Native token', category: 'token', reviewState: 'accepted' }],
      componentBindings: [{ componentId: 'component-coin', componentName: 'Coin token', category: 'token', assetId: 'native-token', confidence: 0.59, reviewState: 'needs_review' }],
    },
  });
  const candidate = normalized.assets[0];
  expect(candidate.semanticObjects).toEqual(expect.arrayContaining(['component-coin', 'Coin token']));
  expect(candidate.componentRefs).toContain('component-coin');
  expect(normalized.unresolvedBindings).toHaveLength(1);
  expect(resolveSourceAssets({ atom: { id: 'coin', visualRequirement: { requiredObjects: ['component-coin'] } }, candidates: normalized.assets }).status).not.toBe('AUTO_ACCEPTED');
});

test('rejects an otherwise detailed candidate when its explicit physical state disagrees', () => {
  const result = resolveSourceAssets({
    atom: { id: 'hidden-deck', visualRequirement: { requiredObjects: ['deck'], physicalStateRequirement: { faceState: 'FACE_DOWN' } } },
    candidates: [asset('face-up-deck', { semanticObjects: ['deck'], faceState: 'FACE_UP' })],
  });
  expect(result.status).toBe('UNRESOLVED');
  expect(result.ranked[0].violations).toContain('physical-state-mismatch:faceState');
});

test('zero-candidate review is actionable with a deterministic operator request', () => {
  const result = resolveSourceAssets({ atom: { id: 'missing-token', visualRequirement: { requiredObjects: ['rare token'], purpose: 'teach the token' } }, candidates: [] });
  expect(result.reviewItem).toMatchObject({
    id: 'visual-review:missing-token',
    scopeType: 'VISUAL_REQUIREMENT',
    requiredObjects: ['rare token'],
    failureClassification: ['TRUE_ASSET_MISSING'],
  });
  expect(result.reviewItem.recommendedOperatorAction).toMatch(/authoritative source asset/i);
  expect(result.reviewItem.candidates).toEqual([]);
});

test('a deterministic focused crop can recover a valid candidate while an incomplete parent remains rejected', () => {
  const atom = { id: 'board-region', visualRequirement: { requiredObjects: ['board'] } };
  const resolved = resolveSourceAssets({
    atom,
    candidates: [
      asset('unverified-parent', { semanticObjects: ['board'], cropCompleteness: 'unknown', cropPurity: 'unknown' }),
      asset('focused-source-crop', { semanticObjects: ['board'], sourceAuthority: 'HIGH_DPI_PAGE_CROP', cropCompleteness: 'complete', cropPurity: 'clean' }),
    ],
    displayBounds: { width: 800, height: 500 },
  });
  expect(resolved.status).toBe('AUTO_ACCEPTED');
  expect(resolved.selectedAssets[0].id).toBe('focused-source-crop');
  expect(resolved.ranked.find((entry) => entry.assetId === 'unverified-parent').violations).toEqual(expect.arrayContaining(['crop-completeness-unverified', 'crop-purity-unverified']));
});

test('review IDs and ranked evidence are replay-stable', () => {
  const input = { atom: { id: 'ambiguous-board', visualRequirement: { requiredObjects: ['board'] } }, candidates: [asset('a'), asset('b')] };
  const first = resolveSourceAssets(input);
  const second = resolveSourceAssets(input);
  expect(first.reviewItem.id).toBe(second.reviewItem.id);
  expect(first.reviewItem.candidates).toEqual(second.reviewItem.candidates);
  expect(first.reviewItem.candidates).toHaveLength(2);
});
