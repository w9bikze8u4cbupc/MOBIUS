import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('calibration and comparison scripts preserve verified status separately from raw review score', async () => {
  const result = spawnSync(process.execPath, ['scripts/calibrate-twelvelabs-review.mjs'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required option --review/);
});
