'use strict';

const PHYSICAL_GAME_STATE_CONTRACT = 'mobius-physical-game-state-v1';
const FACE_STATES = new Set(['FACE_UP', 'FACE_DOWN', 'NOT_APPLICABLE', 'UNKNOWN']);
const VISIBILITY_STATES = new Set(['VISIBLE', 'HIDDEN', 'REMOVED', 'UNKNOWN']);
const AVAILABILITY_STATES = new Set(['AVAILABLE', 'UNAVAILABLE', 'CONSUMED', 'UNKNOWN']);

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set(values.filter(Boolean))];

function normalizePhysicalItem(item = {}) {
  const faceState = String(item.faceState || 'UNKNOWN').toUpperCase();
  const visibility = String(item.visibility || (item.removed ? 'REMOVED' : 'VISIBLE')).toUpperCase();
  const availability = String(item.availability || (item.consumed ? 'CONSUMED' : 'UNKNOWN')).toUpperCase();
  return {
    id: clean(item.id || item.componentRef),
    componentRef: clean(item.componentRef || item.id),
    assetId: clean(item.assetId) || null,
    location: clean(item.location || item.destination) || null,
    orientation: clean(item.orientation) || null,
    faceState: FACE_STATES.has(faceState) ? faceState : 'UNKNOWN',
    visibility: VISIBILITY_STATES.has(visibility) ? visibility : 'UNKNOWN',
    owner: clean(item.owner) || null,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
    trackPosition: item.trackPosition ?? null,
    coveredBy: unique((item.coveredBy || []).map(clean)),
    covers: unique((item.covers || []).map(clean)),
    availability: AVAILABILITY_STATES.has(availability) ? availability : 'UNKNOWN',
    consumed: item.consumed === true || availability === 'CONSUMED',
    removed: item.removed === true || visibility === 'REMOVED',
    sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
    confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0))),
    reviewState: item.reviewState || 'review-required',
  };
}

function normalizeStateStage(stage = {}, fallbackId = 'state') {
  return {
    id: clean(stage.id || fallbackId),
    label: clean(stage.label || stage.id || fallbackId),
    items: (stage.items || []).map(normalizePhysicalItem).filter((item) => item.id),
    sourceRefs: Array.isArray(stage.sourceRefs) ? stage.sourceRefs : [],
  };
}

function derivePhysicalGameState(atom = {}) {
  const requirement = atom.visualRequirement || {};
  if (requirement.physicalState) return normalizePhysicalGameState(requirement.physicalState, atom);
  const refs = unique([...(atom.componentRefs || []), ...(requirement.requiredObjects || [])].map(clean));
  const baseItems = refs.map((componentRef) => normalizePhysicalItem({
    id: componentRef,
    componentRef,
    location: atom.placement || null,
    orientation: atom.orientation || requirement.requiredOrientation || null,
    faceState: requirement.faceStateRequired ? 'UNKNOWN' : 'NOT_APPLICABLE',
    visibility: 'VISIBLE',
    quantity: requirement.requiredQuantities?.find((entry) => entry.componentRef === componentRef)?.quantity,
    sourceRefs: atom.sourceRefs || [],
    confidence: atom.confidence,
    reviewState: atom.reviewState,
  }));
  const before = normalizeStateStage({ id: 'before', label: 'Avant', items: baseItems }, 'before');
  const afterItems = baseItems.map((item) => ({
    ...item,
    ...(requirement.oneShotMarkerRequired ? { availability: 'CONSUMED', consumed: true, visibility: 'REMOVED', removed: true } : {}),
  }));
  const after = normalizeStateStage({ id: 'after', label: 'Après', items: afterItems }, 'after');
  return normalizePhysicalGameState({
    ruleAtomId: atom.id,
    transitionType: requirement.oneShotMarkerRequired ? 'CONSUMED_TRIGGER'
      : requirement.transitionRequired ? 'BEFORE_ACTION_AFTER' : 'STATIC',
    stages: requirement.transitionRequired || requirement.oneShotMarkerRequired ? [before, after] : [before],
    relationshipAssertions: requirement.requiredRelationship ? [{ relationship: requirement.requiredRelationship, sourceRefs: atom.sourceRefs || [] }] : [],
  }, atom);
}

function normalizePhysicalGameState(input = {}, atom = {}) {
  return {
    contract: PHYSICAL_GAME_STATE_CONTRACT,
    ruleAtomId: clean(input.ruleAtomId || atom.id),
    transitionType: clean(input.transitionType) || 'STATIC',
    stages: (input.stages || []).map((stage, index) => normalizeStateStage(stage, `state-${index + 1}`)),
    relationshipAssertions: Array.isArray(input.relationshipAssertions) ? input.relationshipAssertions : [],
    sourceRefs: Array.isArray(input.sourceRefs) ? input.sourceRefs : (atom.sourceRefs || []),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? atom.confidence ?? 0))),
    reviewState: input.reviewState || atom.reviewState || 'review-required',
  };
}

function validatePhysicalGameState(state = {}) {
  const violations = [];
  if (!state.ruleAtomId) violations.push('physical-state-rule-atom-missing');
  if (!state.stages?.length) violations.push('physical-state-stage-missing');
  const before = state.stages?.[0];
  const after = state.stages?.[state.stages.length - 1];
  for (const stage of state.stages || []) {
    const ids = new Set();
    for (const item of stage.items || []) {
      if (ids.has(item.id)) violations.push(`physical-state-duplicate-item:${stage.id}:${item.id}`);
      ids.add(item.id);
      if (!item.componentRef) violations.push(`physical-state-component-ref-missing:${stage.id}:${item.id}`);
      if (item.quantity != null && item.quantity < 0) violations.push(`physical-state-invalid-quantity:${stage.id}:${item.id}`);
      if (item.faceState === 'UNKNOWN' && ((item.coveredBy || []).length || (item.covers || []).length)) {
        violations.push(`layered-card-face-state-unknown:${stage.id}:${item.id}`);
      }
    }
  }
  if (state.transitionType === 'CONSUMED_TRIGGER') {
    const beforeById = new Map((before?.items || []).map((item) => [item.id, item]));
    const consumed = (after?.items || []).filter((item) => item.consumed || item.removed);
    if (!consumed.length) violations.push('consumed-trigger-marker-not-removed');
    for (const item of consumed) {
      const prior = beforeById.get(item.id);
      if (!prior || prior.removed || prior.visibility === 'REMOVED') violations.push(`consumed-trigger-before-state-invalid:${item.id}`);
    }
  }
  return { valid: violations.length === 0, violations };
}

module.exports = {
  PHYSICAL_GAME_STATE_CONTRACT,
  derivePhysicalGameState,
  normalizePhysicalGameState,
  normalizePhysicalItem,
  validatePhysicalGameState,
};
