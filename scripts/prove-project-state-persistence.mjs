#!/usr/bin/env node
// Offline proof against an isolated copy and the real production persistence
// route/storage adapter. No production worker or generation endpoint is used.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildProductionStateBody } from './run-rulebook-production.mjs';
import { registerProjectPersistenceRoutes, buildRenderProjectState } from '../src/api/projectPersistenceRoutes.js';
import { createProjectSourceService } from '../src/services/projectSourceService.js';
import { loadSourceVisualCatalog } from '../src/services/sourceVisualSelection.js';
import transport from '../src/services/projectStateTransport.cjs';
import { buildWorkerRuntimeRequirements, buildApiRuntimeCapabilities, preflightRuntimeCompatibility } from '../src/services/runtimeCompatibility.js';
const require = createRequire(import.meta.url);
const { compileCanonicalProductionState } = require('../src/services/canonicalProductionCompiler.cjs');
const canonicalStateStorage = require('../src/services/canonicalProductionStateStorage.cjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
if (!args.evidence || !args.pdf || !args.output) throw new Error('Required: --evidence <archived attempt> --pdf <existing PDF> --output <new proof directory>');
const output = path.resolve(args.output);
if (fs.existsSync(output)) throw new Error('Proof output already exists; choose a new directory.');
fs.mkdirSync(output, { recursive: true });
const copy = path.join(output, 'input');
fs.cpSync(path.resolve(args.evidence), copy, { recursive: true });
const b = path.join(copy, 'production');
const read = f => JSON.parse(fs.readFileSync(path.join(b, f), 'utf8'));
const hash = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const dataRoot = path.join(output, 'isolated-data');
process.env.DB_DATA_DIR = dataRoot;
process.env.DB_DATA_FILE = path.join(dataRoot, 'projects.json');
process.env.DB_IN_MEMORY = 'false';
process.env.NODE_ENV = 'proof';
process.env.API_KEY = 'isolated-proof-only';
const dbModule = pathToFileURL(path.resolve('src/api/db.js')).href;
let db = (await import(`${dbModule}?proof=first`)).default;
const source = createProjectSourceService({ dataRoot });
const prior = read('canonical-production-state.json');
const projectId = prior.projectId; // Same ID, physically isolated data root.
const { descriptor } = await source.persistUpload(projectId, path.resolve(args.pdf), { filename: 'proof-rulebook.pdf' });
const compactedPrior = canonicalStateStorage.createCompactCanonicalProductionState(prior, {
  projectId,
  sourceSha256: descriptor.sha256,
  relativePath: 'production/visual-evidence-artifact.json',
});
const artifactPath = path.join(dataRoot, projectId, compactedPrior.artifactDescriptor.relativePath);
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, JSON.stringify(compactedPrior.artifact));
const extraction = read('zero-state-extraction.json');
const evidencePath=[path.join(copy,'hephaestus-component-evidence.json'),path.join(b,'hephaestus-component-evidence.json'),path.join(copy,'hephaestus/component-evidence.json')].find(fs.existsSync);
const evidence = JSON.parse(fs.readFileSync(evidencePath));
const catalog = loadSourceVisualCatalog(path.join(b, 'source-visual-review/source-visual-manifest.json'), {
  qualityReportPath: path.join(b, 'source-visual-review/source-visual-quality.json'),
  semanticReportPath: path.join(b, 'source-visual-review/source-visual-semantic-matches.json'),
  hephaestusEvidencePath: evidencePath,
});
const compiled = compileCanonicalProductionState({ projectId, knowledgeModel: prior.knowledgeModel, coverageMatrix: prior.coverageMatrix, componentEvidence: evidence, sourceAssets: catalog.assets });
assert.equal(compiled.reviewItems.length, prior.reviewItems.length);
assert.deepEqual(compiled.selectedAssets.map(x => x.id), prior.selectedAssets.map(x => x.id));
const baseOptions = {
  projectId, descriptor, gameName: extraction.gameName, language: 'fr-CA',
  manifest: { text: { full: extraction.rulebookText }, ingestion: extraction.ingestion, diagnostics: extraction.diagnostics },
  components: extraction.components.components || extraction.components,
  scriptPackage: read('zero-state-script-package.json'), storyboardManifest: read('zero-state-storyboard.json'),
  scenes: prior.scenes, images: [], gameMetadata: read('zero-state-script-package.json').metadata,
  gameplayModel: read('gameplay-actions.json'), endgameModel: read('scoring-endgame.json'),
  rulebookKnowledgeModel: prior.knowledgeModel, tutorialCoverage: read('tutorial-coverage-matrix.json'),
  canonicalProductionState: compactedPrior.compact,
};
const originalBody = buildProductionStateBody({ ...baseOptions, canonicalProductionState: prior, scenes: prior.scenes,
  storyboardManifest: { ...baseOptions.storyboardManifest, scenes: prior.scenes } });
const body = transport.compactVisualEvidence(buildProductionStateBody(baseOptions));
const packet = transport.packProjectState(body);
assert.equal(hash(transport.unpackProjectState(packet)), hash(body));
const report = { status: 'RUNNING', measurementScope: 'Real HTTP body reconstructed with canonical body builder and archived inputs; historical images response unavailable, images=[]; no claim of exact historical wire bytes.',
  originalLogicalBytes:transport.bytes(originalBody), beforeBytes: transport.bytes(body), afterBytes: transport.bytes(packet), apiLimitBytes: transport.API_LIMIT_BYTES,
  budgetBytes: transport.TRANSPORT_BUDGET_BYTES, marginBytes: transport.API_LIMIT_BYTES - transport.bytes(packet),
  fieldBytes: Object.fromEntries(Object.entries(body).map(([k,v]) => [k,transport.bytes(v)])),
  contextFieldBytes: Object.fromEntries(Object.entries(body.projectContext).map(([k,v])=>[k,transport.bytes(v)])),
  canonicalDuplicationBytes: { sourceSelections: transport.bytes(prior.sourceSelections), richRanked: prior.sourceSelections.reduce((sum, selection) => sum + transport.bytes(selection.ranked || []), 0), assets: transport.bytes(prior.assets) },
  compactCanonicalStateBytes: compactedPrior.compactBytes,
  visualEvidenceArtifactBytes: compactedPrior.artifactBytes,
  providers: { llm: 0, hephaestus: 0, tts: 0, render: 0 }, reviews: prior.reviewItems.length,
  compilation: { reviews: compiled.reviewItems.length, accepted: compiled.selectedAssets.length }, checks: {} };
const save = () => fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify(report, null, 2));
save();
let server;
async function start() {
  const app = express();
  app.use(express.json({ limit: transport.API_LIMIT_BYTES }));
  app.use(transport.bodyErrorHandler);
  registerProjectPersistenceRoutes(app, { db, projectSource: source });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return `http://127.0.0.1:${server.address().port}`;
}
let baseUrl = await start();
const post = (payload, id = projectId) => fetch(`${baseUrl}/api/projects/${id}/production-state`, { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify(payload) });
const load = () => fetch(`${baseUrl}/load-project/${projectId}`, { headers: { 'x-api-key': 'isolated-proof-only', connection: 'close' } }).then(r => r.json());
try {
  assert.ok(report.originalLogicalBytes > transport.API_LIMIT_BYTES);
  const rawResponse = await post(originalBody);
  assert.equal(rawResponse.status, 413); assert.equal((await rawResponse.json()).code, 'PROJECT_STATE_TOO_LARGE');
  assert.equal(db.all('SELECT * FROM projects').length, 0);
  report.checks.reproduced413WithoutWrite = true;
  assert.equal((await post(packet)).status, 200);
  const first = await load();
  assert.equal(hash(first.projectContext), hash(body.projectContext));
  assert.equal(hash(first.scenes), hash(body.scenes));
  report.checks.cockpitEveryFieldPreserved = true;
  const file = process.env.DB_DATA_FILE;
  const firstDiskHash = hash(fs.readFileSync(file).toString());
  assert.equal((await post(packet)).status, 200);
  assert.equal(db.all('SELECT * FROM projects').length, 1);
  assert.equal(hash(fs.readFileSync(file).toString()), firstDiskHash);
  report.checks.idempotentDisk = true;
  await new Promise(resolve => server.close(resolve));
  db = (await import(`${dbModule}?proof=restart`)).default;
  baseUrl = await start();
  const resumed = await load();
  assert.equal(hash(resumed), hash(first));
  const renderState = buildRenderProjectState(db.get('SELECT * FROM projects WHERE id = ?', [first.id]));
  assert.deepEqual(renderState.projectContext.visualReviewItems.map(item=>canonicalStateStorage.hydrateVisualReviewItem(item, compactedPrior.artifact)), prior.reviewItems);
  const cockpit=await fetch(`${baseUrl}/api/projects/${projectId}/visual-reviews`).then(r=>r.json());
  assert.equal(cockpit.items.length,prior.reviewItems.length);
  for(const item of cockpit.items){const original=prior.reviewItems.find(r=>r.id===item.id);assert.deepEqual(item.candidates.map(c=>c.objectAnalysisAttempts),original.candidates.map(c=>c.objectAnalysisAttempts));}
  report.checks.cockpitEvidenceReferencesLoad=true;
  report.checks.restartCockpitAndRenderer = true;
  for (const invalid of [
    { ...body, projectContext: { ...body.projectContext, projectId: 'wrong-project' } },
    { ...body, projectContext: { ...body.projectContext, sourceSha256: '0'.repeat(64) } },
    { ...body, projectContext: { ...body.projectContext, sourcePdf: { ...descriptor, sha256: '0'.repeat(64) } } },
    { ...body, projectContext: { ...body.projectContext, sourcePdf: { ...descriptor, path: 'C:\\other-project\\source.pdf' } } },
  ]) assert.ok([400,409].includes((await post(transport.packProjectState(invalid))).status));
  assert.equal((await post(originalBody)).status, 413);
  assert.equal(hash(fs.readFileSync(file).toString()), firstDiskHash);
  report.checks.invalidIdentityAndOversizeAreAtomic = true;
  const requirements = buildWorkerRuntimeRequirements({ cwd: process.cwd() });
  const capabilities = buildApiRuntimeCapabilities({ cwd: process.cwd() });
  const legacy = { ...capabilities, contracts: { ...capabilities.contracts, projectContextPersistence: 'mobius-project-context-persistence-v2' } };
  await assert.rejects(preflightRuntimeCompatibility({ baseUrl: 'http://fixture.invalid', requirements, fetchImpl: async () => new Response(JSON.stringify(legacy), { status: 200 }) }), /contract/i);
  report.checks.runtimeRejectsLegacyPersistence = true;
  // Persist a fresh canonical compilation through the identical body/route.
  const compactedFresh = canonicalStateStorage.createCompactCanonicalProductionState(compiled, { projectId, sourceSha256: descriptor.sha256, relativePath: 'production/visual-evidence-artifact.json' });
  fs.writeFileSync(artifactPath, JSON.stringify(compactedFresh.artifact));
  const fresh = transport.compactVisualEvidence(buildProductionStateBody({ ...baseOptions, canonicalProductionState: compactedFresh.compact, scenes: compactedFresh.compact.scenes, storyboardManifest: { ...baseOptions.storyboardManifest, scenes: compactedFresh.compact.scenes } }));
  assert.equal((await post(transport.packProjectState(fresh))).status, 200);
  const loaded=await load();
  assert.deepEqual(loaded.projectContext.visualReviewItems.map(item=>canonicalStateStorage.hydrateVisualReviewItem(item,compactedFresh.artifact)), compiled.reviewItems);
  report.checks.compilationToRouteToCockpit = true;
  report.storageBytes = fs.statSync(file).size;
  report.unchangedEvidence = ['zero-state-extraction.json','rulebook-knowledge-model.json'].every(f => hash(fs.readFileSync(path.join(b,f)).toString()) === hash(fs.readFileSync(path.join(path.resolve(args.evidence),'production',f)).toString()));
  assert.ok(report.unchangedEvidence);
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = error.message; report.errorCause = error.cause?.message; report.errorStack = error.stack; process.exitCode = 1; }
finally { await new Promise(resolve => server.close(resolve)); save(); }
console.log(JSON.stringify({ status: report.status, beforeBytes: report.beforeBytes, afterBytes: report.afterBytes, report: path.join(output, 'proof.json'), error: report.error }));
