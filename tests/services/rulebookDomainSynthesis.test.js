const {
  RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
  buildDomainSynthesisPackets,
  buildValidatorGuidedCorrectivePacket,
  buildExpandedRetrievalPacket,
  buildDomainSynthesisPrompt,
  parseDomainSynthesisJson,
  validateDomainSynthesisPacket,
} = require('../../src/services/rulebookDomainSynthesis.cjs');

describe('rulebook domain synthesis evidence contract', () => {
  const documentMap = {
    contract: 'mobius-rulebook-document-map-v1',
    citationConvention: 'one-based-pdf-page',
    pages: [{ humanPageNumber: 1, textHash: 'a'.repeat(64), heading: 'Setup' }],
  };
  const evidence = {
    complete_setup: [{ page: 1, section: 'Setup', quote: 'Place the board in the centre.', excerptHash: 'b'.repeat(64) }],
  };

  test('packets carry only real one-based evidence and deterministic cache identity', () => {
    const first = buildDomainSynthesisPackets({ sourcePdfSha256: 'c'.repeat(64), documentMap, domainEvidence: evidence, components: [{ id: 'board', name: 'Board' }], providerContract: [{ name: 'test', model: 'test' }] });
    const second = buildDomainSynthesisPackets({ sourcePdfSha256: 'c'.repeat(64), documentMap, domainEvidence: evidence, components: [{ id: 'board', name: 'Board' }], providerContract: [{ name: 'test', model: 'test' }] });
    expect(first).toHaveLength(1);
    expect(first[0].contract).toBe(RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT);
    expect(validateDomainSynthesisPacket(first[0])).toBe(true);
    expect(first[0].cacheKey).toBe(second[0].cacheKey);
    expect(first[0].evidence.every((entry) => entry.page > 0)).toBe(true);
    expect(buildDomainSynthesisPrompt(first[0])).toContain(first[0].evidence[0].id);
  });

  test('corrective and expanded packets preserve source evidence while changing cache identity', () => {
    const [packet] = buildDomainSynthesisPackets({
      sourcePdfSha256: 'd'.repeat(64), documentMap, domainEvidence: evidence,
      components: [{ id: 'board', name: 'Board' }], providerContract: [{ name: 'test', model: 'test' }],
    });
    const corrective = buildValidatorGuidedCorrectivePacket({
      packet,
      candidates: [{ title: 'Place the board', coverageDomains: ['complete_setup'], rawCandidate: { title: 'Place the board' }, issues: ['setup-missing-procedure-or-components'] }],
      domainRequirements: { contract: 'rule-v1', complete_setup: ['procedureSteps', 'componentRefs'] },
    });
    const expanded = buildExpandedRetrievalPacket({ packet, evidence: [...packet.evidence, { ...packet.evidence[0], id: `${packet.evidence[0].id}-neighbor`, page: 2 }] });
    expect(corrective.cacheKey).not.toBe(packet.cacheKey);
    expect(corrective.evidence).toEqual(packet.evidence);
    expect(expanded.cacheKey).not.toBe(packet.cacheKey);
    expect(expanded.evidence).toHaveLength(packet.evidence.length + 1);
  });

  test('strict parser accepts only an atom-array object', () => {
    expect(parseDomainSynthesisJson('{"atoms":[]}')).toEqual({ atoms: [] });
    expect(() => parseDomainSynthesisJson('{"summary":"not structured"}')).toThrow(/expected an object with atoms array/);
  });
});
