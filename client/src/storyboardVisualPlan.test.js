import {
  reconcileStoryboardVisualPlans,
  resolveSceneComponentReferences,
  resolveSceneVisualPlan,
  validateStoryboardVisualPlans,
} from './storyboardVisualPlan';

const requiredScene = (overrides = {}) => ({
  id: 'scene-1', title: 'Component demonstration', spokenText: 'Place the monster tokens.',
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
    title: index === 0 ? 'Component demonstration' : `Action ${index + 1}`,
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


const coverageComponents = [
  { id: 'monster-tokens', name: 'Monster token', aliases: ['monster tokens'] },
  { id: 'game-board', name: 'Game board', aliases: ['board'] },
  { id: 'keys', name: 'Key', aliases: ['keys'] },
];
const coverageContext = {
  components: coverageComponents,
  images: inventory,
  componentImageLinks: { 'monster-tokens': ['monster-image'] },
  componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } },
};

test('does not let a monster-token link resolve overview, tableau, board, title outro, or rulebook intents', () => {
  const scenes = [
    requiredScene({ title: 'Opening shot', visualDirections: [{ instruction: 'Show a game overview with monster tokens.', componentRefs: ['monster-tokens'] }] }),
    requiredScene({ title: 'Final tableau', visualDirections: [{ instruction: 'End with a completed player tableau and monster token.', componentRefs: ['monster-tokens'] }] }),
    requiredScene({ title: 'Setup', visualDirections: [{ instruction: 'Place the board in the center with a monster token.', componentRefs: ['monster-tokens'] }] }),
    requiredScene({ title: 'Game title outro', visualDirections: [{ instruction: 'Show the game title and monster token.', componentRefs: ['monster-tokens'] }] }),
    requiredScene({ title: 'Rulebook reference', visualDirections: [{ instruction: 'Show the rulebook page with a monster token.', componentRefs: ['monster-tokens'] }] }),
  ];
  const plans = scenes.map((scene) => resolveSceneVisualPlan(scene, coverageContext));
  expect(plans.map((plan) => plan.coverageStatus)).toEqual(['unresolved', 'unresolved', 'unresolved', 'unresolved', 'unresolved']);
  expect(plans.map((plan) => plan.selectedAssetIds)).toEqual([[], [], [], [], []]);
  expect(plans[2].primaryIntent).toBe('board_setup');
  expect(plans[2].primaryComponentRefs).toEqual(['game-board']);
});

test('approved primary Monster-token evidence resolves an explicit token action', () => {
  const plan = resolveSceneVisualPlan(requiredScene({
    title: 'Monster token action', visualDirections: [{ instruction: 'Reveal and take a Monster token.', componentRefs: ['monster-tokens'] }],
  }), coverageContext);
  expect(plan).toMatchObject({
    primaryIntent: 'token_action', primaryComponentRefs: ['monster-tokens'], selectedAssetIds: ['monster-image'],
    coverageStatus: 'resolved', reviewState: 'resolved', selectionMethod: 'approved_component_link',
  });
  expect(plan.assetAssignments).toEqual([expect.objectContaining({ assetId: 'monster-image', role: 'primary', componentId: 'monster-tokens' })]);
});

test('a multi-component scene is partial when only secondary component evidence is available', () => {
  const scene = requiredScene({
    title: 'Components',
    visualDirections: [{ instruction: 'Show Monster tokens and Keys.', componentRefs: ['monster-tokens', 'keys'] }],
  });
  const plan = resolveSceneVisualPlan(scene, coverageContext);
  expect(plan.primaryComponentRefs).toEqual(['monster-tokens', 'keys']);
  expect(plan.selectedAssetIds).toEqual(['monster-image']);
  expect(plan.coverageStatus).toBe('partial');
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [scene] }, coverageContext)).toMatchObject({ valid: false, code: 'VISUAL_PLAN_INCOMPLETE' });
});

test('explicit primary evidence and documented operator override permit release validation', () => {
  const explicitPrimary = requiredScene({
    visualPlan: { selectedAssetIds: ['monster-image'], selectionMethod: 'operator_selected', assetAssignments: [{ assetId: 'monster-image', role: 'primary', componentId: 'monster-tokens' }] },
  });
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [explicitPrimary] }, coverageContext)).toMatchObject({ valid: true, summary: { resolved: 1 } });

  const overridden = requiredScene({
    title: 'Completed tableau',
    visualDirections: [{ instruction: 'End with a completed player tableau.', componentRefs: [] }],
    visualPlan: { selectedAssetIds: ['monster-image'], selectionMethod: 'operator_selected', assetAssignments: [{ assetId: 'monster-image', role: 'overview' }], operatorOverride: { reason: 'Only approved end-card asset available.' } },
  });
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [overridden] }, coverageContext)).toMatchObject({ valid: true, summary: { overrides: 1 } });
  const undocumented = { ...overridden, visualPlan: { ...overridden.visualPlan, operatorOverride: { reason: '' } } };
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [undocumented] }, coverageContext)).toMatchObject({ valid: false, code: 'VISUAL_PLAN_INCOMPLETE' });
});

test('over-reused non-brand evidence blocks release while brand evidence is exempt', () => {
  const primaryScene = (id) => requiredScene({ id, visualPlan: { selectedAssetIds: ['monster-image'], selectionMethod: 'operator_selected', assetAssignments: [{ assetId: 'monster-image', role: 'primary', componentId: 'monster-tokens' }] } });
  const reused = validateStoryboardVisualPlans({ version: '1.2.0', scenes: [primaryScene('one'), primaryScene('two'), primaryScene('three')] }, coverageContext);
  expect(reused).toMatchObject({ valid: false, code: 'VISUAL_ASSET_REUSE_EXCEEDED' });
  const brandScene = (id) => requiredScene({ id, title: 'Game title outro', visualDirections: [], visualPlan: { selectedAssetIds: ['monster-image'], selectionMethod: 'brand_asset', overviewSelectionConfirmed: true, assetAssignments: [{ assetId: 'monster-image', role: 'brand' }] } });
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [brandScene('brand-one'), brandScene('brand-two'), brandScene('brand-three')] }, coverageContext)).toMatchObject({ valid: true });
});


test('browser-style selection is inventory-bound and does not bypass tableau or reuse release gates', () => {
  const selectedButUnconfirmed = requiredScene({
    title: 'Completed tableau',
    visualDirections: [{ instruction: 'End with a completed player tableau.', componentRefs: [] }],
    visualPlan: {
      selectedAssetIds: ['monster-image'], selectionMethod: 'operator_selected',
      assetAssignments: [{ assetId: 'monster-image', role: 'overview', componentId: null }],
    },
  });
  expect(resolveSceneVisualPlan(selectedButUnconfirmed, coverageContext)).toMatchObject({
    selectedAssetIds: ['monster-image'], coverageStatus: 'partial', operatorOverride: null,
  });
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [selectedButUnconfirmed] }, coverageContext)).toMatchObject({ valid: false, code: 'VISUAL_PLAN_INCOMPLETE' });

  const foreignSelection = requiredScene({ visualPlan: { selectedAssetIds: ['foreign-image'], selectionMethod: 'operator_selected', assetAssignments: [{ assetId: 'foreign-image', role: 'primary', componentId: 'monster-tokens' }] } });
  expect(resolveSceneVisualPlan(foreignSelection, coverageContext)).toMatchObject({ selectedAssetIds: [], coverageStatus: 'unresolved' });
});


test('contextual evidence is provenance-bound, cannot satisfy component closeups, and allows only confirmed board crops', () => {
  const provenance = { documentSha256: 'a'.repeat(64), pageRasterSha256: 'b'.repeat(64), renderProfile: 'pdf-to-img-review-144dpi-png-v1' };
  const contextualPage = { kind: 'contextual_page', assetId: 'page-1', pageId: 'page-1', role: 'rulebook_reference', confirmed: true, ...provenance };
  const overview = requiredScene({ title: 'Introduction', visualDirections: [], visualPlan: { contextualEvidenceAssignments: [contextualPage], selectionMethod: 'rulebook_reference', overviewSelectionConfirmed: true } });
  expect(resolveSceneVisualPlan(overview, coverageContext)).toMatchObject({ coverageStatus: 'resolved', selectedAssetIds: [], contextualEvidenceAssignments: [contextualPage] });

  const closeup = requiredScene({ title: 'Monster tokens', visualPlan: { contextualEvidenceAssignments: [contextualPage] } });
  expect(resolveSceneVisualPlan(closeup, { images: inventory, components: coverageComponents })).toMatchObject({ coverageStatus: 'unresolved', contextualEvidenceAssignments: [] });

  const unconfirmedBoardContext = requiredScene({ title: 'Board setup', visualDirections: [{ instruction: 'Show board setup context.', componentRefs: ['game-board'] }], visualPlan: { contextualEvidenceAssignments: [{ kind: 'contextual_crop', assetId: 'crop-1', cropId: 'crop-1', pageId: 'page-1', role: 'board_setup_context', confirmed: false, ...provenance }] } });
  expect(resolveSceneVisualPlan(unconfirmedBoardContext, coverageContext).contextualEvidenceAssignments).toEqual([]);
  const confirmedBoardContext = { ...unconfirmedBoardContext, visualPlan: { contextualEvidenceAssignments: [{ kind: 'contextual_crop', assetId: 'crop-1', cropId: 'crop-1', pageId: 'page-1', role: 'board_setup_context', confirmed: true, ...provenance }] } };
  expect(resolveSceneVisualPlan(confirmedBoardContext, coverageContext)).toMatchObject({
    primaryIntent: 'board_setup', primaryComponentRefs: ['game-board'], coverageStatus: 'resolved', reviewState: 'resolved',
    contextualEvidenceAssignments: [expect.objectContaining({ role: 'board_setup_context', confirmed: true })],
  });
});


test('prioritizes the exact Numbered Setup visual direction over setup-material component overlap', () => {
  const components = [
    { id: 'game-board', name: 'Game board', aliases: ['board'] },
    { id: 'exploration-cards', name: 'Exploration cards', aliases: ['exploration cards'] },
    { id: 'monster-tokens', name: 'Monster tokens', aliases: ['monster tokens'] },
    { id: 'lords', name: 'Lords', aliases: ['lords'] },
    { id: 'player-pearls', name: 'Player Pearls', aliases: ['player pearls'] },
    { id: 'treasury', name: 'Treasury', aliases: ['treasury'] },
  ];
  const plan = resolveSceneVisualPlan(requiredScene({
    id: 'scene-section-04-5',
    title: 'Numbered Setup',
    spokenText: 'Here’s the setup. One: place the board in the center of the table, then prepare cards, tokens, and Lords.',
    visualDirections: [{
      instruction: 'Build the setup step by step from a clean overhead table. Continue with tokens, player Pearls, and the Treasury.',
      componentRefs: ['game-board', 'exploration-cards', 'monster-tokens', 'lords', 'player-pearls', 'treasury'],
    }],
  }), { components });

  expect(plan.primaryIntent).toBe('board_setup');
  expect(plan.primaryComponentRefs).toEqual(['game-board']);
  expect(plan.supportingComponentRefs).toEqual(expect.arrayContaining([
    'exploration-cards', 'monster-tokens', 'lords', 'player-pearls', 'treasury',
  ]));
  expect(plan.primaryComponentRefs).not.toEqual(expect.arrayContaining(['exploration-cards', 'monster-tokens', 'lords']));
});

test('keeps tableau, overview, outro, and setup semantic precedence distinct from component action vocabulary', () => {
  const components = [{ id: 'exploration-cards', name: 'Exploration cards', aliases: ['exploration cards'] }];
  const intentFor = (title, instruction) => resolveSceneVisualPlan(requiredScene({
    title,
    visualDirections: [{ instruction, componentRefs: ['exploration-cards'] }],
  }), { components }).primaryIntent;

  expect(intentFor('Opening shot setup', 'Show an opening shot overview, then reveal exploration cards.')).toBe('game_overview');
  expect(intentFor('Completed tableau setup', 'Show the completed tableau before players draw exploration cards.')).toBe('assembled_tableau');
  expect(intentFor('Game title outro', 'End on the game title after players reveal exploration cards.')).toBe('brand_outro');
  expect(intentFor('Numbered Setup', 'Arrange the setup before players reveal exploration cards.')).toBe('board_setup');
  expect(intentFor('Exploration action', 'Reveal and take an Exploration card in close-up.')).toBe('card_action');
});

test('rejects contextual evidence for a true card action while preserving strict action coverage', () => {
  const provenance = { documentSha256: 'a'.repeat(64), pageRasterSha256: 'b'.repeat(64), renderProfile: 'pdf-to-img-review-144dpi-png-v1' };
  const scene = requiredScene({
    title: 'Exploration action',
    visualDirections: [{ instruction: 'Reveal and take an Exploration card in close-up.', componentRefs: ['exploration-cards'] }],
    visualPlan: { contextualEvidenceAssignments: [{ kind: 'contextual_page', assetId: 'page-1', pageId: 'page-1', role: 'rulebook_reference', confirmed: true, ...provenance }] },
  });
  const plan = resolveSceneVisualPlan(scene, { components: [{ id: 'exploration-cards', name: 'Exploration cards' }] });
  expect(plan).toMatchObject({ primaryIntent: 'card_action', coverageStatus: 'unresolved', contextualEvidenceAssignments: [] });
  expect(plan.reviewReason).toMatch(/incompatible with the corrected visual intent/i);
});

test('reconciliation preserves scene edits and valid assets while dropping only stale or incompatible evidence', () => {
  const provenance = { documentSha256: 'a'.repeat(64), pageRasterSha256: 'b'.repeat(64), renderProfile: 'pdf-to-img-review-144dpi-png-v1' };
  const scene = requiredScene({
    id: 'scene-section-04-5', title: 'Numbered Setup', spokenText: 'Keep this narration.', durationMs: 4200,
    transition: 'slide-left', reviewNotes: 'Keep this review note.',
    visualDirections: [{ instruction: 'Build the setup step by step from an overhead table with Monster tokens.', componentRefs: ['game-board', 'monster-tokens'] }],
    visualPlan: {
      selectedAssetIds: ['monster-image', 'foreign-image'], selectionMethod: 'operator_selected',
      assetAssignments: [
        { assetId: 'monster-image', role: 'primary', componentId: 'monster-tokens' },
        { assetId: 'foreign-image', role: 'primary', componentId: 'monster-tokens' },
      ],
      contextualEvidenceAssignments: [{ kind: 'contextual_page', assetId: 'page-1', pageId: 'page-1', role: 'rulebook_reference', confirmed: true, ...provenance }],
    },
  });
  const reconciled = reconcileStoryboardVisualPlans({ version: '1.2.0', scenes: [scene] }, coverageContext).scenes[0];

  expect(reconciled).toMatchObject({ spokenText: 'Keep this narration.', durationMs: 4200, transition: 'slide-left', reviewNotes: 'Keep this review note.' });
  expect(reconciled.visualPlan).toMatchObject({
    primaryIntent: 'board_setup', selectedAssetIds: ['monster-image'], contextualEvidenceAssignments: [],
    assetAssignments: [expect.objectContaining({ assetId: 'monster-image', role: 'supporting', componentId: 'monster-tokens' })],
  });
  expect(reconciled.visualPlan.reviewReason).toMatch(/not present in the current project inventory.*incompatible with the corrected visual intent/i);
});


test('permits a documented generated brand outro without a project asset, but never uses that exception for rules scenes', () => {
  const brandOutro = requiredScene({
    id: 'brand-outro',
    title: 'Game title outro',
    visualDirections: [{ instruction: 'Show the game title outro.', componentRefs: [] }],
    visualPlan: { operatorOverride: { reason: 'Use the approved channel outro template with the game title.' } },
  });
  expect(resolveSceneVisualPlan(brandOutro, { images: inventory })).toMatchObject({
    primaryIntent: 'brand_outro', coverageStatus: 'operator_override', reviewState: 'resolved',
  });
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [brandOutro] }, { images: inventory })).toMatchObject({
    valid: true, summary: { overrides: 1 },
  });

  const rulesScene = requiredScene({
    id: 'rules-scene',
    visualPlan: { operatorOverride: { reason: 'Do not bypass missing component evidence.' } },
  });
  expect(resolveSceneVisualPlan(rulesScene, { images: inventory })).toMatchObject({
    coverageStatus: 'unresolved', reviewState: 'needs_visual_review',
  });
  expect(validateStoryboardVisualPlans({ version: '1.2.0', scenes: [rulesScene] }, { images: inventory })).toMatchObject({
    valid: false, code: 'VISUAL_PLAN_INCOMPLETE',
  });
});
