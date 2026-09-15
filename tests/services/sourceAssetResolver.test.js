const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {
  rankSourceAssetCandidates,
  resolveSourceAssets,
  resolveInstructionalSequenceSources,
  normalizeVisualReferents,
  buildAuthorizedRecoveryTargets,
  authorizedCandidatesForVisualAnalysis,
  recoverOfficialPublisherCandidates,
  productEvidenceFromHtml,
  publisherOriginsFromDocumentMap,
} = require('../../src/services/sourceAssetResolver.cjs');
const { sourceAuthorityRank } = require('../../src/services/sourceDetailLineage.cjs');

const existingFile = path.resolve(__dirname, '../../package.json');
const publisherFixture = path.resolve(__dirname, '../../src/assets/branding/les-jeux-mobius-banner-canonical.png');
const proof = require('../fixtures/objectEvidence.cjs');

test('native authority separators are normalized without filename-derived authority', () => {
  const { normalizeCandidate } = require('../../src/services/sourceAssetResolver.cjs');
  expect(normalizeCandidate({ extractionMethod: 'pymupdf-native-raster' }).sourceAuthority).toBe('NATIVE_EMBEDDED');
  expect(normalizeCandidate({ filePath: 'pymupdf-native-raster.png' }).sourceAuthority).toBe('UNKNOWN');
});

test('measured complete native edge is not a cutoff; negative pixels and missing provenance remain rejected', () => {
  const verdict = proof('native', existingFile, 'board', { contract: 'mobius-object-visual-evidence-v2', visualRole: 'COMPONENT', bbox: [0, 0, 1, 1] });
  const candidate = asset('native', { semanticObjects: ['board'], objectVisualEvidence: [verdict], sourcePdfSha256: 'source',
    nativeSourceEvidence: { nativeImage: true, assetSha256: verdict.imageSha256, sourcePdfSha256: 'source' } });
  const rank = c => rankSourceAssetCandidates({ requirement: { requiredObjects: ['board'] }, candidates: [c] })[0];
  expect(rank(candidate).valid).toBe(true);
  expect(rank({ ...candidate, nativeSourceEvidence: null }).hardViolations).toContain('object-edge-unverified:board');
  expect(rank({ ...candidate, objectVisualEvidence: [{ ...verdict, complete: false }] }).valid).toBe(false);
  expect(rank({ ...candidate, objectVisualEvidence: [{ ...verdict, present: false }] }).valid).toBe(false);
  expect(rank({ ...candidate, width: 150, height: 100 }).hardViolations).toContain('source-detail-insufficient');
});

test('source detail uses the normal contained drawing, not the entire panel', () => {
  const { canonicalTeachingPresentation } = require('../../src/services/visualPlanMaterializer.cjs');
  const { teachingSceneLayout, containedDisplayBounds } = require('../../src/services/presentationDesignSystem.cjs');
  const c = asset('board', { width: 763, height: 645 });
  const scene = canonicalTeachingPresentation({ id: 'scene', section: 'components', on_screen_text: 'One board', source_pages: [4] }, 0, c);
  const layout = teachingSceneLayout(scene);
  const bounds = containedDisplayBounds(c, { width: layout.imageWidth, height: layout.imageHeight });
  const r = rankSourceAssetCandidates({ candidates: [c], displayBounds: { presentationScene: scene, width: 1920, height: 1080 } })[0];
  expect(r.actualDisplayBounds).toEqual(bounds);
  expect(r.trueSourcePixelsPerDisplayPixel).toBeCloseTo(Math.min(763 / bounds.width, 645 / bounds.height), 4);
});

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
    objectVisualEvidence: [proof(id, existingFile, (overrides.semanticObjects || ['game board'])[0], {
      complete: (overrides.cropCompleteness || 'complete') === 'complete',
      isolated: (overrides.cropPurity || 'clean') === 'clean',
    })],
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

test('a verified semantic composition may reuse exact component identity only after final composition review', () => {
  const crypto = require('node:crypto');
  const { evaluateCandidate } = require('../../src/services/sourceAssetResolver.cjs');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(existingFile)).digest('hex');
  const requirement = { actualGameAssetRequired: true, requiredObjects: ['card'], transitionRequired: true,
    beforeState: 'Available', actionState: 'Resolve', afterState: 'Continue', evidenceSceneId: 'scene' };
  const teaching = ['Available', 'Resolve', 'Continue'].map((instructionalText, index) => ({ id: ['before', 'action', 'after'][index], label: ['Avant', 'Action', 'Après'][index], instructionalText, sourceRefs: [{ page: 4 }] }));
  const frames = teaching.map((stage, index) => ({ id: `frame-${index + 1}`, stage, outputPath: existingFile, phonePath: existingFile,
    sourcePixelsPerDisplayPixel: 1, actualDisplayBounds: { width: 900, height: 700 } }));
  const component = proof('card-asset', existingFile, 'card', { contract: 'mobius-object-visual-evidence-v2', visualRole: 'COMPONENT', bbox: [.1, .1, .9, .9] });
  const sequence = { contract: 'mobius-source-grounded-semantic-sequence-v1', semanticTeaching: true, sceneId: 'scene', assetId: 'card-asset', sourceTeaching: teaching,
    sourceAssets: [{ assetId: 'card-asset', sourceImageSha256: hash }], frames,
    review: { scenes: [{ scene_id: 'scene', candidates: [{ status: 'MEASURED', evidencePacket: { visualRole: 'COMPOSITION', responseContract: 'normalized-composition-sequence-v2',
      requirement: { ...requirement, evidenceSceneId: undefined }, semanticTeaching: { contract: 'mobius-source-grounded-semantic-sequence-v1', sourceTeaching: JSON.parse(JSON.stringify(teaching)) },
      sequenceFrames: frames.map(frame => ({ id: frame.id, stage: frame.stage, imageSha256: hash, phoneSha256: hash })) },
      objects: [{ requiredObject: 'card', visualRole: 'COMPOSITION', method: 'provider-pixel-analysis', confidence: .98, present: true, complete: true, isolated: true, stateCompatible: true, purposeSatisfied: true, phoneReadable: true }] }] }] } };
  const candidate = asset('card-asset', { semanticObjects: ['card'], objectVisualEvidence: [component], instructionalSequences: [sequence] });
  expect(evaluateCandidate(candidate, requirement, { width: 900, height: 700 })).toMatchObject({ valid: true, hardViolations: [] });
  sequence.review.scenes[0].candidates[0].evidencePacket.semanticTeaching.sourceTeaching[0].instructionalText = 'Tampered';
  expect(evaluateCandidate(candidate, requirement, { width: 900, height: 700 }).hardViolations).toContain('object-pixel-evidence-missing:card');
});

test('a final instructional diagram selects every source asset through one exact scene proof', () => {
  const crypto = require('node:crypto');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(existingFile)).digest('hex');
  const requirement = { actualGameAssetRequired: true, requiredObjects: ['board', 'token'], transitionRequired: true,
    requiredRelationship: 'Place token on board', beforeState: 'Board ready', actionState: 'Place token', afterState: 'Token placed', evidenceSceneId: 'scene' };
  const teaching = [['before', 'Avant', 'Le plateau est prêt.'], ['action', 'Action', 'Placez le jeton sur le plateau.'], ['after', 'Résultat', 'Le jeton reste sur le plateau.']]
    .map(([id, label, instructionalText]) => ({ id, label, instructionalText, sourceRefs: [{ page: 4 }] }));
  const frames = teaching.map((stage, index) => ({ id: `frame-${index + 1}`, stage, outputPath: existingFile, phonePath: existingFile,
    sourcePixelsPerDisplayPixel: 1, actualDisplayBounds: { width: 900, height: 700 } }));
  const sourceProof = (assetId, requiredObject) => proof(assetId, existingFile, requiredObject, { contract: 'mobius-object-visual-evidence-v2', visualRole: 'COMPONENT', bbox: [.1, .1, .9, .9] });
  const sequence = { contract: 'mobius-source-grounded-instructional-diagram-v1', instructionalDiagram: true, sceneId: 'scene', assetId: 'board-asset', sourceTeaching: teaching,
    sourceAssets: [{ assetId: 'board-asset', sourceImageSha256: hash }, { assetId: 'token-asset', sourceImageSha256: hash }], frames,
    review: { scenes: [{ scene_id: 'scene', candidates: [{ status: 'MEASURED', evidencePacket: { visualRole: 'COMPOSITION', responseContract: 'normalized-composition-sequence-v2',
      requirement: { ...requirement, evidenceSceneId: undefined }, instructionalDiagram: { contract: 'mobius-source-grounded-instructional-diagram-v1', sourceTeaching: JSON.parse(JSON.stringify(teaching)) },
      sequenceFrames: frames.map(frame => ({ id: frame.id, stage: frame.stage, imageSha256: hash, phoneSha256: hash })) }, objects: [
        { requiredObject: 'board', visualRole: 'COMPOSITION', method: 'provider-pixel-analysis', confidence: .98, present: true, complete: true, isolated: true, stateCompatible: true, purposeSatisfied: true, phoneReadable: true },
        { requiredObject: 'token', visualRole: 'COMPOSITION', method: 'provider-pixel-analysis', confidence: .98, present: true, complete: true, isolated: true, stateCompatible: true, purposeSatisfied: true, phoneReadable: true },
      ] }] }] } };
  const board = asset('board-asset', { semanticObjects: ['board'], objectVisualEvidence: [sourceProof('board-asset', 'board')], instructionalSequences: [sequence] });
  const token = asset('token-asset', { semanticObjects: ['token'], objectVisualEvidence: [sourceProof('token-asset', 'token')], instructionalSequences: [sequence] });
  const result = resolveInstructionalSequenceSources({ atom: { id: 'atom' }, requirement, candidates: [board, token] });
  expect(result).toMatchObject({ status: 'AUTO_ACCEPTED', reason: 'final-source-grounded-instructional-sequence-passed' });
  expect(result.selectedAssets.map((candidate) => candidate.id)).toEqual(['board-asset', 'token-asset']);
});

test('exact-game authorized BGG originals outrank native PDF rasters but not publisher masters', () => {
  expect(sourceAuthorityRank('OFFICIAL_PUBLISHER_HIGH_RES')).toBeGreaterThan(sourceAuthorityRank('OFFICIAL_BGG_ASSET'));
  expect(sourceAuthorityRank('OFFICIAL_BGG_ASSET')).toBeGreaterThan(sourceAuthorityRank('NATIVE_EMBEDDED'));
});

test('measured local templates enter authorized recovery as hypotheses and keep component provenance', () => {
  const template = asset('source-template', {
    objectVisualEvidence: [proof('source-template', existingFile, 'comp-1', { visualRole: 'COMPONENT' })],
  });
  const targets = buildAuthorizedRecoveryTargets({ assets: [template], requiredComponentIds: ['comp-1'] });
  expect(targets.targets).toEqual({ 'comp-1': existingFile });
  expect(targets.provenance['comp-1']).toMatchObject({ assetId: 'source-template', path: existingFile });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-authorized-candidates-'));
  const manifestPath = path.join(directory, 'candidates.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    authority: 'BoardGameGeek exact-game gallery original-resolution download',
    candidates: [{ id: 'authorized-bgg-1', status: 'RECOVERED', localPath: existingFile, width: 2400, height: 1600,
      targets: ['comp-1'], componentRefs: ['comp-1'], sourceAuthority: 'OFFICIAL_BGG_ASSET' }],
  }));
  try {
    const input = authorizedCandidatesForVisualAnalysis([manifestPath]);
    expect(input.assets).toHaveLength(1);
    expect(input.assets[0]).toMatchObject({ id: 'authorized-bgg-1', sourceAuthority: 'OFFICIAL_BGG_ASSET', componentRefs: ['comp-1'] });
    expect(input.assets[0].component_bindings).toEqual([expect.objectContaining({ componentId: 'comp-1', reviewState: 'hypothesis' })]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('recovers publisher candidates only from an exact title on a rulebook-disclosed domain', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-official-publisher-'));
  const imageBytes = fs.readFileSync(publisherFixture);
  const galleryBytes = await require('sharp')(imageBytes).resize({ width: 640 }).png().toBuffer();
  const calls = [];
  const response = ({ url, text, bytes, type = 'text/html' }) => ({ ok: true, url,
    headers: { get: (name) => name === 'content-type' ? type : (name === 'content-length' && bytes ? String(bytes.length) : null) },
    text: async () => text, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('post_type=product')) return response({ url, text: '<a href="/shop/cowboy">Cowboy Bebop: Space Serenade</a>' });
    if (url.includes('/shop/cowboy')) return response({ url, text: [
      '<script type="application/ld+json">{"@type":"Product","name":"Cowboy Bebop: Space Serenade","image":"https://cdn.publisher.test/cowboy.png"}</script>',
      '<a class="product-lightbox" data-fancybox="game-gallery" data-caption="Character miniature" href="https://cdn.publisher.test/character.jpg">Character</a>',
      '<a class="product-lightbox" data-fancybox="game-gallery" href="https://cdn.publisher.test/character.jpg">Duplicate</a>',
      '<a class="site-link" href="https://cdn.publisher.test/unrelated.jpg">Unrelated page image</a>',
    ].join('') });
    if (url.includes('cdn.publisher.test/character')) return response({ url, bytes: galleryBytes, type: 'image/png' });
    if (url.includes('cdn.publisher.test')) return response({ url, bytes: imageBytes, type: 'image/png' });
    return { ok: false, status: 404, headers: { get: () => null } };
  };
  try {
    expect(productEvidenceFromHtml('<script type="application/ld+json">{"@type":"Product","name":"Cowboy Bebop: Space Serenade","image":"https://cdn.publisher.test/cowboy.png"}</script><a class="product-lightbox" data-fancybox="game-gallery" data-caption="Character miniature" href="https://cdn.publisher.test/character.jpg">Character</a>', 'Cowboy Bebop - Space Serenade').images)
      .toEqual(expect.arrayContaining([expect.objectContaining({ caption: 'Character miniature', sourceKind: 'publisher-product-page-gallery' })]));
    const manifestPath = path.join(directory, 'official-publisher-candidate-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ inputHash: 'legacy-recovery-contract', candidates: [{ id: 'historical' }] }));
    const documentMap = { pages: [{ humanPageNumber: 18, normalizedText: 'Publisher: www.publisher.test' }] };
    expect(publisherOriginsFromDocumentMap(documentMap)).toEqual([expect.objectContaining({ origin: 'https://www.publisher.test', page: 18 })]);
    const recovered = await recoverOfficialPublisherCandidates({ title: 'Cowboy Bebop - Space Serenade', documentMap,
      sourceSha256: 'a'.repeat(64), requiredComponentIds: ['comp-a', 'comp-b'], outputDir: directory, fetchImpl });
    expect(recovered.status).toBe('RECOVERED');
    expect(recovered.contract).toBe('mobius-official-publisher-source-recovery-v3');
    expect(recovered.candidates).toHaveLength(2);
    expect(recovered.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceAuthority: 'OFFICIAL_PUBLISHER_HIGH_RES', retrievalComponentRefs: ['comp-a', 'comp-b'], provenance: expect.objectContaining({ retrievalKind: 'publisher-product-page-gallery' }) }),
      expect.objectContaining({ provenance: expect.objectContaining({ retrievalKind: 'product-jsonld' }) }),
    ]));
    expect(fs.existsSync(recovered.candidates[0].filePath)).toBe(true);
    expect(fs.existsSync(path.join(directory, 'history', 'official-publisher-candidate-manifest.legacy-recovery-contract.json'))).toBe(true);
    const input = authorizedCandidatesForVisualAnalysis([recovered.originalManifest]);
    const gallery = recovered.candidates.find((candidate) => candidate.provenance?.retrievalKind === 'publisher-product-page-gallery');
    const galleryInput = input.assets.find((candidate) => candidate.id === gallery.id);
    expect(input.assets[0].componentRefs).toEqual([]);
    expect(gallery.caption).toBe('Character miniature');
    expect(galleryInput).toMatchObject({ label: gallery.caption, provenance: expect.objectContaining({ retrievalKind: 'publisher-product-page-gallery' }) });
    expect(input.assets[0].component_bindings.map((entry) => entry.componentId)).toEqual(['comp-a', 'comp-b']);
    const replay = await recoverOfficialPublisherCandidates({ title: 'Cowboy Bebop - Space Serenade', documentMap,
      sourceSha256: 'a'.repeat(64), requiredComponentIds: ['comp-a', 'comp-b'], outputDir: directory, fetchImpl });
    expect(replay.reused).toBe(true);
    expect(calls.filter((url) => url.includes('cdn.publisher.test'))).toHaveLength(2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
  expect(candidate.semanticObjects).not.toContain('component-coin');
  expect(candidate.componentRefs).not.toContain('component-coin');
  expect(candidate.bindingHypotheses[0].componentName).toBe('Coin token');
  expect(normalized.unresolvedBindings).toHaveLength(1);
  expect(resolveSourceAssets({ atom: { id: 'coin', visualRequirement: { requiredObjects: ['component-coin'] } }, candidates: normalized.assets }).status).not.toBe('AUTO_ACCEPTED');
});

test('reconciles a HEPHAESTUS hypothesis only when current source pixels prove the same inventory component', () => {
  const verdict = proof('measured-board', existingFile, 'component-board', {
    contract: 'mobius-object-visual-evidence-v2', visualRole: 'COMPONENT',
  });
  const normalized = normalizeVisualReferents({
    sourceAssets: [asset('measured-board', { objectVisualEvidence: [verdict], cropCompleteness: 'unknown', cropPurity: 'unknown' })],
    componentEvidence: {
      assets: [{ id: 'measured-board', sourceImage: existingFile, pageNumber: 2, reviewState: 'accepted' }],
      componentBindings: [{ componentId: 'component-board', componentName: 'Board', assetId: 'measured-board', confidence: 0.51, reviewState: 'needs_review', reviewRequired: true }],
    },
  });
  expect(normalized.assets[0].componentRefs).toContain('component-board');
  expect(normalized.assets[0].pixelVerifiedComponentRefs).toEqual(['component-board']);
  expect(normalized.pixelVerifiedBindings).toHaveLength(1);
  expect(normalized.unresolvedBindings).toHaveLength(0);
  const selection = resolveSourceAssets({ atom: { id: 'board', visualRequirement: { requiredObjects: ['component-board'] } }, candidates: normalized.assets });
  expect(selection.status).toBe('AUTO_ACCEPTED');
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
