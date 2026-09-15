import test from 'node:test';
import assert from 'node:assert/strict';
import { runBoundedVisualReviewBatches, visualAutopilotBatchLimit } from '../../scripts/run-rulebook-production.mjs';

test('visual Autopilot runs bounded recovery batches before Cockpit can see a final review', async () => {
  const reports = [
    { summary: { providerCalls: 4, cacheHits: 3, continuationRequired: true }, scenes: [] },
    { summary: { providerCalls: 2, cacheHits: 7, continuationRequired: false }, scenes: [] },
  ];
  let invoked = 0;
  const result = await runBoundedVisualReviewBatches({
    env: { MOBIUS_VISUAL_AUTOPILOT_MAX_BATCHES: '3' },
    runBatch: async () => { invoked += 1; },
    readReport: () => reports[Math.min(invoked - 1, reports.length - 1)],
  });
  assert.equal(invoked, 2);
  assert.equal(result.continuationRequired, false);
  assert.deepEqual(result.batches.map((batch) => batch.providerCalls), [4, 2]);
});

test('visual Autopilot never spins when the durable budget already deferred a batch', async () => {
  let invoked = 0;
  const report = { summary: { providerCalls: 0, cacheHits: 12, continuationRequired: true }, scenes: [] };
  const result = await runBoundedVisualReviewBatches({
    env: { MOBIUS_VISUAL_AUTOPILOT_MAX_BATCHES: '4' },
    runBatch: async () => { invoked += 1; },
    readReport: () => report,
  });
  assert.equal(invoked, 1);
  assert.equal(result.continuationRequired, true);
});

test('visual Autopilot limit is conservative and bounded', () => {
  assert.equal(visualAutopilotBatchLimit({}), 2);
  assert.equal(visualAutopilotBatchLimit({ MOBIUS_VISUAL_AUTOPILOT_MAX_BATCHES: '0' }), 1);
  assert.equal(visualAutopilotBatchLimit({ MOBIUS_VISUAL_AUTOPILOT_MAX_BATCHES: '99' }), 4);
});
