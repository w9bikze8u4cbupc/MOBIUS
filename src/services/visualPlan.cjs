const fs = require('node:fs');
const path = require('node:path');
const { evaluatePeerQualityParity } = require('./sourceDetailLineage.cjs');
const { derivePhysicalGameState, validatePhysicalGameState } = require('./physicalGameState.cjs');

const VISUAL_CLASSIFICATIONS = Object.freeze([
  'REAL_COMPONENT',
  'REAL_BOARD_OR_TRACK',
  'REAL_CARD_OR_WONDER',
  'REAL_SETUP_STATE',
  'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS',
  'ABSTRACT_SUPPORTING_DIAGRAM',
  'TEXT_ONLY',
  'GENERIC_DECORATIVE',
  'INVALID_PROXY',
]);

const COMPOSITION_TYPES = Object.freeze([
  'REAL_COMPONENT_HERO',
  'REAL_COMPONENT_GRID',
  'REAL_COMPONENT_SEQUENCE',
  'REAL_COMPONENT_FLOW',
  'REAL_CARD_COST_FOCUS',
  'REAL_BOARD_TRACK_FOCUS',
  'REAL_MILITARY_DEMONSTRATION',
  'REAL_SETUP_LAYOUT',
  'REAL_SYMBOL_COMPARISON',
  'REAL_SCORING_LEDGER',
  'REAL_PROGRESSIVE_SCOREPAD',
  'REAL_AGE_GUILD_IDENTITY',
  'REAL_CARD_FAMILY_TABLEAU',
  'REAL_GUILD_DECK_PREPARATION',
  'REAL_SETUP_PLACEMENT',
  'REAL_WONDER_DRAFT',
  'REAL_DISCARD_PILE_FLOW',
  'REAL_COMPONENT_OVERVIEW',
  'REAL_AGE_REFERENCE_GRID',
  'REAL_ACCESSIBLE_CARD_DEMONSTRATION',
  'REAL_END_OF_AGE_TRANSITION',
  'REAL_CHAIN_COMPARISON',
  'REAL_GUILD_TEACHING',
  'REAL_MILITARY_ZONE_OVERLAY',
  'SOURCE_FAITHFUL_DIAGRAM',
  'SECTION_CARD',
]);

const PHYSICAL_DOMAINS = new Set([
  'components', 'setup', 'turn_structure', 'action', 'cost_rule',
  'triggered_effect', 'victory', 'end_condition', 'scoring',
  'tie_breaker', 'reference_aid',
]);

const ACTUAL_PIXEL_CLASSIFICATIONS = new Set([
  'REAL_COMPONENT', 'REAL_BOARD_OR_TRACK', 'REAL_CARD_OR_WONDER',
  'REAL_SETUP_STATE', 'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS',
]);

function isPhysicalRuleAtom(atom = {}) {
  if (atom.actualGameAssetRequired === false) return false;
  return PHYSICAL_DOMAINS.has(atom.domain)
    || (atom.componentRefs || []).length > 0
    || (atom.visualRequirement?.requiredObjects || []).length > 0;
}

function normalizeVisualPlan(input = {}, atom = {}) {
  const required = input.actualGameAssetRequired ?? isPhysicalRuleAtom(atom);
  const requiredReferents = input.requiredReferents || atom.visualRequirement?.requiredObjects || [];
  return {
    ruleAtomId: input.ruleAtomId || atom.id || null,
    instructionalPurpose: input.instructionalPurpose || atom.visualRequirement?.purpose || atom.title || '',
    compositionType: COMPOSITION_TYPES.includes(input.compositionType) ? input.compositionType : 'REAL_COMPONENT_HERO',
    actualGameAssetRequired: Boolean(required),
    actualGameAssetIds: [...new Set(input.actualGameAssetIds || [])],
    sourceAssetRoles: input.sourceAssetRoles || [],
    backgroundAsset: input.backgroundAsset || null,
    backgroundAssetId: input.backgroundAssetId || null,
    foregroundAssets: input.foregroundAssets || [],
    focusRegions: input.focusRegions || [],
    focusCues: input.focusCues || [],
    motionCues: input.motionCues || [],
    timedOverlays: input.timedOverlays || [],
    progressiveReveal: input.progressiveReveal === true,
    selectionLines: input.selectionLines || [],
    preparationLines: input.preparationLines || [],
    discardLines: input.discardLines || [],
    bulletLines: input.bulletLines || [],
    multiIdeaBullets: input.multiIdeaBullets === true,
    familyGroups: input.familyGroups || [],
    ageGroups: input.ageGroups || [],
    cardLayout: input.cardLayout || [],
    layeredCardState: input.layeredCardState || null,
    peerQualityGroups: input.peerQualityGroups || [],
    completeCardAssetIds: input.completeCardAssetIds || [],
    oneShotMarkers: input.oneShotMarkers || [],
    physicalPlacements: input.physicalPlacements || [],
    stateStages: input.stateStages || [],
    pairLabels: input.pairLabels || [],
    comparisonCardWidthPx: Number(input.comparisonCardWidthPx || 0),
    comparisonCardHeightPx: Number(input.comparisonCardHeightPx || 0),
    guildExamples: input.guildExamples || [],
    captionMaxWidth: Number(input.captionMaxWidth || 0),
    captionPreferredFontPx: Number(input.captionPreferredFontPx || 0),
    gameState: input.gameState || null,
    mobileMinimumAssetWidthPx: Number(input.mobileMinimumAssetWidthPx || 0),
    comparisonMinimumSourcePixelsPerDisplayPixel: Number(input.comparisonMinimumSourcePixelsPerDisplayPixel || 0),
    importantObjectEdgeClearancePx: Number(input.importantObjectEdgeClearancePx || 0),
    panelUtilization: input.panelUtilization || null,
    scoreExample: input.scoreExample || null,
    quantityFidelity: input.quantityFidelity || [],
    requiredReferents,
    referentEvidence: input.referentEvidence || [],
    referentGroundingRequired: input.referentGroundingRequired == null
      ? Boolean(required && requiredReferents.length)
      : Boolean(input.referentGroundingRequired),
    setupPlacements: input.setupPlacements || [],
    setupPlacementEvidenceRequired: input.setupPlacementEvidenceRequired == null
      ? Boolean(atom.domain === 'setup' && requiredReferents.length)
      : Boolean(input.setupPlacementEvidenceRequired),
    minimumRepresentativeAssets: Number(input.minimumRepresentativeAssets || 0),
    highlights: input.highlights || [],
    arrows: input.arrows || [],
    connectorStyle: input.connectorStyle || 'SUBTLE',
    labels: input.labels || [],
    summaryLine: input.summaryLine || null,
    beforeState: input.beforeState || atom.stateBefore || null,
    actionState: input.actionState || atom.choice || null,
    afterState: input.afterState || atom.stateAfter || atom.result || null,
    textBudget: {
      maxLines: Number(input.textBudget?.maxLines || 4),
      maxChars: Number(input.textBudget?.maxChars || 150),
    },
    visualAreaTarget: Number(input.visualAreaTarget || (required ? 0.68 : 0.5)),
    alignment: {
      horizontal: input.alignment?.horizontal || 'CENTER',
      vertical: input.alignment?.vertical || 'CENTER',
      fit: input.alignment?.fit || 'CONTAIN',
    },
    lowerZonePurpose: input.lowerZonePurpose || null,
    provenance: input.provenance || null,
    sourceRefs: input.sourceRefs || atom.sourceRefs || [],
    confidence: Number(input.confidence ?? atom.confidence ?? 0),
    reviewState: input.reviewState || 'review-required',
    reuseJustification: input.reuseJustification || null,
  };
}

function deriveCompositionType(atom = {}) {
  const requirement = atom.visualRequirement || {};
  const domain = String(atom.domain || '').toLowerCase();
  if (domain === 'section_card') return 'SECTION_CARD';
  if (requirement.progressiveScoringRequired) return 'REAL_SCORING_LEDGER';
  if (requirement.oneShotMarkerRequired) return 'REAL_COMPONENT_SEQUENCE';
  if (requirement.trackStateRequired) return 'REAL_BOARD_TRACK_FOCUS';
  if (requirement.layeredStateRequired && domain === 'setup') return 'REAL_SETUP_LAYOUT';
  if (domain === 'setup') return 'REAL_SETUP_PLACEMENT';
  if (requirement.layeredStateRequired) return 'REAL_ACCESSIBLE_CARD_DEMONSTRATION';
  if (requirement.cardFamilyRequired) return 'REAL_CARD_FAMILY_TABLEAU';
  if (requirement.discardPileRequired) return 'REAL_DISCARD_PILE_FLOW';
  if (requirement.comparisonGroupRequired) return 'REAL_SYMBOL_COMPARISON';
  if (requirement.transitionRequired) return 'REAL_COMPONENT_SEQUENCE';
  if (domain === 'components') return 'REAL_COMPONENT_OVERVIEW';
  if (requirement.semanticFocusRequired) return 'REAL_CARD_COST_FOCUS';
  return 'REAL_COMPONENT_HERO';
}

function assetMatchesReferent(asset = {}, referent = '') {
  const normalize = (value) => String(value || '').toLocaleLowerCase('fr-CA').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const target = normalize(referent);
  const evidence = normalize([
    asset.componentRef, asset.componentName, asset.label, asset.category,
    ...(asset.semanticObjects || []), ...(asset.semanticTags || []),
  ].filter(Boolean).join(' '));
  if (!target) return false;
  const tokens = target.split(' ').filter((token) => token.length >= 3);
  return tokens.some((token) => evidence.includes(token));
}

function compileAutomaticVisualPlan({ atom, sourceSelection = null, physicalState = null } = {}) {
  const requirement = atom.visualRequirement || {};
  const selected = sourceSelection?.selectedAssets || [];
  const suggested = sourceSelection?.suggestedAssets || [];
  const accepted = sourceSelection?.status === 'AUTO_ACCEPTED' && atom.reviewState === 'accepted';
  const assetIds = accepted ? selected.map((asset) => asset.id).filter(Boolean) : [];
  const referentEvidence = (requirement.requiredObjects || []).map((referent) => {
    const matching = selected.filter((asset) => assetMatchesReferent(asset, referent)).map((asset) => asset.id);
    return { referent, assetIds: matching, visibleAtNarration: matching.length > 0 };
  });
  const state = physicalState || derivePhysicalGameState(atom);
  const currentStage = state.stages?.[0] || { items: [] };
  const setupPlacements = atom.domain === 'setup' ? (requirement.requiredObjects || []).map((referent) => {
    const item = currentStage.items.find((candidate) => candidate.componentRef === referent || candidate.id === referent);
    return {
      referent,
      destination: item?.location || atom.placement || null,
      orientation: item?.orientation || atom.orientation || null,
      visibleRelationship: Boolean(item?.location || atom.placement),
      sourceRefs: atom.sourceRefs || [],
    };
  }) : [];
  const quantityFidelity = (requirement.requiredQuantities || []).map((entry) => ({
    ...entry,
    assetId: entry.assetId || selected.find((asset) => assetMatchesReferent(asset, entry.componentRef))?.id || null,
  }));
  const oneShotMarkers = requirement.oneShotMarkerRequired ? (state.stages?.[0]?.items || []).map((item) => ({
    id: item.id,
    assetId: item.assetId || selected.find((asset) => assetMatchesReferent(asset, item.componentRef))?.id || null,
    beforeState: 'PRESENT',
    afterState: 'REMOVED',
    reentryEffect: 'NONE',
    removeAtTrigger: true,
  })) : [];
  return normalizeVisualPlan({
    ruleAtomId: atom.id,
    instructionalPurpose: requirement.purpose || atom.title,
    compositionType: deriveCompositionType(atom),
    actualGameAssetRequired: requirement.actualGameAssetRequired,
    actualGameAssetIds: assetIds,
    sourceAssetRoles: selected.map((asset, index) => ({ assetId: asset.id, role: index === 0 ? 'primary' : 'supporting' })),
    foregroundAssets: selected.map((asset) => ({ assetId: asset.id, role: 'instructional-evidence' })),
    referentEvidence,
    setupPlacements,
    quantityFidelity,
    oneShotMarkers,
    gameState: state,
    stateStages: state.stages || [],
    beforeState: requirement.beforeState || atom.stateBefore,
    actionState: requirement.actionState || atom.stateChange || atom.choice,
    afterState: requirement.afterState || atom.stateAfter || atom.result,
    minimumRepresentativeAssets: requirement.representativeExamplesRequired ? Math.min(3, Math.max(2, requirement.requiredObjects?.length || 2)) : 0,
    mobileMinimumAssetWidthPx: requirement.actualGameAssetRequired ? 180 : 0,
    comparisonMinimumSourcePixelsPerDisplayPixel: requirement.comparisonGroupRequired ? 0.8 : 0,
    completeCardAssetIds: selected.filter((asset) => /card|carte|wonder|merveille/i.test(`${asset.category} ${asset.componentName} ${asset.label}`)).map((asset) => asset.id),
    sourceRefs: atom.sourceRefs || [],
    provenance: { compiler: 'mobius-canonical-visual-plan-compiler-v1', sourceResolver: sourceSelection?.contract || null },
    confidence: Math.min(Number(atom.confidence || 0), Number(sourceSelection?.confidence || 0)),
    reviewState: accepted ? 'accepted' : 'review-required',
  }, atom);
}

function toCockpitVisualPlan(plan = {}, atom = {}, sourceSelection = null) {
  const resolved = plan.reviewState === 'accepted' && plan.validation?.valid !== false;
  const assignments = (plan.sourceAssetRoles || []).map((entry) => ({
    assetId: entry.assetId,
    role: entry.role === 'primary' ? 'primary' : 'supporting',
    componentId: (atom.visualRequirement?.requiredObjects || [])[entry.role === 'primary' ? 0 : 1] || null,
  }));
  return {
    ...plan,
    componentRefs: atom.componentRefs || [],
    primaryComponentRefs: atom.visualRequirement?.requiredObjects || atom.componentRefs || [],
    supportingComponentRefs: [],
    selectedAssetIds: plan.actualGameAssetIds || [],
    assetAssignments: assignments,
    selectionMethod: resolved ? 'automatic_canonical_source_resolver' : 'unresolved',
    coverageStatus: resolved ? 'resolved' : (sourceSelection?.suggestedAssets?.length ? 'partial' : 'unresolved'),
    reviewState: resolved ? 'resolved' : 'needs_visual_review',
    reviewReason: resolved ? 'Canonical source, detail, semantic and state gates passed.' : (sourceSelection?.reason || 'Visual evidence requires operator review.'),
    requiresExplicitVisual: plan.actualGameAssetRequired,
    sourceReferences: atom.sourceRefs || [],
    assetCandidates: sourceSelection?.ranked || [],
  };
}

function assetFile(asset = {}) {
  return asset.displayPath || asset.filePath || asset.path || null;
}

function validateVisualPlan(plan, assets = []) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const selected = plan.actualGameAssetIds.map((id) => byId.get(id)).filter(Boolean);
  const missingAssetIds = plan.actualGameAssetIds.filter((id) => !byId.has(id));
  const actualAssets = selected.filter((asset) => asset.containsActualGamePixels === true
    && ACTUAL_PIXEL_CLASSIFICATIONS.has(asset.visualClassification));
  const abstractOnly = selected.length > 0 && actualAssets.length === 0;
  const violations = [];
  if (missingAssetIds.length) violations.push('missing-asset');
  if (plan.actualGameAssetRequired && actualAssets.length === 0) violations.push('actual-game-asset-required');
  if (plan.actualGameAssetRequired && abstractOnly) violations.push('abstract-proxy-as-component');
  if (plan.actualGameAssetRequired && plan.reviewState !== 'accepted') violations.push('visual-plan-review-required');
  if (selected.some((asset) => asset.cropPurity !== 'clean')) violations.push('crop-contamination');
  if (selected.some((asset) => asset.invalidated === true || asset.directorRejectedForSameDefect === true)) violations.push('rejected-asset-reused');
  if (selected.some((asset) => asset.isolationRequired === true && asset.backgroundContaminationAudit?.status !== 'PASS')) violations.push('background-contamination');
  if (selected.some((asset) => asset.cropCompleteness !== 'complete')) violations.push('incomplete-crop');
  if (selected.some((asset) => asset.availableHigherAuthoritySource === true)) violations.push('better-authoritative-source-available');
  if (selected.some((asset) => asset.reviewState !== 'accepted')) violations.push('asset-review-required');
  if (selected.some((asset) => !(asset.sourceRefs || []).length)) violations.push('asset-provenance-missing');
  if (plan.visualAreaTarget < 0.6 && plan.actualGameAssetRequired) violations.push('visual-area-below-physical-minimum');
  if (plan.alignment.horizontal !== 'CENTER') violations.push('static-visual-not-horizontally-centered');
  if (plan.alignment.vertical !== 'CENTER') violations.push('static-visual-not-vertically-centered');
  if (plan.alignment.fit !== 'CONTAIN') violations.push('static-visual-not-contained');
  if (plan.minimumRepresentativeAssets > 0 && selected.length < plan.minimumRepresentativeAssets) {
    violations.push('representative-asset-density-below-minimum');
  }
  if (plan.mobileMinimumAssetWidthPx > 0 && selected.some((asset) => Number(asset.minimumRenderedWidthPx || plan.mobileMinimumAssetWidthPx) < plan.mobileMinimumAssetWidthPx)) {
    violations.push('instructional-asset-below-mobile-minimum');
  }
  if (plan.comparisonMinimumSourcePixelsPerDisplayPixel > 0 && selected.some((asset) => {
    const ratio = Number(asset.trueSourcePixelsPerDisplayPixel ?? asset.sourceDetailLineage?.trueSourcePixelsPerDisplayPixel ?? 1);
    return ratio < plan.comparisonMinimumSourcePixelsPerDisplayPixel;
  })) violations.push('comparison-source-detail-below-minimum');
  if (plan.importantObjectEdgeClearancePx > 0 && selected.some((asset) => {
    const clearance = asset.importantObjectEdgeClearancePx;
    return clearance != null && Number(clearance) < plan.importantObjectEdgeClearancePx;
  })) violations.push('important-object-touches-crop-boundary');
  for (const assetId of plan.completeCardAssetIds || []) {
    const asset = byId.get(assetId);
    if (!asset || asset.cardSilhouetteState !== 'COMPLETE'
      || asset.edgeIntersectionState === 'UNINTENTIONAL_INTERSECTION'
      || asset.correctCardAspectRatio === false) {
      violations.push(`complete-card-silhouette:${assetId}`);
    }
  }
  for (const group of plan.peerQualityGroups || []) {
    const entries = (group.assetIds || []).map((assetId) => {
      const asset = byId.get(assetId);
      if (!asset) return null;
      return {
        assetId,
        sourcePixelsPerDisplayPixel: Number(asset.trueSourcePixelsPerDisplayPixel
          ?? asset.sourceDetailLineage?.trueSourcePixelsPerDisplayPixel
          ?? 0),
        displayScale: Number(asset.peerDisplayScale || 1),
      };
    }).filter(Boolean);
    const parity = evaluatePeerQualityParity(entries, {
      maximumDetailRatioSpread: Number(group.maximumDetailRatioSpread || 1.35),
      maximumDisplayScaleSpread: Number(group.maximumDisplayScaleSpread || 1.18),
    });
    for (const violation of parity.violations) violations.push(`${violation}:${group.id || 'comparison'}`);
  }
  if (plan.layeredCardState?.required) {
    const placements = plan.cardLayout || [];
    const faceStates = new Set(placements.map((entry) => entry.faceState));
    if (!faceStates.has('FACE_UP') || !faceStates.has('FACE_DOWN')) violations.push('layered-layout-face-states-incomplete');
    if (!placements.some((entry) => entry.accessible === true || entry.state === 'ACCESSIBLE')) violations.push('layered-layout-accessible-card-missing');
    if (!placements.some((entry) => (entry.coveredBy || []).length || (entry.covers || []).length)) violations.push('layered-layout-cover-relationship-missing');
  }
  if (plan.gameState?.militaryTrackState === 'IN_GAME' && !plan.gameState?.conflictPawnVisible) {
    violations.push('in-game-military-track-missing-conflict-pawn');
  }
  if (plan.gameState?.militaryTrackState === 'IN_GAME' && !plan.gameState?.militaryTokenState) {
    violations.push('in-game-military-token-state-unspecified');
  }
  if (plan.panelUtilization) {
    const useful = Number(plan.panelUtilization.usefulContentRatio);
    const available = Number(plan.panelUtilization.availableAreaRatio);
    if (Number.isFinite(useful) && Number.isFinite(available) && available >= 0.35 && useful < 0.22) {
      violations.push('severe-panel-under-utilization');
    }
  }
  for (const assertion of plan.quantityFidelity || []) {
    const asset = byId.get(assertion.assetId);
    const required = Number(assertion.requiredQuantity);
    const represented = Number(asset?.representedQuantity ?? assertion.representedQuantity);
    if (!asset || !Number.isFinite(required) || !Number.isFinite(represented) || required !== represented) {
      violations.push(`quantity-fidelity:${assertion.componentRef || assertion.assetId || 'unknown'}`);
    }
  }
  if (plan.referentGroundingRequired) {
    for (const required of plan.requiredReferents || []) {
      const evidence = (plan.referentEvidence || []).find((entry) => entry.referent === required);
      const evidenceAssets = evidence?.assetIds || (evidence?.assetId ? [evidence.assetId] : []);
      if (!evidence || !evidence.visibleAtNarration || evidenceAssets.length === 0 || evidenceAssets.some((id) => !byId.has(id))) {
        violations.push(`physical-referent-absent:${required}`);
      }
    }
  }
  if (plan.setupPlacementEvidenceRequired) {
    for (const required of plan.requiredReferents || []) {
      const placement = (plan.setupPlacements || []).find((entry) => entry.referent === required);
      if (!placement || !placement.destination || !placement.visibleRelationship) {
        violations.push(`setup-placement-evidence-missing:${required}`);
      }
    }
  }
  if (!['NONE', 'SUBTLE', 'MOTION_ONLY'].includes(plan.connectorStyle)) {
    violations.push('unsupported-connector-style');
  }
  for (const cue of plan.motionCues || []) {
    if (!byId.has(cue.assetId) || !byId.has(cue.relativeToAssetId)) violations.push('motion-cue-asset-missing');
    if (!(Number(cue.endRatio) > Number(cue.startRatio))) violations.push('motion-cue-time-invalid');
  }
  for (const marker of plan.oneShotMarkers || []) {
    if (!marker.id || !marker.assetId || !byId.has(marker.assetId)) violations.push('one-shot-marker-asset-missing');
    if (marker.beforeState !== 'PRESENT' || marker.afterState !== 'REMOVED') violations.push('one-shot-marker-state-invalid');
    if (marker.reentryEffect !== 'NONE') violations.push('one-shot-marker-reentry-must-be-none');
    if (!marker.removeAtTrigger) violations.push('one-shot-marker-removal-not-visualized');
  }
  for (const placement of plan.physicalPlacements || []) {
    if (!placement.assetId || !byId.has(placement.assetId)) violations.push('physical-placement-asset-missing');
    if (!placement.destinationId || placement.positionVerified !== true) violations.push('physical-placement-unverified');
    if (placement.expectedOrientation && placement.orientation !== placement.expectedOrientation) {
      violations.push('physical-placement-orientation-mismatch');
    }
  }
  if (plan.compositionType === 'REAL_PROGRESSIVE_SCOREPAD') {
    if (!plan.scoreExample?.rows?.length || !plan.scoreExample?.total) violations.push('progressive-score-example-missing');
    if (!selected.some((asset) => (asset.semanticTags || []).some((tag) => /carnet|scorepad|score sheet/i.test(tag)))) {
      violations.push('authoritative-scorepad-missing');
    }
  }
  return {
    valid: violations.length === 0,
    violations,
    missingAssetIds,
    selectedAssetCount: selected.length,
    actualGameAssetCount: actualAssets.length,
    selectedAssets: selected,
  };
}

function compileVisualPlans({ atoms = [], projectPlans = [], assets = [], sourceSelections = [], physicalStates = [] } = {}) {
  const planByAtom = new Map(projectPlans.map((plan) => [plan.ruleAtomId, plan]));
  const selectionByAtom = new Map(sourceSelections.map((selection) => [selection.ruleAtomId, selection]));
  const stateByAtom = new Map(physicalStates.map((state) => [state.ruleAtomId, state]));
  return atoms.map((atom) => {
    const projectPlan = planByAtom.get(atom.id);
    const plan = projectPlan
      ? normalizeVisualPlan(projectPlan, atom)
      : compileAutomaticVisualPlan({ atom, sourceSelection: selectionByAtom.get(atom.id), physicalState: stateByAtom.get(atom.id) });
    const validation = validateVisualPlan(plan, assets);
    const stateValidation = validatePhysicalGameState(stateByAtom.get(atom.id) || plan.gameState || derivePhysicalGameState(atom));
    const canonical = { ...plan, validation: { ...validation, physicalState: stateValidation } };
    return { ...canonical, cockpit: toCockpitVisualPlan(canonical, atom, selectionByAtom.get(atom.id)) };
  });
}

function auditVisualCoverage({ atoms = [], plans = [], assets = [] } = {}) {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const scenes = plans.map((plan) => {
    const atom = atomById.get(plan.ruleAtomId) || {};
    const selected = plan.actualGameAssetIds.map((id) => byId.get(id)).filter(Boolean);
    const actual = selected.filter((asset) => asset.containsActualGamePixels === true
      && ACTUAL_PIXEL_CLASSIFICATIONS.has(asset.visualClassification));
    const physical = isPhysicalRuleAtom(atom);
    const classification = actual[0]?.visualClassification
      || selected[0]?.visualClassification
      || (selected.length ? 'INVALID_PROXY' : 'TEXT_ONLY');
    return {
      ruleAtomId: plan.ruleAtomId,
      domain: atom.domain || null,
      narration: atom.teaching?.narration || null,
      physicalComponentsNamed: atom.visualRequirement?.requiredObjects || atom.componentRefs || [],
      actualVisualAssetIds: selected.map((asset) => asset.id),
      containsActualGamePixels: actual.length > 0,
      sourceTypes: [...new Set(selected.map((asset) => asset.sourceType))],
      semanticMatch: plan.validation.valid,
      visualClassification: classification,
      syntheticProxyUsed: selected.some((asset) => asset.containsActualGamePixels !== true),
      realComponentAvailable: assets.some((asset) => asset.containsActualGamePixels === true),
      realComponentOmitted: physical && actual.length === 0,
      actualGameAssetRequired: plan.actualGameAssetRequired,
      qaStatus: plan.validation.valid ? 'PASS' : 'FAIL',
      violations: plan.validation.violations,
    };
  });
  const applicable = scenes.filter((scene) => scene.actualGameAssetRequired);
  const count = (predicate) => applicable.filter(predicate).length;
  const planById = new Map(plans.map((plan) => [plan.ruleAtomId, plan]));
  const visualSets = new Map();
  for (const scene of applicable) {
    const key = [...new Set(scene.actualVisualAssetIds)].sort().join('|');
    if (!key) continue;
    const group = visualSets.get(key) || [];
    group.push(scene.ruleAtomId);
    visualSets.set(key, group);
  }
  const unjustifiedRepeated = [...visualSets.values()].flatMap((group) => group.length < 2 ? [] : group.slice(1).filter((id) => !planById.get(id)?.reuseJustification));
  const metrics = {
    applicableInstructionalScenes: applicable.length,
    scenesWithActualGameImagery: count((scene) => scene.containsActualGamePixels),
    instructionalScenesWithoutActualGameAsset: count((scene) => !scene.containsActualGamePixels),
    textOnlyPhysicalRuleSceneCount: count((scene) => scene.visualClassification === 'TEXT_ONLY'),
    abstractProxyAsComponentCount: count((scene) => ['ABSTRACT_SUPPORTING_DIAGRAM', 'INVALID_PROXY'].includes(scene.visualClassification)),
    genericColoredCircleComponentCount: count((scene) => scene.violations.includes('generic-colored-circle-proxy')),
    semanticallyWrongVisualCount: count((scene) => !scene.semanticMatch),
    decorativeVisualSubstitutionCount: count((scene) => scene.visualClassification === 'GENERIC_DECORATIVE'),
    cropContaminationCount: count((scene) => scene.violations.includes('crop-contamination')),
    incompleteCropCount: count((scene) => scene.violations.includes('incomplete-crop')),
    unjustifiedRepeatedVisualCount: unjustifiedRepeated.length,
  };
  return {
    contract: 'mobius-visual-first-coverage-v1',
    status: Object.entries(metrics).filter(([key]) => !['applicableInstructionalScenes', 'scenesWithActualGameImagery'].includes(key)).every(([, value]) => value === 0)
      && metrics.scenesWithActualGameImagery === metrics.applicableInstructionalScenes ? 'PASS' : 'FAIL',
    metrics,
    unjustifiedRepeatedVisualAtomIds: unjustifiedRepeated,
    scenes,
  };
}

function assertAssetFiles(assets = []) {
  return assets.flatMap((asset) => {
    const file = assetFile(asset);
    return !file || !fs.existsSync(path.resolve(file)) ? [{ assetId: asset.id, violation: 'missing-file' }] : [];
  });
}

module.exports = {
  ACTUAL_PIXEL_CLASSIFICATIONS,
  COMPOSITION_TYPES,
  VISUAL_CLASSIFICATIONS,
  assertAssetFiles,
  auditVisualCoverage,
  compileAutomaticVisualPlan,
  compileVisualPlans,
  deriveCompositionType,
  isPhysicalRuleAtom,
  normalizeVisualPlan,
  toCockpitVisualPlan,
  validateVisualPlan,
};
