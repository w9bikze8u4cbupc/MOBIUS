const storage = require('../../src/services/canonicalProductionStateStorage.cjs');

function richCandidate(id, suffix = '') {
  return {
    assetId: id,
    thumbnailPath: `C:/project/production/${id}.png`,
    sourceRefs: [{ page: 4, excerpt: `Official evidence ${suffix}`.repeat(200) }],
    provenance: { page: 4, hash: `hash-${suffix}` },
    semanticScore: 0.7,
    rejectionReasons: ['crop-completeness-unverified'],
    objectAnalysisAttempts: [{ kind: 'COMPONENT', evidence: `measured ${suffix}`.repeat(500) }],
  };
}

function state() {
  const asset = { id: 'asset', filePath: 'C:/project/production/asset.png', width: 1000, height: 700, sourceRefs: [{ page: 4 }] };
  const candidate = richCandidate('candidate', 'a');
  return {
    contract: 'compiler-v3', projectId: 'fixture', assets: [asset, candidate], selectedAssets: [asset],
    visualReferentNormalization: { assets: [asset], bindings: [], unresolvedBindings: [] },
    sourceSelections: Array.from({ length: 8 }, (_, index) => ({
      ruleAtomId: `atom-${index}`, status: 'REVIEW_REQUIRED', confidence: 0.3, reviewState: 'needs_review',
      selectedAssets: [asset], suggestedAssets: [asset], ranked: [{ candidate, confidence: 0.3, semanticScore: 0.3, valid: false, hardViolations: ['crop'] }],
      referentSelections: [{ requiredObject: 'board', selectedAssets: [asset], suggestedAssets: [asset], candidateAssessments: [['asset', 0.3, ['crop']]] }],
      reviewItem: { id: `review-${index}` },
    })),
    visualPlans: Array.from({ length: 8 }, (_, index) => {
      const gameState = { setup: `setup-${index}`, evidence: `state ${index} `.repeat(500) };
      const stateStages = [{ label: 'before', evidence: `stage ${index} `.repeat(500) }];
      return {
        ruleAtomId: `atom-${index}`,
        gameState,
        stateStages,
        sourceRefs: candidate.sourceRefs,
        cockpit: {
          gameState,
          stateStages,
          assetCandidates: [candidate],
          sourceReferences: candidate.sourceRefs,
          reviewReason: 'Verify the measured source component.',
        },
      };
    }),
    scenes: Array.from({ length: 8 }, (_, index) => ({ id: `scene-${index}`, atomId: `atom-${index}`, physicalState: { ruleAtomId: `atom-${index}` }, visualPlan: { ruleAtomId: `atom-${index}` }, canonicalVisualPlan: { ruleAtomId: `atom-${index}` } })),
    reviewItems: Array.from({ length: 8 }, (_, index) => ({ id: `review-${index}`, candidates: [candidate] })),
  };
}

test('canonical persistence keeps rich candidate evidence once while state remains under a measured transport budget', () => {
  const full = state();
  const result = storage.createCompactCanonicalProductionState(full, { projectId: 'fixture', sourceSha256: 'a'.repeat(64) });
  expect(result.compactBytes).toBeLessThan(storage.CANONICAL_STATE_BUDGET_BYTES);
  expect(result.compact.reviewItems[0].candidates[0]).toEqual(expect.objectContaining({ assetId: 'candidate', candidateEvidenceRef: expect.any(String) }));
  expect(Object.keys(result.artifact.candidateEvidence)).toHaveLength(1);
  const hydrated = storage.hydrateCanonicalProductionState(result.compact, result.artifact);
  expect(hydrated.assets[0]).toEqual(full.assets[0]);
  expect(hydrated.reviewItems[0].candidates[0]).toEqual(full.reviewItems[0].candidates[0]);
  expect(hydrated.sourceSelections[0].selectedAssets[0]).toEqual(full.assets[0]);
  expect(hydrated.sourceSelections[0].ranked).toEqual(full.sourceSelections[0].ranked);
  expect(hydrated.visualPlans).toEqual(full.visualPlans);
  expect(result.compact.visualPlans[0].cockpit.gameState).toBeUndefined();
  expect(result.compact.visualPlans[0].cockpitDerivation.assetCandidateEvidenceRefs[0])
    .toEqual(expect.objectContaining({ candidateEvidenceRef: expect.any(String) }));
  const storedSelection = result.artifact.selectionEvidence[result.compact.sourceSelections[0].visualEvidenceSelectionRef];
  expect(storedSelection.rankingReferenceContract).toBe(storage.SELECTION_RANKING_REFERENCE_CONTRACT);
  expect(storedSelection.ranked[0]).toEqual(expect.objectContaining({ candidateAssetId: 'candidate' }));
  expect(storedSelection.ranked[0].candidate).toBeUndefined();
});

test('sidecar checksum and measured size are strict', () => {
  const result = storage.createCompactCanonicalProductionState(state(), { projectId: 'fixture' });
  const changed = JSON.parse(JSON.stringify(result.artifact));
  changed.candidateEvidence[Object.keys(changed.candidateEvidence)[0]].semanticScore = 0.1;
  expect(() => storage.validateArtifact(changed, result.artifactDescriptor)).toThrow(/checksum/);
  expect(() => storage.createCompactCanonicalProductionState(state(), { projectId: 'fixture', relativePath: '../outside.json' })).toThrow(/path/);
});

test('the compact representation is deterministic and does not duplicate sidecar evidence on replay', () => {
  const full = state();
  const first = storage.createCompactCanonicalProductionState(full, { projectId: 'fixture' });
  const second = storage.createCompactCanonicalProductionState(full, { projectId: 'fixture' });
  expect(second.compact).toEqual(first.compact);
  expect(second.artifact).toEqual(first.artifact);
});
