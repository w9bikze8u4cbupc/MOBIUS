const crypto = require('node:crypto');

const RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT = 'mobius-rulebook-domain-synthesis-v1';
const RULEBOOK_DOMAIN_SYNTHESIS_PROMPT_VERSION = 'mobius-rulebook-domain-synthesis-prompt-v1';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value ?? null);
const hash = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');

// These are reusable pedagogical rule domains, not game-specific concepts.
const DOMAIN_BATCHES = Object.freeze([
  { id: 'foundation', domains: ['identity_theme', 'objective', 'components'] },
  { id: 'setup', domains: ['complete_setup', 'first_player_rule', 'component_placement_orientation'] },
  { id: 'turn', domains: ['turn_round_age_structure', 'mandatory_actions', 'alternative_actions', 'optional_actions', 'costs_resources_payment'] },
  { id: 'systems', domains: ['triggered_effects', 'major_special_systems', 'immediate_victories'] },
  { id: 'ending', domains: ['end_condition', 'final_scoring', 'tie_breakers'] },
  { id: 'reference', domains: ['first_game_pitfalls', 'reference_aids_score_sheet'] },
]);

function batchForDomain(domain) {
  return DOMAIN_BATCHES.find((entry) => entry.domains.includes(domain))?.id || 'other';
}

function buildDomainSynthesisPackets({ sourcePdfSha256, documentMap, domainEvidence = {}, components = [], providerContract = null } = {}) {
  const grouped = new Map();
  for (const [domain, evidence] of Object.entries(domainEvidence || {})) {
    if (!Array.isArray(evidence) || evidence.length === 0) continue;
    const id = batchForDomain(domain);
    if (!grouped.has(id)) grouped.set(id, { id, domains: [], evidence: [] });
    const batch = grouped.get(id);
    batch.domains.push(domain);
    for (const item of evidence) {
      if (!Number.isInteger(Number(item?.page)) || Number(item.page) < 1 || !clean(item?.excerptHash) || !clean(item?.quote)) continue;
      batch.evidence.push({
        id: `e-${domain}-${Number(item.page)}-${clean(item.excerptHash).slice(0, 12)}`,
        domain,
        page: Number(item.page),
        section: clean(item.section) || `Page ${item.page}`,
        quote: clean(item.quote),
        excerptHash: clean(item.excerptHash),
      });
    }
  }
  return [...grouped.values()].map((batch) => {
    const uniqueEvidence = [...new Map(batch.evidence.map((entry) => [entry.id, entry])).values()];
    const packet = {
      contract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
      promptVersion: RULEBOOK_DOMAIN_SYNTHESIS_PROMPT_VERSION,
      sourcePdfSha256: clean(sourcePdfSha256),
      documentMap: {
        contract: clean(documentMap?.contract),
        citationConvention: clean(documentMap?.citationConvention),
        hash: hash((documentMap?.pages || []).map((page) => ({ page: page.humanPageNumber, textHash: page.textHash, heading: page.heading }))),
      },
      batchId: batch.id,
      domains: [...new Set(batch.domains)].sort(),
      evidence: uniqueEvidence,
      components: (components || []).slice(0, 120).map((component) => ({ id: clean(component?.id), name: clean(component?.name || component?.label) })).filter((component) => component.id && component.name),
      providerContract: providerContract || null,
    };
    return { ...packet, cacheKey: hash({ ...packet, providerContract: packet.providerContract }) };
  }).filter((packet) => packet.evidence.length > 0);
}

function buildDomainSynthesisPrompt(packet) {
  return `Return ONLY one JSON object matching this schema:\n{"atoms":[{"id":"stable-lowercase-id","domain":"setup|action|scoring|end_condition|triggered_effect|reference_aid|source_evidence","coverageDomains":["one or more requested domains"],"title":"short factual title","actor":null,"trigger":null,"mandatoryOrOptional":"mandatory|optional|conditional","prerequisites":[],"choice":null,"costs":[{"description":"exact source-grounded cost or condition"}],"procedureSteps":["ordered source-grounded step"],"placement":null,"orientation":null,"stateBefore":null,"stateChange":null,"stateAfter":null,"result":null,"followUp":null,"exceptions":[],"componentRefs":["only component IDs from the supplied list"],"sourceRefs":[{"evidenceId":"exact supplied evidence ID"}]}]}\n\nYou are extracting canonical board-game rules from official evidence. Requested domains: ${packet.domains.join(', ')}.\n\nRules:\n- Use ONLY the supplied evidence. Do not use draft narration, outside knowledge, assumptions, or common board-game conventions.\n- Cite every atom with one or more exact evidenceId values. Do not cite a page or evidenceId that was not supplied.\n- Produce an empty atoms array when the evidence cannot support a complete claim.\n- Keep end conditions, scoring, and tiebreakers separate.\n- Preserve quantities, costs, conditions, face/orientation, placement, and state changes exactly when present.\n- For setup atoms, identify components and procedure/placement when the evidence supports them.\n- For action atoms, identify actor/action/state change/result when the evidence supports them.\n- Never invent a component ID; omit it if the supplied component list does not establish a match.\n\nDocument-map metadata: ${JSON.stringify(packet.documentMap)}\nKnown source-grounded components: ${JSON.stringify(packet.components)}\nEvidence packets: ${JSON.stringify(packet.evidence)}`;
}

function parseDomainSynthesisJson(content) {
  const text = clean(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.atoms)) {
    const error = new Error('RULEBOOK_DOMAIN_SYNTHESIS_INVALID: expected an object with atoms array.');
    error.code = 'RULEBOOK_DOMAIN_SYNTHESIS_INVALID';
    throw error;
  }
  return { atoms: parsed.atoms };
}

function validateDomainSynthesisPacket(packet) {
  if (!packet || packet.contract !== RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT || !/^[a-f0-9]{64}$/i.test(clean(packet.sourcePdfSha256))) return false;
  if (!Array.isArray(packet.domains) || packet.domains.length === 0 || !Array.isArray(packet.evidence) || packet.evidence.length === 0) return false;
  return packet.evidence.every((entry) => Number.isInteger(Number(entry?.page)) && Number(entry.page) > 0 && clean(entry.excerptHash) && clean(entry.quote));
}

module.exports = {
  DOMAIN_BATCHES,
  RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
  RULEBOOK_DOMAIN_SYNTHESIS_PROMPT_VERSION,
  buildDomainSynthesisPackets,
  buildDomainSynthesisPrompt,
  parseDomainSynthesisJson,
  validateDomainSynthesisPacket,
};
