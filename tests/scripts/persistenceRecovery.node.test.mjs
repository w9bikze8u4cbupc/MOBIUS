import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLease, ensureInbox, runInboxOnce, requeueInboxItem, classifyInboxError } from '../../scripts/run-rulebook-inbox.mjs';

test('413 requires explicit recovery, releases owned metadata and cannot loop on an unchanged source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-persistence-recovery-'));
  const paths = await ensureInbox(path.join(root, 'data', 'rulebook-inbox'));
  await fs.writeFile(path.join(paths.waiting, 'fixture.pdf'), '%PDF-1.4 fixture');
  let calls = 0;
  const runner = async () => { calls++; throw Object.assign(new Error('POST /production-state failed (413)'), { status: 413, code: 'PROJECT_STATE_TOO_LARGE' }); };
  const result = await runInboxOnce({ root, runner });
  assert.equal(result.status, 'failed-retryable');
  const state = JSON.parse(await fs.readFile(paths.state));
  const [[sha, item]] = Object.entries(state.items);
  assert.equal(item.recoveryRequired, true);
  assert.equal(item.ownerId, null); assert.equal(item.pid, null); assert.equal(item.claimedAt, null);
  assert.ok(item.lastWorker.ownerId);
  assert.equal(await fs.stat(paths.lease).then(() => true, () => false), false);
  assert.equal((await runInboxOnce({ root, runner })).status, 'idle');
  assert.equal(calls, 1);
  const recovered = await requeueInboxItem({ root, sha });
  assert.equal(recovered.status, 'waiting'); assert.equal(recovered.item.recoveryRequired, false);
  assert.equal(recovered.item.failureHistory.length, 1);
  assert.deepEqual(classifyInboxError(new Error('invalid PDF')), { class: 'terminal', retryable: false });
});

test('expired live lease is protected, foreign token cannot be released or overwritten', async () => {
  const paths = await ensureInbox(path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-owned-lease-')), 'inbox'));
  const owned = await acquireLease(paths, { ownerId: 'same-label' });
  const foreign = { ...owned, token: 'different-token', heartbeatAt: '2000-01-01T00:00:00Z' };
  await fs.writeFile(paths.lease, JSON.stringify(foreign));
  await owned.heartbeat(); await owned.release();
  assert.equal(JSON.parse(await fs.readFile(paths.lease)).token, foreign.token);
  assert.equal(await acquireLease(paths), null);
});

test('review exit clears the owned lease and preserves review state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-review-release-'));
  const paths = await ensureInbox(path.join(root, 'data', 'rulebook-inbox'));
  await fs.writeFile(path.join(paths.waiting, 'fixture.pdf'), '%PDF-1.4 fixture');
  await runInboxOnce({ root, runner: async () => ({ status: 'review_required', projectId: 'fixture', reviewItems: 71 }) });
  const [item] = Object.values(JSON.parse(await fs.readFile(paths.state)).items);
  assert.equal(item.status, 'review-required'); assert.equal(item.reviewItems, 71); assert.equal(item.ownerId, null);
});
