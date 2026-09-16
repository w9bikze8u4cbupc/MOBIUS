'use strict';

const PHYSICAL_GAME_STATE_CONTRACT = 'mobius-physical-game-state-v1';
const FACE_STATES = new Set(['FACE_UP', 'FACE_DOWN', 'NOT_APPLICABLE', 'UNKNOWN']);
const VISIBILITY_STATES = new Set(['VISIBLE', 'HIDDEN', 'REMOVED', 'UNKNOWN']);
const AVAILABILITY_STATES = new Set(['AVAILABLE', 'UNAVAILABLE', 'CONSUMED', 'UNKNOWN']);
const fs=require('node:fs'), crypto=require('node:crypto');
const { instructionalSequenceSourceAssets } = require('./instructionalSequenceSourceAssets.cjs');
const pixelHash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SUPPORTED_SEQUENCE_MATERIALIZER_CONTRACTS=new Set([
 'mobius-visual-plan-materializer-v8',
 'mobius-visual-plan-materializer-v9',
 'mobius-visual-plan-materializer-v10',
 'mobius-visual-plan-materializer-v11',
 'mobius-visual-plan-materializer-v12',
]);
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
   const sourceAssets=instructionalSequenceSourceAssets(sequence);
   const sourceAsset=sourceAssets.find(asset=>asset.assetId===candidate.id);
   if(sequence.sceneId!==sceneId || !sourceAsset || sequence.frames?.length<2)continue;
   const row=sequence.review?.scenes?.find(s=>s.scene_id===sceneId||s.sceneId===sceneId||s.id===sceneId)?.candidates?.find(c=>c.status==='MEASURED');
   const packet=row?.evidencePacket;
   if(!row||packet.visualRole!=='COMPOSITION'||packet.responseContract!=='normalized-composition-sequence-v2'
    ||!SUPPORTED_SEQUENCE_MATERIALIZER_CONTRACTS.has(sequence.materializerContract)
    ||packet.materializerContract!==sequence.materializerContract
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
   // Composition evidence is persisted and rehydrated as JSON.  Node's
   // deep-strict comparison also compares prototypes, so an otherwise
   // identical requirement can fail after a cross-context structured clone
   // even though it has the same persisted meaning.  Compare the canonical
   // JSON value instead: this remains strict about every serializable
   // requirement field while deliberately ignoring realm/prototype identity.
   if(canonicalJson(canonicalCompositionRequirement(packet.requirement))!==canonicalJson(compared))continue;
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

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : `!non-json-number:${String(value)}`;
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  // Undefined/functions/symbols do not survive the production transport.
  // Retain an explicit non-JSON marker so they cannot accidentally compare
  // equal to a missing persisted field.
  return `!non-json:${typeof value}`;
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
    // `Number(null)` and `Number('')` are both zero.  Treating an omitted
    // quantity as a measured zero creates a false physical state and causes
    // the renderer to label a visibly present component “Quantité 0”.
    quantity: item.quantity === null || item.quantity === undefined || item.quantity === ''
      ? null
      : (Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null),
    trackPosition: item.trackPosition ?? null,
    coveredBy: unique((item.coveredBy || []).map(clean)),
    covers: unique((item.covers || []).map(clean)),
    availability: AVAILABILITY_STATES.has(availability) ? availability : 'UNKNOWN',
    consumed: item.consumed === true || availability === 'CONSUMED',
    removed: item.removed === true || visibility === 'REMOVED',
    role: clean(item.role).toUpperCase() || 'OBJECT',
    arrangement: clean(item.arrangement).toUpperCase() || null,
    anchorRef: clean(item.anchorRef) || null,
    representations: Array.isArray(item.representations) ? item.representations.map((entry, index) => ({
      id: clean(entry.id || `${item.id || item.componentRef}-representation-${index + 1}`),
      label: clean(entry.label) || null,
      arrangement: clean(entry.arrangement).toUpperCase() || 'SINGLE',
      anchorRef: clean(entry.anchorRef) || null,
      quantity: entry.quantity === null || entry.quantity === undefined || entry.quantity === ''
        ? null : (Number.isFinite(Number(entry.quantity)) ? Number(entry.quantity) : null),
      faceState: FACE_STATES.has(String(entry.faceState || '').toUpperCase())
        ? String(entry.faceState).toUpperCase() : 'NOT_APPLICABLE',
    })) : [],
    sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
    confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0))),
    reviewState: item.reviewState || 'review-required',
  };
}

const NUMBER_WORDS = new Map([
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6],
  ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
  ['un', 1], ['une', 1], ['deux', 2], ['trois', 3], ['quatre', 4], ['cinq', 5],
  ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9], ['dix', 10],
]);

function numberValue(value) {
  const token = clean(value).toLocaleLowerCase('fr-CA');
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS.get(token) ?? null;
}

function descriptorKind(descriptor = {}) {
  const text = clean([descriptor.name, descriptor.category, ...(descriptor.aliases || [])].join(' ')).toLocaleLowerCase('fr-CA');
  if (/board|plateau|track|piste|gauge|jauge|zone|mat\b/.test(text)) return 'SURFACE';
  if (/card|carte|deck|paquet/.test(text)) return 'CARD';
  if (/token|jeton|cube|marker|marqueur|miniature|standee|figurine|pion/.test(text)) return 'PIECE';
  return 'OBJECT';
}

function descriptorTerms(descriptor = {}) {
  const generic = new Set(['card', 'cards', 'carte', 'cartes', 'deck', 'board', 'plateau', 'token', 'tokens',
    'jeton', 'jetons', 'cube', 'cubes', 'marker', 'marqueur', 'miniature', 'miniatures', 'the', 'de', 'des', 'du']);
  return clean([descriptor.name, ...(descriptor.aliases || [])].join(' ')).toLocaleLowerCase('fr-CA')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g)?.filter((term) => term.length > 2 && !generic.has(term)) || [];
}

function mentionedIn(text, descriptor = {}) {
  const normalized = clean(text).toLocaleLowerCase('fr-CA').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return descriptorTerms(descriptor).some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalized));
}

function firstExplicitQuantity(text, descriptor = {}, descriptors = []) {
  const normalized = clean(text).toLocaleLowerCase('fr-CA').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const terms = descriptorTerms(descriptor);
  for (const term of terms) {
    const match = normalized.match(new RegExp(`\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix)\\b(?:\\s+[a-z]+){0,2}\\s+${term}\\b`, 'i'));
    if (match) return numberValue(match[1]);
  }
  const kind = descriptorKind(descriptor);
  const sameKind = descriptors.filter((entry) => descriptorKind(entry) === kind);
  if (sameKind.length === 1) {
    const noun = kind === 'CARD' ? '(?:cards?|cartes?)' : kind === 'PIECE' ? '(?:tokens?|jetons?|cubes?|miniatures?|markers?|marqueurs?)' : '(?:boards?|plateaux?)';
    const match = normalized.match(new RegExp(`\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix)\\b(?:\\s+[a-z]+){0,2}\\s+${noun}\\b`, 'i'));
    if (match) return numberValue(match[1]);
  }
  return null;
}

function stageRepresentations(text, descriptor = {}, { anchorRef = null } = {}) {
  if (descriptorKind(descriptor) !== 'CARD') return [];
  const normalized = clean(text).toLocaleLowerCase('fr-CA');
  const result = [];
  const quantity = firstExplicitQuantity(text, descriptor, [descriptor]);
  const faceDown = /face[-\s]down|face[-\s]cach[eé]e/.test(normalized);
  const faceUp = /face[-\s]up|face[-\s]visible/.test(normalized);
  if (/deck|paquet/.test(normalized)) result.push({ id: 'deck', label: 'Deck', arrangement: 'STACK', anchorRef,
    quantity: null, faceState: faceDown ? 'FACE_DOWN' : 'NOT_APPLICABLE' });
  if ((quantity && /cards?|cartes?/.test(normalized)) || /purchasing area|zone d['’]achat|in a line|en ligne/.test(normalized)) {
    result.push({ id: 'row', label: /purchasing area|zone d['’]achat/.test(normalized) ? 'Zone d’achat' : 'Cartes',
      arrangement: 'LINE', anchorRef: null, quantity: quantity || null, faceState: faceUp ? 'FACE_UP' : 'NOT_APPLICABLE' });
  }
  if (/discard pile|d[eé]fausse/.test(normalized)) result.push({ id: 'discard', label: 'Défausse', arrangement: 'STACK',
    anchorRef: null, quantity: null, faceState: faceUp ? 'FACE_UP' : 'NOT_APPLICABLE' });
  return result;
}

function deriveObjectSemantics(requirement = {}, atom = {}) {
  const refs = unique((requirement.requiredObjects || atom.componentRefs || []).map(clean));
  const supplied = new Map((requirement.requiredObjectDescriptors || []).map((entry) => [clean(entry.id), entry]));
  const descriptors = refs.map((id) => ({ id, name: id, category: null, aliases: [], ...(supplied.get(id) || {}) }));
  const placementText = clean([atom.placement, requirement.requiredRelationship].filter(Boolean).join(' '));
  const stateText = clean([atom.stateBefore, atom.stateChange, atom.stateAfter, atom.result,
    requirement.beforeState, requirement.actionState, requirement.afterState, ...(atom.procedureSteps || [])].filter(Boolean).join(' '));
  const surfaces = descriptors.filter((entry) => descriptorKind(entry) === 'SURFACE');
  const movable = descriptors.filter((entry) => ['CARD', 'PIECE'].includes(descriptorKind(entry)));
  let anchor = null;
  if ((/\bon\b|\bsur\b|next to|beside|left of|right of|à côté|a cote|près de|pres de/i.test(placementText) || requirement.setupPlacementRequired)
    && surfaces.length === 1 && movable.length) anchor = surfaces[0];
  else if (/\bon\b|\bsur\b/i.test(placementText) && descriptors.length === 2) {
    anchor = descriptors.find((entry) => descriptorKind(entry) === 'CARD') || null;
  }
  return descriptors.map((descriptor) => {
    const kind = descriptorKind(descriptor);
    const role = anchor?.id === descriptor.id ? 'ANCHOR'
      : (anchor && descriptor.id !== anchor.id ? 'MOVABLE' : (mentionedIn(stateText, descriptor) ? 'FOCUS' : 'CONTEXT'));
    let arrangement = null;
    if (role === 'MOVABLE') arrangement = /next to|beside|left of|right of|à côté|a cote/i.test(placementText) ? 'BESIDE_ANCHOR' : 'ON_ANCHOR';
    else if (/in a line|en ligne/i.test(stateText) && kind === 'CARD') arrangement = 'LINE';
    else if ((/deck|paquet|discard pile|d[eé]fausse/i.test(stateText)) && kind === 'CARD') arrangement = 'STACK';
    return { ...descriptor, kind, role, arrangement, anchorRef: role === 'MOVABLE' ? anchor?.id || null : null };
  });
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
  const semantics = deriveObjectSemantics(requirement, atom);
  const byRef = new Map(semantics.map((entry) => [entry.id, entry]));
  // Structured orientation is authoritative when present.  Provider-backed
  // RuleAtoms sometimes carry the same explicit fact in stateAfter/result;
  // recognize only literal face-up/face-down language from those cited rule
  // fields.  This is not an inference from component type or a visual guess.
  const finalFaceState = faceStateFromOrientation([
    atom.orientation,
    requirement.requiredOrientation,
    atom.stateAfter,
    atom.result,
    requirement.afterState,
    requirement.requiredState,
  ].filter(Boolean).join(' '));
  const baseItems = refs.map((componentRef) => {
    const semantic = byRef.get(componentRef) || { id: componentRef, role: 'OBJECT', arrangement: null, anchorRef: null };
    const explicitQuantity = requirement.requiredQuantities?.find((entry) => entry.componentRef === componentRef)?.quantity;
    const inferredQuantity = firstExplicitQuantity(clean([atom.stateBefore, requirement.beforeState].join(' ')), semantic, semantics);
    return normalizePhysicalItem({
    id: componentRef,
    componentRef,
    // A placement rule establishes the destination, not that the component is
    // already there before the action.  Keep the pre-action item neutral and
    // apply the exact cited destination/orientation only to the final state.
    location: null,
    orientation: null,
    faceState: 'NOT_APPLICABLE',
    visibility: 'VISIBLE',
    quantity: explicitQuantity ?? inferredQuantity,
    role: semantic.role,
    arrangement: semantic.arrangement,
    anchorRef: semantic.anchorRef,
    representations: stageRepresentations(clean([atom.stateBefore, requirement.beforeState].join(' ')), semantic,
      { anchorRef: semantic.anchorRef }),
    sourceRefs: atom.sourceRefs || [],
    confidence: atom.confidence,
    reviewState: atom.reviewState,
    });
  });
  // A derived state is still grounded in the RuleAtom that caused it.  Earlier
  // versions put citations only on items, which made a truthful state sequence
  // look unproven to the materializer.  Carry the same source references on
  // every derived stage; this adds provenance, not a new game fact.
  const before = normalizeStateStage({ id: 'before', label: 'Avant', items: baseItems, sourceRefs: atom.sourceRefs || [] }, 'before');
  const afterText = clean([atom.stateChange, atom.stateAfter, atom.result, requirement.actionState, requirement.afterState,
    ...(atom.procedureSteps || [])].filter(Boolean).join(' '));
  const afterItems = baseItems.map((item) => {
    const semantic = byRef.get(item.componentRef) || {};
    const explicitQuantity = requirement.requiredQuantities?.find((entry) => entry.componentRef === item.componentRef)?.quantity;
    const inferredQuantity = firstExplicitQuantity(afterText, semantic, semantics);
    const targetPlacement = semantic.role === 'MOVABLE' || refs.length === 1
      || (!semantics.some((entry) => entry.role === 'MOVABLE') && mentionedIn(atom.placement, semantic));
    const itemFaceState = finalFaceState !== 'NOT_APPLICABLE'
      && (semantic.kind === 'CARD' || refs.length === 1) ? finalFaceState : 'NOT_APPLICABLE';
    return ({
    ...item,
    ...(targetPlacement && (atom.placement || requirement.requiredRelationship) ? {
      location: atom.placement || requirement.requiredRelationship,
    } : {}),
    ...(semantic.arrangement ? { arrangement: semantic.arrangement, anchorRef: semantic.anchorRef || null } : {}),
    ...(explicitQuantity != null || inferredQuantity != null ? { quantity: explicitQuantity ?? inferredQuantity } : {}),
    representations: stageRepresentations(afterText, semantic, { anchorRef: semantic.anchorRef }),
    ...(itemFaceState !== 'NOT_APPLICABLE' ? {
      orientation: atom.orientation || requirement.requiredOrientation || null,
      faceState: itemFaceState,
    } : {}),
    ...(requirement.oneShotMarkerRequired ? { availability: 'CONSUMED', consumed: true, visibility: 'REMOVED', removed: true } : {}),
    });
  });
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
  instructionalSequenceSourceAssets,
  PHYSICAL_GAME_STATE_CONTRACT,
  derivePhysicalGameState,
  normalizePhysicalGameState,
  normalizePhysicalItem,
  deriveObjectSemantics,
  validatePhysicalGameState,
};
