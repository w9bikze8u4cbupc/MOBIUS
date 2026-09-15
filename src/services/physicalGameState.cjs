'use strict';

const PHYSICAL_GAME_STATE_CONTRACT = 'mobius-physical-game-state-v1';
const FACE_STATES = new Set(['FACE_UP', 'FACE_DOWN', 'NOT_APPLICABLE', 'UNKNOWN']);
const VISIBILITY_STATES = new Set(['VISIBLE', 'HIDDEN', 'REMOVED', 'UNKNOWN']);
const AVAILABILITY_STATES = new Set(['AVAILABLE', 'UNAVAILABLE', 'CONSUMED', 'UNKNOWN']);
const fs=require('node:fs'), crypto=require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const pixelHash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const REQUIRED_SEQUENCE_MATERIALIZER_CONTRACT='mobius-visual-plan-materializer-v7';
const REQUIRED_SEMANTIC_SEQUENCE_CONTRACT='mobius-source-grounded-semantic-sequence-v2';
const REQUIRED_INSTRUCTIONAL_DIAGRAM_CONTRACT='mobius-source-grounded-instructional-diagram-v2';

/** A composition verdict belongs to exact source, ordered frames, phones and
 * requirements. A changed caption/pixel/state never inherits acceptance. */
function verifiedInstructionalSequence(candidate, requirement, sceneId) {
 for(const sequence of candidate.instructionalSequences||[]){
  try {
   // A source-measured sequence may be based on one track or on several
   // independently verified components.  In both cases, acceptance belongs
   // to the exact source pixels, ordered rendered frames and full requirement
   // packet -- never to a filename match or to a reusable component label.
   const sourceAssets=sequence.sourceAssets?.length?sequence.sourceAssets:
    (sequence.assetId?[{assetId:sequence.assetId,sourceImageSha256:sequence.frames?.[0]?.sourceImageSha256}]:[]);
   const sourceAsset=sourceAssets.find(asset=>asset.assetId===candidate.id);
   if(sequence.sceneId!==sceneId || !sourceAsset || sequence.frames?.length<2)continue;
   const row=sequence.review?.scenes?.find(s=>s.scene_id===sceneId||s.sceneId===sceneId||s.id===sceneId)?.candidates?.find(c=>c.status==='MEASURED');
   const packet=row?.evidencePacket;
   if(!row||packet.visualRole!=='COMPOSITION'||packet.responseContract!=='normalized-composition-sequence-v2'
    ||sequence.materializerContract!==REQUIRED_SEQUENCE_MATERIALIZER_CONTRACT
    ||packet.materializerContract!==REQUIRED_SEQUENCE_MATERIALIZER_CONTRACT
    ||packet.sequenceContract!==sequence.contract)continue;
   const semanticTeaching=sequence.semanticTeaching===true;
   const instructionalDiagram=sequence.instructionalDiagram===true;
   if(semanticTeaching){
    if(sequence.contract!==REQUIRED_SEMANTIC_SEQUENCE_CONTRACT
      ||packet.semanticTeaching?.contract!==REQUIRED_SEMANTIC_SEQUENCE_CONTRACT
      ||JSON.stringify(packet.semanticTeaching.sourceTeaching)!==JSON.stringify(sequence.sourceTeaching||[])
      ||sequence.frames.some(frame=>!String(frame.stage?.instructionalText||'').trim()))continue;
   } else if(instructionalDiagram){
    // A source-grounded instructional diagram deliberately combines exact
    // measured component pixels with cited explanatory labels. It is not a
    // claim that the source photo itself captured the whole game state. Its
    // final-composition review is nevertheless bound to every frame, label,
    // requirement and source asset just like a measured state sequence.
    if(sequence.contract!==REQUIRED_INSTRUCTIONAL_DIAGRAM_CONTRACT
      ||packet.instructionalDiagram?.contract!==REQUIRED_INSTRUCTIONAL_DIAGRAM_CONTRACT
      ||JSON.stringify(packet.instructionalDiagram.sourceTeaching)!==JSON.stringify(sequence.sourceTeaching||[])
      ||sequence.frames.some(frame=>!String(frame.stage?.instructionalText||'').trim()))continue;
   } else if(packet.semanticTeaching||packet.instructionalDiagram) continue;
   const compared=canonicalCompositionRequirement(requirement);
   if(!isDeepStrictEqual(canonicalCompositionRequirement(packet.requirement),compared))continue;
   if(sourceAsset.sourceImageSha256!==pixelHash(candidate.filePath))continue;
   if(sequence.frames.length!==packet.sequenceFrames?.length)continue;
   if(sequence.frames.some((f,i)=>f.id!==packet.sequenceFrames[i].id
     || JSON.stringify(f.stage)!==JSON.stringify(packet.sequenceFrames[i].stage)
     || pixelHash(f.outputPath)!==packet.sequenceFrames[i].imageSha256
     || pixelHash(f.phonePath)!==packet.sequenceFrames[i].phoneSha256
     || f.sourcePixelsPerDisplayPixel<.8))continue;
    const objects=row.objects||[];
    // Semantic teaching is explicitly allowed only when the requirement has
    // no concrete physical-state claim (see semanticTeachingStages). Its
    // source component still needs exact identity/integrity proof, and the
    // final composition must teach the cited purpose at phone scale, but the
    // unchanged source photograph is not expected to depict an abstract state
    // such as "the game ends" or "renown is gained". Physical sequences and
    // instructional diagrams continue to require stateCompatible=true.
    const compositionRequiresPhysicalState = Boolean(compared.setupPlacementRequired || compared.layeredStateRequired
      || compared.trackStateRequired || compared.oneShotMarkerRequired || compared.faceStateRequired
      || compared.requiredOrientation || compared.requiredQuantities?.length || compared.requiredState
      || compared.requiredRelationship || compared.physicalState || compared.physicalStateRequirement);
    if(objects.length!==(requirement.requiredObjects||[]).length||objects.some(o=>!requirement.requiredObjects.includes(o.requiredObject)
      ||o.visualRole!=='COMPOSITION'||o.method!=='provider-pixel-analysis'||o.confidence<.9
      ||!o.present||!o.complete||!o.isolated||(compositionRequiresPhysicalState&&!o.stateCompatible)
      ||!o.purposeSatisfied||!o.phoneReadable))continue;
   return sequence;
  }catch { /* An unavailable reference is unverified, never accepted. */ }
 }
 return null;
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set(values.filter(Boolean))];

function canonicalCompositionRequirement(value = {}) {
  const requirement = { ...value };
  delete requirement.evidenceSceneId;
  const explicitPhysical = Boolean(requirement.setupPlacementRequired || requirement.layeredStateRequired
    || requirement.trackStateRequired || requirement.oneShotMarkerRequired || requirement.faceStateRequired
    || requirement.requiredOrientation || requirement.requiredQuantities?.length
    || requirement.physicalState || requirement.physicalStateRequirement);
  if (!explicitPhysical) {
    // The former visual inference mirrored semantic fields into physical
    // aliases. Ignore only exact duplicates, so a cached stronger review can
    // replay without hiding a distinct physical relationship or state.
    if (requirement.requiredState
      && [requirement.afterState, requirement.actionState].includes(requirement.requiredState)) delete requirement.requiredState;
    if (requirement.requiredRelationship && requirement.requiredRelationship === requirement.actionState) delete requirement.requiredRelationship;
  }
  return requirement;
}

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

function faceStateFromOrientation(value) {
  const text = clean(value).toLocaleLowerCase('fr-CA');
  if (/face down|face cach[eé]e/.test(text)) return 'FACE_DOWN';
  if (/face up|face visible/.test(text)) return 'FACE_UP';
  return 'NOT_APPLICABLE';
}

function derivePhysicalGameState(atom = {}) {
  const requirement = atom.visualRequirement || {};
  if (requirement.physicalState) return normalizePhysicalGameState(requirement.physicalState, atom);
  const refs = unique([...(atom.componentRefs || []), ...(requirement.requiredObjects || [])].map(clean));
  const finalFaceState = faceStateFromOrientation(atom.orientation || requirement.requiredOrientation);
  const baseItems = refs.map((componentRef) => normalizePhysicalItem({
    id: componentRef,
    componentRef,
    // A placement rule establishes the destination, not that the component is
    // already there before the action.  Keep the pre-action item neutral and
    // apply the exact cited destination/orientation only to the final state.
    location: null,
    orientation: null,
    faceState: 'NOT_APPLICABLE',
    visibility: 'VISIBLE',
    quantity: requirement.requiredQuantities?.find((entry) => entry.componentRef === componentRef)?.quantity,
    sourceRefs: atom.sourceRefs || [],
    confidence: atom.confidence,
    reviewState: atom.reviewState,
  }));
  // A derived state is still grounded in the RuleAtom that caused it.  Earlier
  // versions put citations only on items, which made a truthful state sequence
  // look unproven to the materializer.  Carry the same source references on
  // every derived stage; this adds provenance, not a new game fact.
  const before = normalizeStateStage({ id: 'before', label: 'Avant', items: baseItems, sourceRefs: atom.sourceRefs || [] }, 'before');
  const afterItems = baseItems.map((item) => ({
    ...item,
    ...(atom.placement || requirement.requiredRelationship ? {
      location: atom.placement || requirement.requiredRelationship,
    } : {}),
    ...(atom.orientation || requirement.requiredOrientation ? {
      orientation: atom.orientation || requirement.requiredOrientation,
      faceState: finalFaceState,
    } : {}),
    ...(requirement.oneShotMarkerRequired ? { availability: 'CONSUMED', consumed: true, visibility: 'REMOVED', removed: true } : {}),
  }));
  const after = normalizeStateStage({ id: 'after', label: 'Après', items: afterItems, sourceRefs: atom.sourceRefs || [] }, 'after');
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
  verifiedInstructionalSequence,
  PHYSICAL_GAME_STATE_CONTRACT,
  derivePhysicalGameState,
  normalizePhysicalGameState,
  normalizePhysicalItem,
  validatePhysicalGameState,
};
