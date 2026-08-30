import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStagePlan, canReuseRenderedMedia } from '../../scripts/run-source-grounded-production.mjs';

test('completed stages are reused only when the stable input hash and outputs match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobius-production-plan-'));
  const output = join(dir, 'render-config.json');
  writeFileSync(output, '{}');
  try {
    const checkpoint = {
      stages: {
        handoff: { inputHash: 'hash-a', outputs: [output] },
        render: { inputHash: 'hash-old', outputs: [output] },
      },
    };
    const plan = buildStagePlan({
      checkpoint,
      stages: ['handoff', 'render'],
      inputHash: 'hash-a',
      outputsByStage: { handoff: [output], render: [output] },
    });
    assert.deepEqual(plan, [
      { stage: 'handoff', reuse: true },
      { stage: 'render', reuse: false },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing checkpoint outputs force recovery instead of false reuse', () => {
  const plan = buildStagePlan({
    checkpoint: { stages: { narration: { inputHash: 'same', outputs: ['missing.mp3'] } } },
    stages: ['narration'],
    inputHash: 'same',
    outputsByStage: { narration: ['missing.mp3'] },
  });
  assert.equal(plan[0].reuse, false);
});

test('render reuse requires the current input contract and matching output hash', () => {
  const checkpoint = {
    stages: {
      render: {
        inputHash: 'render-input',
        output: 'production.mp4',
        outputSha256: 'output-a',
      },
    },
  };
  assert.equal(canReuseRenderedMedia({ checkpoint, renderHash: 'render-input', outputPath: 'production.mp4', outputSha256: 'output-a' }), true);
  assert.equal(canReuseRenderedMedia({ checkpoint, renderHash: 'changed-input', outputPath: 'production.mp4', outputSha256: 'output-a' }), false);
  assert.equal(canReuseRenderedMedia({ checkpoint, renderHash: 'render-input', outputPath: 'production.mp4', outputSha256: 'changed-output' }), false);
});
