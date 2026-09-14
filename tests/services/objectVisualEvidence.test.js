const path = require('node:path');
const proof = require('../fixtures/objectEvidence.cjs');
const { normalizeCandidate, evaluateCandidate, normalizeVisualReferents, resolveSourceAssets } = require('../../src/services/sourceAssetResolver.cjs');
const file = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');
const candidate = (overrides = {}) => normalizeCandidate({ id: 'image', filePath: file, width: 1200, height: 1600,
  semanticObjects: ['comp-57'], sourceAuthority: 'OFFICIAL_PUBLISHER_HIGH_RES', cropCompleteness: 'complete', cropPurity: 'clean', reviewState: 'accepted',
  objectVisualEvidence: [proof('image', file, 'comp-57')], ...overrides });
const requirement = { requiredObjects: ['comp-57'] };
test('metadata labels and local complete/clean guarantees alone never validate an object', () => {
  expect(evaluateCandidate(candidate({ objectVisualEvidence: [] }), requirement).valid).toBe(false);
});

test('localization is not final component or scene evidence', () => {
  const localized = candidate({ objectVisualEvidence: [proof('image', file, 'comp-57', { contract: 'mobius-object-visual-evidence-v2', visualRole: 'LOCALIZATION' })] });
  expect(evaluateCandidate(localized, requirement).hardViolations).toContain('localization-not-display-evidence:comp-57');
  const component = candidate({ objectVisualEvidence: [proof('image', file, 'comp-57', { contract: 'mobius-object-visual-evidence-v2', visualRole: 'COMPONENT' })] });
  expect(evaluateCandidate(component, requirement).valid).toBe(true);
  expect(evaluateCandidate(component, { ...requirement, transitionRequired: true }).hardViolations).toContain('composition-state-verification-required:comp-57');
});
test('opaque component identifiers cannot collapse to the shared token comp', () => {
  expect(evaluateCandidate(candidate(), { requiredObjects: ['comp-1'] }).semanticScore).toBe(0);
});
test.each([
  ['wrong-object', { present: false }], ['cut-corner', { complete: false }], ['matte', { isolated: false }],
  ['different-pixels', { imageSha256: '0'.repeat(64) }], ['unknown-state', { stateCompatible: false }],
  ['small-referent', { bbox: [0.1, 0.1, 0.2, 0.2] }], ['clipped-edge', { bbox: [0, 0, 1, 1] }],
  ['local-guess', { method: 'local-layout' }],
])('%s cannot auto-bind', (_, override) => {
  expect(evaluateCandidate(candidate({ objectVisualEvidence: [proof('image', file, 'comp-57', override)] }), requirement).valid).toBe(false);
});
test('measured exact object can pass while changed scene/state cannot reuse its verdict', () => {
  expect(evaluateCandidate(candidate(), requirement).valid).toBe(true);
  expect(evaluateCandidate(candidate(), { ...requirement, evidenceSceneId: 'other-scene' }).valid).toBe(false);
  expect(evaluateCandidate(candidate(), { ...requirement, requiredState: 'DISCARDED' }).valid).toBe(false);
});
test('unknown component names remain hypotheses, without contaminating candidate identity', () => {
  const normalized = normalizeVisualReferents({ sourceAssets: [candidate({ semanticObjects: [] })], componentEvidence: {
    componentBindings: [{ assetId: 'image', componentId: 'comp-1', componentName: 'Board', confidence: 0.5, reviewState: 'needs_review' }],
  } });
  expect(normalized.assets[0].semanticObjects).not.toContain('comp-1');
  expect(normalized.assets[0].bindingHypotheses).toHaveLength(1);
});
test('review candidates are unique and retain all rejection/evidence references', () => {
  const first = resolveSourceAssets({ atom: { id: 'a' }, requirement, candidates: [candidate({ objectVisualEvidence: [] })] });
  const replay = resolveSourceAssets({ atom: { id: 'a' }, requirement, candidates: [candidate({ objectVisualEvidence: [] })] });
  expect(first).toEqual(replay);
  expect(first.reviewItem.candidates[0].rejectionReasons).toContain('object-pixel-evidence-missing:comp-57');
});
