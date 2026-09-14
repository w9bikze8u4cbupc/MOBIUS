#!/usr/bin/env node
// Existing knowledge and all existing source pixels; no authored rules or selected assets.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import express from 'express';
import { loadSourceVisualCatalog } from '../src/services/sourceVisualSelection.js';
import { hydrateSourcePageVisuals } from '../src/services/sourcePageVisuals.js';
import { canonicalRuntimeConfigurationEnvironment } from '../src/services/canonicalRuntimeAlignment.js';
import { createProjectSourceService } from '../src/services/projectSourceService.js';
import { registerProjectPersistenceRoutes } from '../src/api/projectPersistenceRoutes.js';
import transport from '../src/services/projectStateTransport.cjs';
const require = createRequire(import.meta.url);
const { compileCanonicalProductionState } = require('../src/services/canonicalProductionCompiler.cjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => value.startsWith('--') ? [...rows, [value.slice(2), all[index + 1]]] : rows, []));
for (const name of ['knowledge', 'manifest', 'pdf', 'output', 'max-visual-calls']) if (!args[name]) throw new Error(`Missing --${name}`);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (value) => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const output = path.resolve(args.output);
if (fs.existsSync(output) && !args.resume) throw new Error('Use a fresh isolated proof directory or explicitly resume this isolated proof.');
const knowledge = read(args.knowledge);
const manifest = read(args.manifest);
const projectId = 'isolated-visual-binding-proof';
const dataRoot = path.join(output, 'data');
const projectRoot = path.join(dataRoot, projectId);
const pixelsRoot = path.join(projectRoot, 'pixels');
fs.mkdirSync(pixelsRoot, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
let proofScene = null;
if (args['pedagogical-scene'] === 'true') {
  const eligible = knowledge.ruleAtoms.filter((r) => r.reviewState === 'accepted' && r.domain === 'reference_aid'
    && r.visualRequirement?.requiredObjects?.length === 1);
  eligible.sort((a, b) => Math.min(...a.sourceRefs.map((r) => r.page)) - Math.min(...b.sourceRefs.map((r) => r.page)));
  if (!eligible.length) throw new Error('No eligible existing single-object reference scene. Do not substitute a prepared rule.');
  proofScene = eligible[0];
  const selection = { criterion: 'accepted reference_aid with one required object; earliest cited PDF page then existing model order',
    sourceSha256: knowledge.sourcePdfSha256, ruleId: proofScene.id, requirement: proofScene.visualRequirement };
  const previous = path.join(output, 'scene-selection.json');
  if (fs.existsSync(previous)) assert.deepEqual(read(previous), selection);
  else write('scene-selection.json', selection);
  if (!args['budget-ledger'] || !args['budget-group']) throw new Error('Bounded pedagogical proof requires a shared budget ledger and group');
  const ledger = path.resolve(args['budget-ledger']);
  if (!fs.existsSync(ledger)) fs.writeFileSync(ledger, JSON.stringify({ maxTotal: 16, maxPerGroup: 8, calls: [] }, null, 2), { flag: 'wx' });
}
const images = [];
const unavailable = [];
const priorEvidence = args.evidence ? read(args.evidence) : {};
const evidencePaths = new Map((priorEvidence.assets || []).map((asset) => [asset.id, asset.sourceImage || asset.renderPath]));
for (const raw of manifest.images || manifest.assets || []) {
  const source = [evidencePaths.get(raw.id), raw.file_path, raw.filePath, raw.sourceImage, raw.renderPath,
    raw.file_name && path.join(path.dirname(args.manifest), 'images', 'all', raw.file_name)]
    .filter(Boolean).find((file) => fs.existsSync(file));
  if (!source) { unavailable.push(raw.id); continue; }
  const copy = path.join(pixelsRoot, `${hash(raw.id).slice(0, 16)}${path.extname(source)}`);
  if (fs.existsSync(copy)) assert.equal(hash(fs.readFileSync(copy)), hash(fs.readFileSync(source)));
  else fs.copyFileSync(source, copy);
  const { semanticObjects, componentRefs, referentAliases, component_bindings, objectVisualEvidence, visualQuality,
    cropCompleteness, cropPurity, ...candidate } = raw;
  images.push({ ...candidate, file_path: copy, renderPath: copy, filePath: copy,
    cropCompleteness: 'unknown', cropPurity: 'unknown', sourcePdfSha256: knowledge.sourcePdfSha256,
    source_page: raw.source_page || (Number.isInteger(raw.page_index) ? raw.page_index + 1 : null) });
}
if (!images.length) throw new Error('No source pixels recovered; proof cannot proceed. Supply canonical evidence paths.');
const components = knowledge.components || [];
const evidence = { projectId, sourcePdfSha256: knowledge.sourcePdfSha256, assets: [],
  componentBindings: components.map((c) => ({ componentId: c.id, componentName: c.name, category: c.category,
    sourcePage: c.sourcePage, assetId: null, confidence: 0, reviewState: 'needs_review', reviewRequired: true })) };
write('input-knowledge.json', knowledge);
write('input-manifest.json', { ...manifest, images });
write('input-component-evidence.json', evidence);
write('input-script.json', { scenes: (proofScene ? [proofScene] : knowledge.ruleAtoms).map((atom) => ({ id: `knowledge-${atom.id}`,
  visualRequirement: atom.visualRequirement, sourceRefs: atom.sourceRefs,
  source_pages: (atom.sourceRefs || []).map((ref) => ref.page), narration: atom.teaching?.narration })) });
const reviewDir = path.join(projectRoot, 'source-visual-review');
if (args['reuse-analysis'] && !fs.existsSync(path.join(reviewDir, 'object-evidence-cache'))) fs.cpSync(path.resolve(args['reuse-analysis']), path.join(reviewDir, 'object-evidence-cache'), { recursive: true, errorOnExist: true });
const prepareArgs = ['scripts/prepare-source-visuals.mjs', '--script', path.join(output, 'input-script.json'),
  '--asset-manifest', path.join(output, 'input-manifest.json'), '--hephaestus-evidence', path.join(output, 'input-component-evidence.json'), '--output-dir', reviewDir];
if (args['api-base-url'] && args['source-project-id'] && args.extraction) {
  const extraction = read(args.extraction);
  const pageDir = path.join(projectRoot, 'pages');
  const hydration = await hydrateSourcePageVisuals({ baseUrl: args['api-base-url'], projectId: args['source-project-id'], sourceSha256: knowledge.sourcePdfSha256,
    pageCount: extraction.pages.length, pageDir, apiKey: process.env.API_KEY });
  write('page-hydration.json', hydration);
  prepareArgs.push('--page-dir', pageDir, '--extraction', path.resolve(args.extraction), '--source-sha256', knowledge.sourcePdfSha256);
}
if (args['reuse-pages'] && args.extraction) {
  const pageDir = path.join(projectRoot, 'pages');
  if (!fs.existsSync(pageDir)) fs.cpSync(path.resolve(args['reuse-pages']), pageDir, { recursive: true, errorOnExist: true });
  prepareArgs.push('--page-dir', pageDir, '--extraction', path.resolve(args.extraction), '--source-sha256', knowledge.sourcePdfSha256);
}
const canonicalEnv = canonicalRuntimeConfigurationEnvironment({ root: process.cwd(), env: process.env });
const run = () => {
  const result = spawnSync(process.execPath, prepareArgs, { windowsHide: true, encoding: 'utf8',
    env: { ...canonicalEnv, MOBIUS_VISUAL_MATCH_MAX_CALLS: args['max-visual-calls'],
      ...(proofScene ? { MOBIUS_VISUAL_SCENE_ID: `knowledge-${proofScene.id}`, MOBIUS_VISUAL_BUDGET_LEDGER: path.resolve(args['budget-ledger']), MOBIUS_VISUAL_BUDGET_GROUP: args['budget-group'] } : {}),
      ...(args['reuse-analysis'] && !args['allow-analysis'] ? { MOBIUS_VISUAL_CACHE_ONLY: 'true' } : {}) }, timeout: 12 * 60 * 1000 });
  if (result.status !== 0) throw new Error(`Visual preparation failed (${result.status}): ${result.stderr}`);
  return result.stdout;
};
fs.writeFileSync(path.join(output, 'preparation.log'), run());
const semanticPath = path.join(reviewDir, 'source-visual-semantic-matches.json');
const first = read(semanticPath);
write('first-analysis.json', first);
const compile = () => compileCanonicalProductionState({ projectId, knowledgeModel: knowledge, componentEvidence: evidence,
  sourceAssets: loadSourceVisualCatalog(fs.existsSync(path.join(reviewDir, 'source-visual-manifest.json')) ? path.join(reviewDir, 'source-visual-manifest.json') : path.join(output, 'input-manifest.json'), {
    qualityReportPath: path.join(reviewDir, 'source-visual-quality.json'), semanticReportPath: semanticPath }).assets });
const compiled = compile();
fs.writeFileSync(path.join(output, 'replay.log'), run());
const replay = read(semanticPath);
assert.equal(replay.summary.providerCalls, 0);
assert.equal(hash(compile()), hash(compiled));
write('canonical-state.json', transport.packProjectState(compiled));
process.env.DB_DATA_DIR = dataRoot;
process.env.DB_DATA_FILE = path.join(dataRoot, 'projects.json');
process.env.DB_IN_MEMORY = 'false';
const db = (await import(pathToFileURL(path.resolve('src/api/db.js')).href)).default;
const projectSource = createProjectSourceService({ dataRoot });
const { descriptor } = await projectSource.persistUpload(projectId, path.resolve(args.pdf), { filename: 'proof-rulebook.pdf' });
assert.equal(descriptor.sha256, knowledge.sourcePdfSha256);
const body = { name: knowledge.gameIdentity?.displayName, components, images: [], script: '', scenes: compiled.scenes,
  projectContext: { projectId, sourcePdf: descriptor, sourceSha256: descriptor.sha256, visualReviewItems: compiled.reviewItems,
    canonicalProductionState: compiled } };
const app = express();
app.use(express.json({ limit: transport.API_LIMIT_BYTES }));
app.use(transport.bodyErrorHandler);
registerProjectPersistenceRoutes(app, { db, projectSource });
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const url = `http://127.0.0.1:${server.address().port}`;
const measured = first.scenes.flatMap((s) => s.candidates).filter((c) => c.status === 'MEASURED');
const report = { project: knowledge.gameIdentity, sourceSha: descriptor.sha256, sourceImagesCopied: images.length, unavailable,
  provider: first.summary, replay: replay.summary, imagesExamined: new Set(measured.map((c) => c.asset_id)).size,
  objectsMatched: compiled.sourceSelections.flatMap((s) => s.referentSelections || []).filter((s) => s.status === 'AUTO_ACCEPTED').length,
  fullyIllustratedScenes: compiled.sourceSelections.filter((s) => s.status === 'AUTO_ACCEPTED').length,
  scenes: compiled.scenes.length, reviews: compiled.reviewItems.length, hephaestusProviderCalls: 0, ruleGenerationCalls: 0,
  status: first.summary.providerBlocker ? 'BLOCKED' : 'PARTIEL', inputsHash: hash(knowledge), replayIdentical: true };
try {
  const packet = transport.packProjectState(body);
  assert.ok(transport.bytes(packet) < transport.TRANSPORT_BUDGET_BYTES);
  assert.equal((await fetch(`${url}/api/projects/${projectId}/production-state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet) })).status, 200);
  const review = await fetch(`${url}/api/projects/${projectId}/visual-reviews`).then((r) => r.json());
  assert.equal(review.items.length, compiled.reviewItems.length);
  const candidateUrls = [...new Set(review.items.flatMap((r) => r.candidates.map((c) => c.thumbnailUrl)))];
  const imageChecks = [];
  // Bound IO as well as provider spend: source ownership checks read the PDF.
  const pendingUrls = [...candidateUrls];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pendingUrls.length) {
      const route = pendingUrls.shift();
      try { const response = await fetch(url + route); const bytes = Buffer.from(await response.arrayBuffer()); imageChecks.push({ route, status: response.status, sha: hash(bytes) }); }
      catch { imageChecks.push({ route, status: 0, error: 'REVIEW_IMAGE_FETCH_FAILED' }); }
    }
  }));
  report.cockpitImageReferences = imageChecks;
  report.reviewsWithLoadableCandidates = review.items.filter((r) => r.candidates.length && r.candidates.every((c) => imageChecks.find((i) => i.route === c.thumbnailUrl)?.status === 200)).length;
  report.transportBytes = transport.bytes(packet);
  const thumbnails = [...new Map(first.scenes.flatMap((s) => s.candidates).map((c) => [c.asset_id, c])).values()];
  const tiles = [];
  report.thumbnailFailures = [];
  for (const candidate of thumbnails) {
    let tile;
    try { tile = await sharp(candidate.path).resize(320, 240, { fit: 'contain', background: '#202020' }).png().toBuffer(); }
    catch {
      report.thumbnailFailures.push({ assetId: candidate.asset_id, reason: 'IMAGE_DECODE_OR_PIXEL_BUDGET_FAILURE' });
      tile = await sharp(Buffer.from('<svg width="320" height="240"><rect width="320" height="240" fill="#333"/><text x="20" y="120" fill="white" font-size="18">IMAGE NON DECODEE</text></svg>')).png().toBuffer();
    }
    tiles.push({ input: tile, left: (tiles.length % 4) * 320, top: Math.floor(tiles.length / 4) * 240 });
  }
  if (tiles.length) await sharp({ create: { width: 1280, height: Math.ceil(tiles.length / 4) * 240, channels: 3, background: '#202020' } }).composite(tiles).png().toFile(path.join(output, 'candidate-contact-sheet.png'));
  write('contact-sheet-index.json', thumbnails.map((c, index) => ({ index, assetId: c.asset_id, path: c.path, status: c.status, objects: c.objects })));
  write('cockpit-review-response.json', review);
  if (args.browser) {
    const bundle = path.join(output, 'cockpit-ui.js');
    await require('esbuild').build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CanonicalVisualReviews} from './src/components/CanonicalVisualReviews'; createRoot(document.getElementById('root')).render(<CanonicalVisualReviews projectId="${projectId}"/>); setInterval(()=>{const d=document.querySelector('details');if(d)d.open=true},100);`, resolveDir: path.resolve('client'), loader: 'jsx' },
      bundle: true, outfile: bundle, loader: { '.js': 'jsx' }, define: { 'process.env.REACT_APP_BACKEND_URL': '""', 'process.env.NODE_ENV': '"production"' } });
    app.get('/proof-ui.js', (_req, res) => res.sendFile(bundle));
    app.get('/proof-ui', (_req, res) => res.send('<html lang="fr"><meta charset="UTF-8"><div id="root"></div><script src="/proof-ui.js"></script></html>'));
    // Async child: the real API event loop must remain available to the browser.
    const { spawn } = await import('node:child_process');
    const screenshot = path.join(output, 'cockpit-browser.png');
    const browserExit = await new Promise((resolve) => {
      const child = spawn(path.resolve(args.browser), ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(output, 'browser-profile')}`, '--window-size=1280,1000', '--virtual-time-budget=12000', `--screenshot=${screenshot}`, `${url}/proof-ui`], { windowsHide: true, stdio: 'ignore' });
      const deadline = setTimeout(() => {
        // Only this spawned proof browser and its descendants, never a user browser/API.
        if (child.pid && process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else child.kill();
        resolve('CAPTURE_TIMED_OUT');
      }, 120000);
      child.once('error', () => { clearTimeout(deadline); resolve('LAUNCH_FAILED'); });
      child.once('exit', (code) => { clearTimeout(deadline); resolve(code); });
    });
    report.browser = { exitCode: browserExit, screenshot, exists: fs.existsSync(screenshot) };
  }
  write('proof.json', report);
  console.log(JSON.stringify({ output, ...report, unavailable: unavailable.length, cockpitImageReferences: imageChecks.length }));
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
