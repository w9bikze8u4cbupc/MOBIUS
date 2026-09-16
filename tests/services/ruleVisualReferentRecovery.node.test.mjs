import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recoverRuleVisualReferents } from '../../src/services/sourceVisualSelection.js';

function modelWithRecoverableAtoms(count = 7) {
  return {
    sourcePdfSha256: 'a'.repeat(64), contract: 'fixture-rule-atoms-v1',
    components: [{ id: 'trusted-card', name: 'Card', category: 'card', sourcePage: 1, sourceQuote: 'Card', confidence: 0.9 }],
    ruleAtoms: Array.from({ length: count }, (_, index) => ({
      id: `rule-${index + 1}`, domain: 'actions', title: `Action ${index + 1}`, reviewState: 'accepted',
      teaching: { narration: 'Explain the action.' }, componentRefs: ['untrusted-fragment'],
      visualRequirement: { actualGameAssetRequired: true, requiredObjects: ['untrusted-fragment'], purpose: 'teach action' },
      sourceRefs: [{ page: 2, quote: `Official evidence for action ${index + 1}.` }],
    })),
  };
}

test('rule visual referent recovery bounds provider packets and replays each validated batch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-referent-batches-'));
  const cachePath = path.join(root, 'recovery.json');
  const seenPackets = [];
  const complete = async ({ messages }) => {
    const packet = JSON.parse(String(messages[0].content).slice(String(messages[0].content).lastIndexOf('\n') + 1));
    seenPackets.push(packet);
    return { response: { choices: [{ message: { content: JSON.stringify({
      recoveries: packet.candidates.map((candidate) => ({
        ruleAtomId: candidate.id, disposition: 'UNRESOLVED', componentRefs: [],
        evidence: [{ page: candidate.sourceEvidence[0].page, quote: candidate.sourceEvidence[0].quote }], reason: 'No trusted component is established by the supplied evidence.',
      })),
    }) } }] } };
  };
  const options = { model: modelWithRecoverableAtoms(), cachePath, env: { OPENAI_API_KEY: 'fixture', OPENAI_MODEL: 'fixture-model' }, complete };
  const first = await recoverRuleVisualReferents(options);
  assert.equal(first.providerCalls, 2);
  assert.equal(first.result.recoveries.length, 7);
  assert.ok(seenPackets.every((packet) => packet.candidates.length <= 6));
  const replay = await recoverRuleVisualReferents({ ...options, complete: async () => { throw new Error('provider must not run on replay'); } });
  assert.equal(replay.providerCalls, 0);
  assert.equal(replay.reused, true);
  await fs.rm(root, { recursive: true, force: true });
});
