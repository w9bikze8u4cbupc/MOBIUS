import {
  reconcileStoryboardVisualPlans,
  resolveSceneComponentReferences,
  resolveSceneVisualPlan,
  validateStoryboardVisualPlans,
} from './storyboardVisualPlan';

const requiredScene = (overrides = {}) => ({
  id: 'scene-1', title: 'Setup', spokenText: 'Place the monster tokens.',
  visualDirections: [{ instruction: 'Show monster tokens.', componentRefs: ['monster-tokens'] }],
  sources: [{ section: 1, startOffset: 0, endOffset: 20 }], imageAssetIds: [], visualReviewState: 'needs_visual_review',
  ...overrides,
});

const inventory = [
  { id: 'monster-image', tags: ['monster tokens'], curation: { candidate: true, score: 0.9 } },
  { id: 'unrelated-image', tags: ['council board'], curation: { candidate: true, score: 0.95 } },
  { id: 'low-information', tags: ['monster tokens'], curation: { candidate: true, lowInformation: true, score: 0.99 } },
];

test('binds only an approved link for an explicitly referenced component', () => {
  const plan = resolveSceneVisualPlan(requiredScene(), {
    images: inventory,
    componentImageLinks: { 'monster-tokens': ['monster-image'] },
    componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } },
  });
  expect(plan).toMatchObject({ selectedAssetIds: ['monster-image'], selectionMethod: 'approved_component_link', reviewState: 'resolved' });
  expect(plan.assetCandidates.map((candidate) => candidate.assetId)).not.toContain('unrelated-image');
});

test('downgrades a mismatched approved-link claim to an operator selection', () => {
  const plan = resolveSceneVisualPlan(requiredScene({
    visualPlan: { selectedAssetIds: ['unrelated-image'], selectionMethod: 'approved_component_link', reviewState: 'resolved' },
  }), {
    images: inventory,
    componentImageLinks: { 'monster-tokens': ['monster-image'] },
    componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } },
  });
  expect(plan).toMatchObject({ selectedAssetIds: ['unrelated-image'], selectionMethod: 'operator_selected', reviewState: 'resolved' });
});

test('never auto-binds unrelated, low-information, or policy-disallowed automatic links', () => {
  const plan = resolveSceneVisualPlan(requiredScene(), {
    images: inventory,
    componentImageLinks: { 'monster-tokens': ['unrelated-image', 'low-information', 'monster-image'] },
    componentImageLinkDetails: {
      'monster-tokens': {
        'unrelated-image': { origin: 'auto', confidence: 0.99 },
        'low-information': { origin: 'auto', confidence: 0.99 },
        'monster-image': { origin: 'auto', confidence: 0.95 },
      },
    },
    policy: { allowAutomaticComponentLinks: false },
  });
  expect(plan.selectedAssetIds).toEqual([]);
  expect(plan.reviewState).toBe('needs_visual_review');
});

test('overview scenes require an explicit named project-owned selection', () => {
  const overview = requiredScene({ title: 'Introduction', visualDirections: [], imageAssetIds: [] });
  const unresolved = resolveSceneVisualPlan(overview, { images: inventory });
  expect(unresolved).toMatchObject({ overviewExceptionAllowed: true, reviewState: 'needs_visual_review' });
  const unresolvedManifest = reconcileStoryboardVisualPlans({ version: '1.2.0', scenes: [overview] }, { images: inventory });
  expect(validateStoryboardVisualPlans(unresolvedManifest, { images: inventory })).toMatchObject({ valid: false, code: 'VISUAL_PLAN_INCOMPLETE' });
  const resolved = resolveSceneVisualPlan({
    ...overview,
    visualPlan: { selectedAssetIds: ['monster-image'], selectionMethod: 'brand_asset', reviewState: 'resolved', overviewSelectionConfirmed: true },
  }, { images: inventory });
  expect(resolved).toMatchObject({ selectedAssetIds: ['monster-image'], selectionMethod: 'brand_asset', reviewState: 'resolved' });
});

test('removal remains unresolved and required scenes block release confirmation', () => {
  const manifest = { version: '1.2.0', scenes: [requiredScene()] };
  const approvedContext = { images: inventory, componentImageLinks: { 'monster-tokens': ['monster-image'] }, componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } } };
  const resolved = reconcileStoryboardVisualPlans(manifest, approvedContext);
  expect(validateStoryboardVisualPlans(resolved, approvedContext)).toMatchObject({ valid: true });
  const removed = reconcileStoryboardVisualPlans({
    ...resolved,
    scenes: [{ ...resolved.scenes[0], visualPlan: { ...resolved.scenes[0].visualPlan, selectedAssetIds: [], manualSelectionReviewed: true } }],
  }, approvedContext);
  expect(removed.scenes[0].visualPlan).toMatchObject({
    selectedAssetIds: [], reviewState: 'needs_visual_review', manualSelectionReviewed: true,
  });
  const reconciledAgain = reconcileStoryboardVisualPlans(removed, approvedContext);
  expect(reconciledAgain.scenes[0].visualPlan).toMatchObject({
    selectedAssetIds: [], reviewState: 'needs_visual_review', manualSelectionReviewed: true,
  });
  expect(validateStoryboardVisualPlans(reconciledAgain, approvedContext)).toMatchObject({ valid: false, code: 'VISUAL_PLAN_INCOMPLETE' });
});


test('reports an honest 21-scene Abyss-like visual-resolution summary', () => {
  const scenes = Array.from({ length: 21 }, (_, index) => requiredScene({
    id: `abyss-${index + 1}`,
    title: index === 0 ? 'Setup' : `Action ${index + 1}`,
    visualDirections: [{ instruction: 'Show component.', componentRefs: [index === 0 ? 'monster-tokens' : `unbound-component-${index}`] }],
  }));
  const manifest = reconcileStoryboardVisualPlans({ version: '1.2.0', scenes }, {
    images: inventory,
    componentImageLinks: { 'monster-tokens': ['monster-image'] },
    componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } },
  });
  const result = validateStoryboardVisualPlans(manifest, { images: inventory, componentImageLinks: { 'monster-tokens': ['monster-image'] }, componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } } });
  expect(result).toMatchObject({ valid: false, code: 'VISUAL_PLAN_INCOMPLETE', summary: { total: 21, resolved: 1, unresolved: 20, blocked: 0, approvedComponentLinked: 1, operatorSelected: 0, overviewExceptions: 0 } });
});


test('metadata-free component links remain suggestions until an operator selects them', () => {
  const plan = resolveSceneVisualPlan(requiredScene(), {
    images: inventory,
    componentImageLinks: { 'monster-tokens': ['monster-image'] },
  });
  expect(plan).toMatchObject({ selectedAssetIds: [], reviewState: 'needs_visual_review' });
});

test('overview selection stays unresolved until the operator explicitly designates its visual role', () => {
  const overview = requiredScene({ title: 'Introduction', visualDirections: [], imageAssetIds: [], visualPlan: { selectedAssetIds: ['monster-image'], selectionMethod: 'brand_asset', reviewState: 'resolved' } });
  expect(resolveSceneVisualPlan(overview, { images: inventory })).toMatchObject({ reviewState: 'needs_visual_review', selectionMethod: 'unresolved' });
});


test('resolves explicit multilingual aliases with plural normalization and persists explainability metadata', () => {
  const components = [
    { id: 'exploration-cards', nameEn: 'Exploration card', nameFr: 'Carte Exploration', aliases: ['exploration cards'] },
    { id: 'lords', name: 'Lord', synonyms: ['seigneur'] },
  ];
  const scene = requiredScene({
    title: 'Exploration cards',
    spokenText: 'Reveal the cartes exploration, then recruit a Lord.',
    visualDirections: [{ instruction: 'Show the exploration cards.', componentRefs: ['exploration card'] }],
  });
  const matches = resolveSceneComponentReferences(scene, components);
  expect(matches).toEqual(expect.arrayContaining([
    expect.objectContaining({ componentId: 'exploration-cards', matchedToken: 'exploration card', sourceField: 'visualDirections[0].componentRefs' }),
    expect.objectContaining({ componentId: 'lords', sourceField: 'spokenText' }),
  ]));
  const plan = resolveSceneVisualPlan(scene, { components });
  expect(plan.componentRefs).toEqual(expect.arrayContaining(['exploration-cards', 'lords']));
  expect(plan.componentRefMatches).toEqual(matches);
});

test('does not infer components from vague words or ambiguous aliases', () => {
  const scene = requiredScene({
    title: 'Strategy',
    spokenText: 'This game awards points through influence and strategy.',
    visualDirections: [{ instruction: 'Explain the strategy.', componentRefs: [] }],
  });
  const components = [
    { id: 'game-board', name: 'Game', aliases: ['game'] },
    { id: 'score-track', name: 'Points', aliases: ['points'] },
    { id: 'first-influence', name: 'Influence', aliases: ['influence'] },
    { id: 'second-influence', name: 'Influence marker', aliases: ['influence'] },
  ];
  expect(resolveSceneComponentReferences(scene, components)).toEqual([]);
  expect(resolveSceneVisualPlan(scene, { components, images: inventory }).componentRefs).toEqual([]);
});

test('only matching resolved components receive approved-link suggestions', () => {
  const components = [
    { id: 'monster-tokens', name: 'Monster token', aliases: ['monster tokens'] },
    { id: 'keys', name: 'Key' },
  ];
  const plan = resolveSceneVisualPlan(requiredScene(), {
    components,
    images: inventory,
    componentImageLinks: { 'monster-tokens': ['monster-image'], keys: ['unrelated-image'] },
    componentImageLinkDetails: {
      'monster-tokens': { 'monster-image': { origin: 'manual' } },
      keys: { 'unrelated-image': { origin: 'manual' } },
    },
  });
  expect(plan.assetCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: 'monster-image', componentId: 'monster-tokens', approved: true })]));
  expect(plan.assetCandidates).not.toEqual(expect.arrayContaining([expect.objectContaining({ assetId: 'unrelated-image', componentId: 'keys' })]));
});
