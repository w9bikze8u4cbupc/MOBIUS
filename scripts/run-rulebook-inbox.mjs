#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computePdfIdentity, discoverRulebooks, findProcessedBySha } from './rulebook-library.mjs';
import { runZeroState } from './run-rulebook-production.mjs';

export const INBOX_STATUSES = Object.freeze([
  'waiting', 'claimed', 'processing', 'qa', 'completed', 'failed-retryable', 'failed-terminal',
]);
export const ACTIVE_STATUSES = Object.freeze(['claimed', 'processing', 'qa']);
export const DEFAULT_RETRY_LIMIT = 3;
export const DEFAULT_LEASE_MS = 15 * 60 * 1000;
export const DEFAULT_POLL_MS = 30 * 1000;
const STATE_VERSION = 1;

const now = () => new Date().toISOString();
const randomToken = () => crypto.randomBytes(8).toString('hex');
const hashFile = (filePath) => crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value ?? null);
const hashValue = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');
const safeRead = (filePath, fallback = null) => {
  try { return JSON.parse(readFileSync(filePath, 'utf8')); } catch { return fallback; }
};

function slug(value) {
  return String(value || 'rulebook').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 64) || 'rulebook';
}

function gitCommit(root) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

export function inboxPaths(root) {
  const resolved = path.resolve(root);
  return {
    root: resolved,
    waiting: path.join(resolved, 'waiting'),
    claimed: path.join(resolved, 'claimed'),
    processing: path.join(resolved, 'processing'),
    qa: path.join(resolved, 'qa'),
    completed: path.join(resolved, 'completed'),
    failedRetryable: path.join(resolved, 'failed-retryable'),
    failedTerminal: path.join(resolved, 'failed-terminal'),
    releases: path.join(resolved, 'releases'),
    state: path.join(resolved, 'inbox-state.json'),
    lease: path.join(resolved, 'worker-lease.json'),
    events: path.join(resolved, 'events.jsonl'),
  };
}

async function atomicWrite(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${randomToken()}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filePath);
}

export async function ensureInbox(root) {
  const paths = inboxPaths(root);
  await Promise.all([
    paths.root, paths.waiting, paths.claimed, paths.processing, paths.qa,
    paths.completed, paths.failedRetryable, paths.failedTerminal, paths.releases,
  ].map((directory) => fs.mkdir(directory, { recursive: true })));
  if (!existsSync(paths.state)) await atomicWrite(paths.state, { schemaVersion: STATE_VERSION, updatedAt: now(), items: {} });
  if (!existsSync(paths.events)) await fs.writeFile(paths.events, '', 'utf8');
  return paths;
}

async function loadState(paths) {
  const state = safeRead(paths.state, { schemaVersion: STATE_VERSION, updatedAt: now(), items: {} });
  state.schemaVersion = state.schemaVersion || STATE_VERSION;
  state.items = state.items || {};
  return state;
}

async function saveState(paths, state) {
  state.updatedAt = now();
  await atomicWrite(paths.state, state);
}

async function appendEvent(paths, type, payload = {}) {
  await fs.appendFile(paths.events, `${JSON.stringify({ at: now(), type, ...payload })}\n`, 'utf8');
}

async function listPdfs(directory, result = []) {
  if (!existsSync(directory)) return result;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) await listPdfs(filePath, result);
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') result.push(filePath);
  }
  return result;
}

export function classifyInboxError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const providerAvailability = error?.code === 'AI_PROVIDER_ALL_FAILED'
    || error?.classification === 'provider_unavailable'
    || /all configured .*provider|provider_unavailable|quota_exhausted|credit_balance_exhausted|credit.*exhausted/i.test(message);
  const retryable = providerAvailability || /econn|etimedout|enotfound|network|timeout|\b429\b|rate limit|\b5\d\d\b|temporar|elevenlabs|openai/i.test(message);
  const terminal = /ai_not_configured|no usable text|ocr before production|invalid.*(pdf|script|storyboard)|missing.*(credential|api key)|unknown narration preset|not found/i.test(message);
  if (terminal && !retryable) return { class: 'terminal', retryable: false };
  return { class: retryable ? 'retryable' : 'terminal', retryable };
}

export async function acquireLease(paths, { ownerId = `${process.pid}-${randomToken()}`, leaseMs = DEFAULT_LEASE_MS } = {}) {
  const lease = { ownerId, pid: process.pid, startedAt: now(), heartbeatAt: now(), leaseMs };
  try {
    const handle = await fs.open(paths.lease, 'wx');
    await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, 'utf8');
    await handle.close();
    return {
      ...lease,
      async heartbeat() {
        lease.heartbeatAt = now();
        await atomicWrite(paths.lease, lease);
      },
      async release() {
        if (safeRead(paths.lease, null)?.ownerId !== ownerId) return;
        await fs.unlink(paths.lease).catch(() => {});
      },
    };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = safeRead(paths.lease, null);
    if (!current) {
      const stat = await fs.stat(paths.lease).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs <= leaseMs) return null;
      await fs.unlink(paths.lease).catch(() => {});
      return acquireLease(paths, { ownerId, leaseMs });
    }
    const lastBeat = Date.parse(current?.heartbeatAt || current?.startedAt || 0);
    if (current && Number.isFinite(lastBeat) && Date.now() - lastBeat <= Number(current.leaseMs || leaseMs)) return null;
    await fs.unlink(paths.lease).catch(() => {});
    return acquireLease(paths, { ownerId, leaseMs });
  }
}

export async function discoverInbox(root, { dataRoot = path.join(path.dirname(path.resolve(root)), 'data') } = {}) {
  const paths = await ensureInbox(root);
  const state = await loadState(paths);
  const files = await listPdfs(paths.waiting);
  const identities = await Promise.all(files.map(computePdfIdentity));
  const rows = [];
  for (const identity of identities.sort((left, right) => left.path.localeCompare(right.path))) {
    const known = state.items[identity.sha256] || null;
    const processed = await findProcessedBySha(dataRoot, identity.sha256);
    const complete = processed.find((record) => record.status === 'complete'
      || existsSync(path.join(dataRoot, record.documentId || '', 'production', 'production-report.json')));
    rows.push({ identity, state: known, processed, completedProjectId: complete?.documentId || null });
  }
  const waiting = rows.filter((row) => !ACTIVE_STATUSES.includes(row.state?.status)
    && row.state?.status !== 'completed' && row.state?.status !== 'failed-terminal' && !row.completedProjectId);
  const duplicates = rows.filter((row) => !ACTIVE_STATUSES.includes(row.state?.status)
    && row.state?.status !== 'failed-terminal' && (row.completedProjectId || row.state?.status === 'completed'));
  return { paths, state, rows, waiting, duplicates };
}

async function updateItem(paths, state, sha256, changes) {
  state.items[sha256] = { ...(state.items[sha256] || {}), ...changes, updatedAt: now() };
  await saveState(paths, state);
  return state.items[sha256];
}

function sourceForRecord(item) { return item?.sourcePath || item?.source?.path || item?.identity?.path || null; }

async function putInInbox(paths, source) {
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) throw new Error(`Rulebook PDF not found: ${resolved}`);
  if (resolved.toLowerCase().startsWith(`${paths.waiting.toLowerCase()}${path.sep}`)) return resolved;
  const target = path.join(paths.waiting, path.basename(resolved));
  if (!existsSync(target) || hashFile(target) !== hashFile(resolved)) await fs.copyFile(resolved, target);
  return target;
}

async function archiveSource(paths, source, identity, directory) {
  if (!source || !source.toLowerCase().startsWith(`${paths.waiting.toLowerCase()}${path.sep}`)) return null;
  const target = path.join(directory, `${identity.sha256.slice(0, 16)}-${identity.filename}`);
  await fs.mkdir(directory, { recursive: true });
  if (path.resolve(source).toLowerCase() !== path.resolve(target).toLowerCase()) await fs.rename(source, target);
  return target;
}

function activeItem(state) {
  return Object.entries(state.items).find(([, item]) => ACTIVE_STATUSES.includes(item.status));
}

async function selectWork(root, paths, state, explicitPdf) {
  if (explicitPdf) {
    const sourcePath = await putInInbox(paths, explicitPdf);
    const identity = await computePdfIdentity(sourcePath);
    return { sourcePath, identity, existing: state.items[identity.sha256] || null };
  }
  const inventory = await discoverInbox(paths.root, { dataRoot: path.join(root, 'data') });
  const active = activeItem(inventory.state);
  if (active) {
    const [sha256, item] = active;
    const sourcePath = sourceForRecord(item);
    if (sourcePath && existsSync(sourcePath)) return { sourcePath, identity: await computePdfIdentity(sourcePath), existing: { ...item, sha256 } };
  }
  const row = inventory.waiting[0] || inventory.duplicates[0];
  return row ? { sourcePath: row.identity.path, identity: row.identity, existing: row.state, processed: row.processed, completedProjectId: row.completedProjectId } : null;
}

function productionArtifactPaths(root, result, item) {
  const projectId = result?.projectId || result?.zeroState?.projectId || item.projectId;
  const productionDir = result?.checkpoint ? path.dirname(result.checkpoint) : path.join(root, 'data', projectId, 'production');
  return {
    projectId, productionDir,
    mp4: result?.render?.outputPath,
    captions: result?.handoff?.captionsPath,
    chapters: result?.handoff?.chaptersPath,
    productionReport: path.join(productionDir, 'production-report.json'),
    editorialReport: path.join(productionDir, 'editorial-report.json'),
  };
}

function ffmpegBinary(root) {
  if (process.env.MOBIUS_FFMPEG_PATH && existsSync(process.env.MOBIUS_FFMPEG_PATH)) return process.env.MOBIUS_FFMPEG_PATH;
  const bundled = path.join(root, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  return existsSync(bundled) ? bundled : 'ffmpeg';
}

function generatePoster(root, source, poster, thumbnail) {
  for (const [output, filter] of [[poster, null], [thumbnail, 'scale=1280:-2']]) {
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '8', '-i', source, '-frames:v', '1'];
    if (filter) args.push('-vf', filter);
    args.push('-q:v', '2', output);
    const result = spawnSync(ffmpegBinary(root), args, { cwd: root, windowsHide: true });
    if (result.status !== 0 || !existsSync(output)) throw new Error(`Poster generation failed: ${result.stderr?.toString() || 'ffmpeg failed'}`);
  }
}

export function releaseEntries(releaseDir) {
  return ['tutorial.mp4', 'captions.srt', 'chapters.json', 'poster.jpg', 'thumbnail.jpg', 'production-report.json', 'editorial-report.json', 'source-summary.json', 'completion-summary.txt']
    .map((name) => ({ name, path: path.join(releaseDir, name) }));
}

export async function validateRelease(releaseDir) {
  const manifest = safeRead(path.join(releaseDir, 'release-manifest.json'), null);
  if (!manifest || !Array.isArray(manifest.files)) return { valid: false, reason: 'invalid release manifest' };
  const required = new Set(releaseEntries(releaseDir).map((entry) => entry.name));
  for (const name of required) if (!manifest.files.some((file) => file.path === name)) return { valid: false, reason: `manifest missing ${name}` };
  for (const file of manifest.files) {
    const target = path.join(releaseDir, file.path);
    if (!existsSync(target)) return { valid: false, reason: `missing ${file.path}` };
    const stat = await fs.stat(target);
    if (stat.size !== file.bytes || hashFile(target) !== file.sha256) return { valid: false, reason: `checksum mismatch ${file.path}` };
  }
  return { valid: true, manifest };
}

async function copyRequired(source, target) {
  if (!source || !existsSync(source)) throw new Error(`Required production artifact is missing: ${source || '(unspecified)'}`);
  await fs.copyFile(source, target);
}

export async function packageRelease({ root, paths, identity, result, item }) {
  const artifacts = productionArtifactPaths(root, result, item);
  if (!artifacts.projectId) throw new Error('Production result did not identify a canonical project.');
  const report = safeRead(artifacts.productionReport, result) || result;
  const gameName = report.gameName || result.gameName || result.zeroState?.gameName || path.basename(identity.filename, '.pdf');
  const releaseName = `${slug(gameName)}-${artifacts.projectId}`;
  const finalDir = path.join(paths.releases, releaseName);
  const existing = await validateRelease(finalDir);
  if (existing.valid) return { releaseDir: finalDir, manifest: existing.manifest, reused: true };
  const staging = path.join(paths.releases, `.staging-${releaseName}-${process.pid}-${randomToken()}`);
  await fs.mkdir(staging, { recursive: true });
  try {
    await copyRequired(artifacts.mp4, path.join(staging, 'tutorial.mp4'));
    await copyRequired(artifacts.captions, path.join(staging, 'captions.srt'));
    await copyRequired(artifacts.chapters, path.join(staging, 'chapters.json'));
    await copyRequired(artifacts.productionReport, path.join(staging, 'production-report.json'));
    await copyRequired(artifacts.editorialReport, path.join(staging, 'editorial-report.json'));
    generatePoster(root, artifacts.mp4, path.join(staging, 'poster.jpg'), path.join(staging, 'thumbnail.jpg'));
    const editorial = safeRead(artifacts.editorialReport, report.editorial || {});
    const sourceSummary = {
      projectId: artifacts.projectId,
      gameName,
      sourcePdf: { filename: identity.filename, bytes: identity.bytes, pageCount: identity.pageCount, sha256: identity.sha256 },
      canonicalSourcePath: report.source?.pdf || null,
      sourceGrounded: true,
      productionStatus: report.status,
    };
    await fs.writeFile(path.join(staging, 'source-summary.json'), `${JSON.stringify(sourceSummary, null, 2)}\n`, 'utf8');
    const fallbackCount = Number(report.visuals?.fallback || editorial.fullPageFallbacks?.length || 0);
    await fs.writeFile(path.join(staging, 'completion-summary.txt'), [
      `MOBIUS tutorial completed: ${sourceSummary.gameName || artifacts.projectId}`,
      `Language: ${report.language || 'fr-CA'} | Voice: ${report.voice?.name || 'Amélie'} (${report.voice?.narrationPreset || 'versioned preset'})`,
      `Duration: ${report.media?.durationSec || report.render?.durationSec || 'n/a'} s | Visual fallbacks: ${fallbackCount} | QA: ${report.status || 'PASS'}`,
      `Package: ${releaseName}`,
      '',
    ].join('\n'), 'utf8');
    const files = releaseEntries(staging).map((entry) => {
      const stat = statSync(entry.path);
      return { path: entry.name, bytes: stat.size, sha256: hashFile(entry.path) };
    });
    const manifest = {
      schemaVersion: 1, packageId: releaseName, projectId: artifacts.projectId, gameName: sourceSummary.gameName,
      sourceSha256: identity.sha256, language: report.language || 'fr-CA',
      editorialContract: report.editorial?.contract?.version || null, voice: report.voice || null,
      durationSec: report.media?.durationSec || report.render?.durationSec || null, media: report.media || null,
      visuals: report.visuals || null, captions: report.captions || null, chapters: report.chapters || null,
      runtimeCommit: gitCommit(root), productionTimestamp: report.generatedAt || now(), files,
    };
    await fs.writeFile(path.join(staging, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(staging, 'SHA256SUMS.txt'), `${files.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`, 'utf8');
    const validation = await validateRelease(staging);
    if (!validation.valid) throw new Error(`Release validation failed: ${validation.reason}`);
    if (existsSync(finalDir)) await fs.rename(finalDir, `${finalDir}.invalid-${Date.now()}`);
    await fs.rename(staging, finalDir);
    return { releaseDir: finalDir, manifest, reused: false };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function runInboxOnce(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const paths = await ensureInbox(path.resolve(options.inboxRoot || path.join(root, 'data', 'rulebook-inbox')));
  const lease = await acquireLease(paths, { leaseMs: Number(options.leaseMs) || DEFAULT_LEASE_MS });
  if (!lease) return { status: 'busy', message: 'Another MOBIUS inbox worker owns the production lease.' };
  const timer = setInterval(() => lease.heartbeat().catch(() => {}), Math.max(1000, Math.min(30000, (Number(options.leaseMs) || DEFAULT_LEASE_MS) / 3)));
  timer.unref?.();
  let work = null;
  try {
    const state = await loadState(paths);
    work = await selectWork(root, paths, state, options.pdf);
    if (!work) return { status: 'idle', message: 'Inbox is healthy and has no unused waiting rulebook.' };
    const processed = work.processed || await findProcessedBySha(path.join(root, 'data'), work.identity.sha256);
    const complete = work.completedProjectId || processed.find((record) => record.status === 'complete'
      || existsSync(path.join(root, 'data', record.documentId || '', 'production', 'production-report.json')));
    if (complete && !ACTIVE_STATUSES.includes(work.existing?.status)) {
      const item = await updateItem(paths, state, work.identity.sha256, {
        status: 'completed', source: { ...work.identity, discoveredAt: now() }, projectId: complete.documentId,
        completedAt: work.existing?.completedAt || now(), lastError: null, result: { duplicateOf: complete.documentId },
      });
      await archiveSource(paths, work.sourcePath, work.identity, paths.completed);
      await appendEvent(paths, 'duplicate_skipped', { sha256: work.identity.sha256, projectId: complete.documentId });
      return { status: 'completed', duplicate: true, projectId: complete.documentId, item };
    }
    const item = await updateItem(paths, state, work.identity.sha256, {
      status: 'claimed', source: { ...work.identity, discoveredAt: work.existing?.source?.discoveredAt || now() }, sourcePath: work.sourcePath,
      claimedAt: work.existing?.claimedAt || now(), ownerId: lease.ownerId, pid: process.pid,
      retryCount: Number(work.existing?.retryCount || 0), lastError: null,
    });
    await appendEvent(paths, 'claimed', { sha256: work.identity.sha256, ownerId: lease.ownerId });
    await updateItem(paths, state, work.identity.sha256, { status: 'processing', stage: 'zero-state-production', startedAt: item.startedAt || now() });
    const runner = options.runner || runZeroState;
    const result = await runner({ root, pdf: work.sourcePath, language: options.language || 'fr-CA', baseUrl: options.baseUrl, apiKey: options.apiKey, forceRender: Boolean(options.forceRender) });
    const projectId = result.projectId || result.zeroState?.projectId;
    await updateItem(paths, state, work.identity.sha256, { status: 'qa', stage: 'release-package', projectId });
    const release = await packageRelease({ root, paths, identity: work.identity, result, item: { ...item, projectId } });
    const finalItem = await updateItem(paths, state, work.identity.sha256, {
      status: 'completed', projectId, completedAt: now(), releaseDir: release.releaseDir,
      result: { status: result.status, durationSec: result.media?.durationSec || result.render?.durationSec, reused: release.reused },
    });
    await archiveSource(paths, work.sourcePath, work.identity, paths.completed);
    await appendEvent(paths, 'completed', { sha256: work.identity.sha256, projectId, releaseDir: release.releaseDir });
    return { status: 'completed', projectId, release, item: finalItem, result };
  } catch (error) {
    if (!work?.identity?.sha256) throw error;
    const state = await loadState(paths);
    const previous = state.items[work.identity.sha256] || {};
    const retryCount = Number(previous.retryCount || 0) + 1;
    const classification = classifyInboxError(error);
    const status = classification.retryable && retryCount < (Number(options.retryLimit) || DEFAULT_RETRY_LIMIT) ? 'failed-retryable' : 'failed-terminal';
    const diagnostic = { status, classification: classification.class, retryCount, error: String(error?.stack || error), source: work.identity, at: now() };
    const directory = status === 'failed-terminal' ? paths.failedTerminal : paths.failedRetryable;
    const diagnosticPath = path.join(directory, `${work.identity.sha256}.failure.json`);
    await fs.writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
    await updateItem(paths, state, work.identity.sha256, { status, source: work.identity, sourcePath: work.sourcePath, retryCount, lastError: diagnostic.error, diagnosticPath, failedAt: now() });
    if (status === 'failed-terminal') await archiveSource(paths, work.sourcePath, work.identity, paths.failedTerminal);
    await appendEvent(paths, 'failed', { sha256: work.identity.sha256, status, retryCount });
    return { status, error: diagnostic.error, retryCount, diagnosticPath };
  } finally {
    clearInterval(timer);
    await lease.release();
  }
}

export async function inboxStatus(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const paths = await ensureInbox(path.resolve(options.inboxRoot || path.join(root, 'data', 'rulebook-inbox')));
  const state = await loadState(paths);
  const entries = Object.entries(state.items);
  const active = entries.find(([, item]) => ACTIVE_STATUSES.includes(item.status));
  const inventory = await discoverInbox(paths.root, { dataRoot: path.join(root, 'data') });
  const waiting = inventory.waiting.length;
  const counts = entries.reduce((result, [, item]) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});
  const lease = safeRead(paths.lease, null);
  return {
    root: paths.root,
    active: active ? {
      sha256: active[0], game: active[1].gameName || active[1].projectId || null,
      stage: active[1].stage || active[1].status,
      elapsedSec: active[1].startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(active[1].startedAt)) / 1000)) : null,
      checkpoint: active[1].checkpoint || null, retryCount: active[1].retryCount || 0, lastError: active[1].lastError || null,
    } : null,
    waiting, completed: counts.completed || 0, counts,
    lease: lease ? { ownerId: lease.ownerId, heartbeatAt: lease.heartbeatAt } : null,
  };
}

export async function runInboxWatch(options = {}) {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  while (!stopping) {
    await runInboxOnce(options);
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, Number(options.pollMs) || DEFAULT_POLL_MS));
  }
  return { status: 'stopped' };
}

function parseCli(argv) {
  const [command = 'once', ...rest] = argv;
  const values = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    if (rest[i + 1] && !rest[i + 1].startsWith('--')) { values[key] = rest[i + 1]; i += 1; }
    else values[key] = true;
  }
  return { command, values };
}

async function main() {
  const { command, values } = parseCli(process.argv.slice(2));
  const options = { ...values, language: values.lang || values.language || 'fr-CA', leaseMs: values['lease-ms'], retryLimit: values['retry-limit'], pollMs: values['poll-ms'], forceRender: Boolean(values['force-render']) };
  const result = command === 'status' ? await inboxStatus(options) : command === 'watch' ? await runInboxWatch(options) : await runInboxOnce(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed-terminal') process.exitCode = 2;
}

if (pathToFileURL(path.resolve(process.argv[1] || '')).href === import.meta.url) {
  main().catch((error) => { console.error(`rulebook-inbox: ${error.message}`); process.exitCode = 1; });
}
