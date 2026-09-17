'use strict';

const crypto = require('node:crypto');

const RULE_VISUAL_REFERENT_RECOVERY_CONTRACT = 'mobius-rule-visual-referent-recovery-v3';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function hashVisualReferentRecoveryPacket(packet) {
  return crypto.createHash('sha256').update(stable(packet)).digest('hex');
}

function sourceEvidence(refs = []) {
  return refs
    .filter((ref) => Number.isInteger(Number(ref?.page)) && Number(ref.page) > 0 && clean(ref.quote))
    .map((ref) => ({
      page: Number(ref.page),
      quote: clean(ref.quote),
      excerptHash: clean(ref.excerptHash) || null,
    }));
}

function componentTrust(component = {}) {
  const confidence = Number(component.confidence || 0);
  const page = Number(component.sourcePage);
  const quote = clean(component.sourceQuote);
  const name = clean(component.name);
  const looksLikeInstruction = /^(?:play|take|draw|discard|gain|spend|move|place|resolve|activate|choose|select|return|remove)\b/i.test(name)
    || /\b(?:from (?:your|the|a) (?:hand|deck|discard)|immediately|then)\b/i.test(name);
  const rejectedFragment = confidence <= .5 || looksLikeInstruction;
  const grounded = page > 0 && quote && name && confidence >= .8 && !rejectedFragment;
  return {
    state: grounded
      ? 'SOURCE_GROUNDED_COMPONENT'
      : (rejectedFragment ? 'REJECTED_EXTRACTION_FRAGMENT' : 'REVIEW_ONLY_EXTRACTION_HYPOTHESIS'),
    confidence,
    reasons: [
      ...(page > 0 ? [] : ['source-page-missing']),
      ...(quote ? [] : ['source-quote-missing']),
      ...(name ? [] : ['component-name-missing']),
      ...(confidence >= .8 ? [] : ['inventory-confidence-below-source-grounded-threshold']),
      ...(looksLikeInstruction ? ['instruction-or-state-fragment-not-component-identity'] : []),
      ...(confidence <= .5 ? ['deterministic-extractor-marked-low-confidence-fragment'] : []),
    ],
  };
}

/**
 * This packet resolves only a missing visual referent into an existing,
 * source-grounded inventory ID. It neither invents a component nor selects an
 * image. Rules that truthfully need a diagram rather than a physical object
 * are explicit and retain the authoritative excerpt that justified that fact.
 */
function buildRuleVisualReferentRecoveryPacket(model = {}) {
  const components = (model.components || []).filter((component) => clean(component?.id)).map((component) => {
    const trust = componentTrust(component);
    return {
      id: clean(component.id),
      name: clean(component.name),
      category: clean(component.category) || null,
      sourcePage: Number.isInteger(Number(component.sourcePage)) && Number(component.sourcePage) > 0 ? Number(component.sourcePage) : null,
      sourceQuote: clean(component.sourceQuote) || null,
      inventoryConfidence: trust.confidence,
      trustState: trust.state,
      trustReasons: trust.reasons,
    };
  });
  const known = new Set(components.map((component) => component.id));
  const trusted = new Set(components.filter((component) => component.trustState === 'SOURCE_GROUNDED_COMPONENT').map((component) => component.id));
  const candidates = (model.ruleAtoms || []).filter((atom) => {
    const requirement = atom?.visualRequirement || {};
    if (atom?.reviewState !== 'accepted' || !atom?.teaching?.narration) return false;
    if (requirement.actualGameAssetRequired === false) return false;
    const refs = unique([...(atom.componentRefs || []), ...(requirement.requiredObjects || [])]);
    return !refs.length || refs.some((id) => !known.has(id) || !trusted.has(id));
  }).map((atom) => ({
    id: clean(atom.id),
    domain: clean(atom.domain),
    title: clean(atom.title),
    purpose: clean(atom.visualRequirement?.purpose || atom.title),
    currentReferents: unique([...(atom.componentRefs || []), ...(atom.visualRequirement?.requiredObjects || [])]),
    trustedCurrentReferents: unique([...(atom.componentRefs || []), ...(atom.visualRequirement?.requiredObjects || [])]).filter((id) => trusted.has(id)),
    reviewOnlyCurrentReferents: unique([...(atom.componentRefs || []), ...(atom.visualRequirement?.requiredObjects || [])]).filter((id) => !trusted.has(id)),
    sourceEvidence: sourceEvidence(atom.sourceRefs),
  })).filter((atom) => atom.id && atom.sourceEvidence.length);

  return {
    contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
    sourcePdfSha256: clean(model.sourcePdfSha256) || null,
    documentMapContract: clean(model.documentMap?.contract) || null,
    ruleAtomContract: clean(model.contract) || null,
    components,
    candidates,
  };
}

function locateInterleavedSourceQuote(text, quote) {
  const tokens = (value) => [...String(value || '').matchAll(/[\p{L}\p{N}]+/gu)]
    .map((match) => ({ word: match[0].toLocaleLowerCase('fr-CA'), start: match.index, end: match.index + match[0].length }));
  const source = tokens(text);
  const wanted = tokens(quote);
  if (wanted.length < 4) return null;
  const matches = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start].word !== wanted[0].word) continue;
    let index = start;
    let matched = 0;
    while (index < source.length && index - start < wanted.length + 14 && matched < wanted.length) {
      if (source[index].word === wanted[matched].word) matched += 1;
      index += 1;
    }
    if (matched === wanted.length) matches.push(String(text).slice(source[start].start, source[index - 1].end));
  }
  return matches.length === 1 ? matches[0] : null;
}

function normalizeEvidenceFromPacket(evidence, candidate) {
  const page = Number(evidence?.page);
  const quote = clean(evidence?.quote);
  for (const source of candidate.sourceEvidence || []) {
    if (Number(source.page) !== page) continue;
    if (source.quote.includes(quote)) return { page, quote };
    const projected = locateInterleavedSourceQuote(source.quote, quote);
    if (projected) return { page, quote: projected, providerQuote: quote, sourceProjection: 'unique-ordered-source-span-with-interleaved-tokens-preserved' };
  }
  return null;
}

function validateRuleVisualReferentRecovery(packet = {}, result = {}) {
  if (!Array.isArray(result?.recoveries) || result.recoveries.length !== (packet.candidates || []).length) {
    throw new Error('RULE_VISUAL_REFERENT_RECOVERY_COVERAGE_INVALID');
  }
  const candidatesById = new Map((packet.candidates || []).map((candidate) => [candidate.id, candidate]));
  const componentIds = new Set((packet.components || [])
    .filter((component) => component.trustState === 'SOURCE_GROUNDED_COMPONENT')
    .map((component) => component.id));
  const seen = new Set();
  const normalized = result.recoveries.map((recovery) => {
    const atomId = clean(recovery?.ruleAtomId);
    const candidate = candidatesById.get(atomId);
    if (!candidate || seen.has(atomId)) throw new Error('RULE_VISUAL_REFERENT_RECOVERY_ID_INVALID');
    seen.add(atomId);
    const disposition = clean(recovery.disposition).toUpperCase();
    if (!['COMPONENTS_GROUNDED', 'SOURCE_FAITHFUL_DIAGRAM', 'UNRESOLVED'].includes(disposition)) {
      throw new Error('RULE_VISUAL_REFERENT_RECOVERY_DISPOSITION_INVALID');
    }
    const componentRefs = unique(recovery.componentRefs || []);
    if (componentRefs.some((id) => !componentIds.has(id))) throw new Error('RULE_VISUAL_REFERENT_RECOVERY_COMPONENT_INVALID');
    const evidence = (recovery.evidence || []).map((row) => normalizeEvidenceFromPacket(row, candidate));
    if (!evidence.length || evidence.some((row) => !row || !(row.page > 0) || !row.quote)) {
      throw new Error('RULE_VISUAL_REFERENT_RECOVERY_EVIDENCE_INVALID');
    }
    if (disposition === 'COMPONENTS_GROUNDED' && !componentRefs.length) {
      throw new Error('RULE_VISUAL_REFERENT_RECOVERY_COMPONENTS_MISSING');
    }
    if (disposition !== 'COMPONENTS_GROUNDED' && componentRefs.length) {
      throw new Error('RULE_VISUAL_REFERENT_RECOVERY_COMPONENTS_UNEXPECTED');
    }
    if (disposition === 'SOURCE_FAITHFUL_DIAGRAM' && candidate.trustedCurrentReferents?.length) {
      throw new Error('RULE_VISUAL_REFERENT_RECOVERY_DIAGRAM_CANNOT_SUPERSEDE_GROUNDED_COMPONENT');
    }
    if (!clean(recovery.reason)) throw new Error('RULE_VISUAL_REFERENT_RECOVERY_REASON_MISSING');
    return {
      ruleAtomId: atomId,
      disposition,
      componentRefs,
      evidence,
      reason: clean(recovery.reason),
    };
  });
  return { contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT, recoveries: normalized };
}

function applyRuleVisualReferentRecovery(model = {}, recovery = {}) {
  const packet = buildRuleVisualReferentRecoveryPacket(model);
  const validated = validateRuleVisualReferentRecovery(
    packet, recovery.result || recovery,
  );
  const byAtomId = new Map(validated.recoveries.map((row) => [row.ruleAtomId, row]));
  const trustedIds = new Set(packet.components
    .filter((component) => component.trustState === 'SOURCE_GROUNDED_COMPONENT').map((component) => component.id));
  return {
    ...model,
    visualReferentRecovery: {
      contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
      inputHash: recovery.inputHash || null,
      provider: recovery.provider || null,
      model: recovery.model || null,
      recoveries: validated.recoveries,
    },
    ruleAtoms: (model.ruleAtoms || []).map((atom) => {
      const row = byAtomId.get(atom.id);
      if (!row) return atom;
      const requirement = { ...(atom.visualRequirement || {}) };
      const current = unique([...(atom.componentRefs || []), ...(requirement.requiredObjects || [])]);
      const retained = current.filter((id) => trustedIds.has(id));
      const superseded = current.filter((id) => !trustedIds.has(id));
      if (row.disposition === 'COMPONENTS_GROUNDED') {
        requirement.requiredObjects = unique([...retained, ...row.componentRefs]);
        requirement.actualGameAssetRequired = true;
      }
      if (row.disposition === 'SOURCE_FAITHFUL_DIAGRAM') {
        // This path is intentionally limited to rules where the supplied
        // evidence says no game component is the visual referent. It prevents
        // an arbitrary asset search; it is not a decorative fallback.
        requirement.requiredObjects = [];
        requirement.actualGameAssetRequired = false;
        requirement.preferredComposition = 'SOURCE_FAITHFUL_DIAGRAM';
        requirement.diagramKind = 'SOURCE_GROUNDED_RULE_DIAGRAM';
      }
      if (row.disposition === 'UNRESOLVED') {
        requirement.requiredObjects = retained;
        requirement.unresolvedSourceReferents = superseded;
      }
      requirement.visualReferentRecovery = {
        contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
        disposition: row.disposition,
        evidence: row.evidence,
        reason: row.reason,
        supersededComponentRefs: superseded,
      };
      return {
        ...atom,
        componentRefs: row.disposition === 'COMPONENTS_GROUNDED'
          ? unique([...retained, ...row.componentRefs])
          : (row.disposition === 'SOURCE_FAITHFUL_DIAGRAM' ? [] : retained),
        visualRequirement: requirement,
      };
    }),
  };
}

module.exports = {
  RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
  buildRuleVisualReferentRecoveryPacket,
  hashVisualReferentRecoveryPacket,
  validateRuleVisualReferentRecovery,
  applyRuleVisualReferentRecovery,
  componentTrust,
};
