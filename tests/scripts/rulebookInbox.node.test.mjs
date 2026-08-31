import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { computePdfIdentity } from '../../scripts/rulebook-library.mjs';
import {
  acquireLease,
  classifyInboxError,
  ensureInbox,
  inboxStatus,
  runInboxOnce,
  validateRelease,
} from '../../scripts/run-rulebook-inbox.mjs';

const tempRoot = () => fs.mkdtemp(path.join(os.tmpdir(), 'mobius-inbox-test-'));

test('PDF identity is stable across a filename change', async () => {
  const root = await tempRoot();
  const first = path.join(root, 'first.pdf');
  const second = path.join(root, 'renamed-rulebook.pdf');
  await fs.writeFile(first, Buffer.from('%PDF-identity-test'));
  await fs.copyFile(first, second);
  const left = await computePdfIdentity(first);
  const right = await computePdfIdentity(second);
  assert.equal(left.sha256, right.sha256);
  assert.equal(left.bytes, right.bytes);
  assert.notEqual(left.filename, right.filename);
});

test('atomic lease permits one owner and recovers a stale owner', async () => {
  const paths = await ensureInbox(path.join(await tempRoot(), 'inbox'));
  const [left, right] = await Promise.all([
    acquireLease(paths, { ownerId: 'left', leaseMs: 60000 }),
    acquireLease(paths, { ownerId: 'right', leaseMs: 60000 }),
  ]);
  assert.equal([left, right].filter(Boolean).length, 1);
  await (left || right).release();
  await fs.writeFile(paths.lease, JSON.stringify({ ownerId: 'dead', heartbeatAt: new Date(Date.now() - 120000).toISOString(), leaseMs: 1000 }));
  const recovered = await acquireLease(paths, { ownerId: 'recovered', leaseMs: 1000 });
  assert.equal(recovered.ownerId, 'recovered');
  await recovered.release();
});

test('renamed bytes resolve to an existing completed project without invoking production', async () => {
  const root = await tempRoot();
  const source = path.join(root, 'Jaipur-renamed.pdf');
  await fs.writeFile(source, Buffer.from('%PDF-completed-source'));
  const identity = await computePdfIdentity(source);
  const descriptorDir = path.join(root, 'data', 'jaipur-existing', 'source');
  await fs.mkdir(descriptorDir, { recursive: true });
  await fs.writeFile(path.join(descriptorDir, 'source.json'), JSON.stringify({ documentId: 'jaipur-existing', sha256: identity.sha256, status: 'complete' }));
  let called = false;
  const result = await runInboxOnce({ root, pdf: source, runner: async () => { called = true; } });
  assert.deepEqual({ status: result.status, duplicate: result.duplicate, projectId: result.projectId }, { status: 'completed', duplicate: true, projectId: 'jaipur-existing' });
  assert.equal(called, false);
  assert.equal((await inboxStatus({ root })).completed, 1);
});

test('a physical renamed duplicate is archived and does not remain actionable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-inbox-'));
  const source = path.join(root, 'first.pdf');
  await fs.writeFile(source, '%PDF-duplicate-proof');
  const paths = await ensureInbox(path.join(root, 'data', 'rulebook-inbox'));
  await fs.copyFile(source, path.join(paths.waiting, 'renamed.pdf'));
  const identity = await computePdfIdentity(source);
  const projects = path.join(root, 'data', 'existing', 'source');
  await fs.mkdir(projects, { recursive: true });
  await fs.writeFile(path.join(projects, 'source.json'), JSON.stringify({ documentId: 'existing', sha256: identity.sha256, status: 'complete' }));
  const result = await runInboxOnce({ root, runner: async () => { throw new Error('runner must not be called'); } });
  assert.equal(result.status, 'completed');
  assert.equal(result.duplicate, true);
  assert.equal(result.item.status, 'completed');
  assert.equal((await fs.readdir(paths.waiting)).length, 0);
  assert.equal((await fs.readdir(paths.completed)).length, 1);
  assert.equal(identity.sha256, result.item.source.sha256);
});

test('worker interruption is retained as retryable state and a concurrent worker is refused', async () => {
  const root = await tempRoot();
  const source = path.join(root, 'new-game.pdf');
  await fs.writeFile(source, Buffer.from('%PDF-new-source'));
  const runner = async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    throw new Error('network timeout while contacting provider');
  };
  const first = runInboxOnce({ root, pdf: source, runner, leaseMs: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await runInboxOnce({ root, runner: async () => {} });
  const firstResult = await first;
  assert.equal(second.status, 'busy');
  assert.equal(firstResult.status, 'failed-retryable');
  assert.equal((await inboxStatus({ root })).counts['failed-retryable'], 1);
});

test('terminal parser failures are quarantined and not retried forever', () => {
  assert.deepEqual(classifyInboxError(new Error('PDF extraction produced no usable text')), { class: 'terminal', retryable: false });
  assert.deepEqual(classifyInboxError(new Error('ElevenLabs network timeout')), { class: 'retryable', retryable: true });
});

test('release validation checks every declared payload checksum', async () => {
  const root = await tempRoot();
  const release = path.join(root, 'release');
  await fs.mkdir(release, { recursive: true });
  const names = ['tutorial.mp4', 'captions.srt', 'chapters.json', 'poster.jpg', 'thumbnail.jpg', 'production-report.json', 'editorial-report.json', 'source-summary.json', 'completion-summary.txt'];
  const files = [];
  for (const name of names) {
    const contents = Buffer.from(`payload:${name}`);
    await fs.writeFile(path.join(release, name), contents);
    files.push({ path: name, bytes: contents.length, sha256: crypto.createHash('sha256').update(contents).digest('hex') });
  }
  await fs.writeFile(path.join(release, 'release-manifest.json'), JSON.stringify({ files }));
  assert.equal((await validateRelease(release)).valid, true);
  await fs.writeFile(path.join(release, 'poster.jpg'), 'tampered');
  assert.equal((await validateRelease(release)).valid, false);
});
