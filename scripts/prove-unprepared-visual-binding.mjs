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
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (value) => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
if(args['render-existing-state']){
  // Zero-provider replay proof: consume a canonical state produced by the
  // normal compiler and re-materialize only its already-selected generic
  // scene. The persisted selection criterion is authoritative; this mode
  // cannot inject a scene, asset, crop or visual verdict.
  if(!args.output || !args.selection)throw new Error('Existing-state replay requires --output and --selection');
  const packet=read(path.resolve(args['render-existing-state']));
  const unpacked=packet.contract===transport.CONTRACT?transport.unpackProjectState(packet):packet;
  const state=unpacked.projectContext?.canonicalProductionState||unpacked.canonicalProductionState||unpacked;
  const selection=read(path.resolve(args.selection));
  const scene=state.scenes?.find(row=>row.atomId===selection.ruleId);
  if(!scene)throw new Error('Persisted generic scene selection is absent from canonical state');
  assert.equal(state.knowledgeModel?.sourcePdfSha256,selection.sourceSha256,'Selected source SHA must match canonical knowledge');
  assert.deepEqual(scene.visualRequirement,selection.requirement,'Canonical scene requirements must remain unchanged');
  const folder=path.resolve(args.output);
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'scene-selection.json'),JSON.stringify(selection,null,2));
  fs.writeFileSync(path.join(folder,'input-canonical-state.json'),JSON.stringify(transport.packProjectState(state)));
  const selected=state.sourceSelections.find(row=>row.ruleAtomId===scene.atomId);
  const result={contract:'mobius-unprepared-visual-binding-replay-proof-v1',generatedAt:new Date().toISOString(),
    sourceState:path.resolve(args['render-existing-state']),sourceStateSha256:hash(fs.readFileSync(path.resolve(args['render-existing-state']))),
    sceneId:scene.id,ruleAtomId:scene.atomId,requiredObjects:scene.visualRequirement.requiredObjects,
    bindingStatus:selected?.status||null,providerCalls:0,replayProviderCalls:0,hephaestusProviderCalls:0,
    productionRestarted:false,fullyIllustratedScenes:0,objectAssociationsValidated:0};
  if(scene.instructionalSequence?.validated===true){
    const { verifiedInstructionalSequence }=require('../src/services/physicalGameState.cjs');
    let asset=(selected?.selectedAssets||[])[0]||state.assets.find(row=>row.id===scene.renderVisual?.assetId);
    if(args['visual-manifest']&&args['semantic-report']){
      const catalog=loadSourceVisualCatalog(path.resolve(args['visual-manifest']),{
        qualityReportPath:args['quality-report']?path.resolve(args['quality-report']):undefined,
        semanticReportPath:path.resolve(args['semantic-report'])});
      const hydrated=catalog.assets.find(row=>row.id===scene.instructionalSequence.assetId);
      if(hydrated){
        const { normalizeCandidate }=require('../src/services/sourceAssetResolver.cjs');
        asset=normalizeCandidate({...hydrated,filePath:hydrated.filePath||hydrated.file_path||hydrated.renderPath,
          instructionalSequences:[scene.instructionalSequence]});
      }
    }
    assert.ok((selected?.selectedAssetIds||selected?.selectedAssets?.map(row=>row.id)||[]).includes(scene.instructionalSequence.assetId),
      'Persisted accepted binding must own the sequence source asset');
    const verified=asset&&verifiedInstructionalSequence(asset,scene.visualRequirement,scene.id);
    assert.ok(verified,'Canonical state sequence must remain verifiable from exact source evidence');
    const sequenceFolder=path.join(folder,'instructional-sequence');
    fs.mkdirSync(sequenceFolder,{recursive:true});
    const frames=[];
    for(const [index,frame] of scene.instructionalSequence.frames.entries()){
      const frameEvidence={id:frame.id,stage:frame.stage};
      for(const [kind,input] of [['desktop',frame.outputPath],['phone',frame.phonePath]]){
        assert.ok(input&&fs.existsSync(input),`Canonical ${kind} frame must exist`);
        const output=path.join(sequenceFolder,`${String(index+1).padStart(2,'0')}-${kind}.png`);
        fs.copyFileSync(input,output);
        assert.equal(hash(fs.readFileSync(output)),hash(fs.readFileSync(input)),'Replay frame copy must be pixel-identical');
        frameEvidence[`${kind}InputPath`]=path.resolve(input);
        frameEvidence[`${kind}OutputPath`]=output;
        frameEvidence[`${kind}Sha256`]=hash(fs.readFileSync(output));
      }
      frames.push(frameEvidence);
    }
    const tileWidth=480,tileHeight=270,columns=2,rows=Math.ceil(frames.length/columns);
    const layers=[];
    for(const [index,frame] of frames.entries())layers.push({input:await sharp(frame.desktopOutputPath).resize(tileWidth,tileHeight,{fit:'contain'}).png().toBuffer(),left:(index%columns)*tileWidth,top:Math.floor(index/columns)*tileHeight});
    result.contactSheet=path.join(folder,'instructional-sequence-contact-sheet.png');
    await sharp({create:{width:columns*tileWidth,height:rows*tileHeight,channels:4,background:'#17110d'}}).composite(layers).png().toFile(result.contactSheet);
    const phoneLayers=[];
    for(const [index,frame] of frames.entries())phoneLayers.push({input:frame.phoneOutputPath,left:(index%columns)*390,top:Math.floor(index/columns)*219});
    result.phoneContactSheet=path.join(folder,'instructional-sequence-phone-contact-sheet.png');
    await sharp({create:{width:columns*390,height:rows*219,channels:4,background:'#17110d'}}).composite(phoneLayers).png().toFile(result.phoneContactSheet);
    result.sequence={contract:scene.instructionalSequence.contract,frames,validated:true,validationBasis:'canonical-provider-measured-composition-sequence'};
    result.objectAssociationsValidated=scene.visualRequirement.requiredObjects.length;
    result.fullyIllustratedScenes=1;
  }else{
    // Exercise the same collection-level materializer called by normal PDF
    // production. The proof cannot certify a direct helper path that the
    // production orchestrator itself does not consume.
    const { materializeVisualPlanFrames }=require('../src/services/visualPlanMaterializer.cjs');
    const materialized=await materializeVisualPlanFrames({
      state:{...state,scenes:[scene]},
      outputDir:path.join(folder,'normal-visual-plan-materialization'),
    });
    const materializedScene=materialized.scenes.find(row=>row.id===scene.id);
    result.materializationContract=materialized.contract;
    result.instructionalStill=materializedScene?.instructionalStill||materializedScene?.preparedInstructionalStill||null;
    assert.ok(result.instructionalStill,'Normal production materializer did not produce the selected scene');
    result.objectAssociationsValidated=result.instructionalStill.validated?scene.visualRequirement.requiredObjects.length:0;
    result.fullyIllustratedScenes=Number(result.instructionalStill.validated===true);
    result.contactSheet=result.instructionalStill.outputPath||null;
  }
  result.status=result.fullyIllustratedScenes===1?'PASS':'PARTIEL';
  fs.writeFileSync(path.join(folder,'proof.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({output:folder,status:result.status,sceneId:scene.id,fullyIllustratedScenes:result.fullyIllustratedScenes,providerCalls:0}));
  process.exit(result.status==='PASS'?0:2);
}
if(args['materialize-only']==='true'){
  // Resume existing provider measurements through the normal compiler and
  // materializer, without repeating providers, extraction or the HTTP proof.
  const folder=path.resolve(args.output);
  const review=path.join(folder,'data/isolated-visual-binding-proof/source-visual-review');
  const model=JSON.parse(fs.readFileSync(path.join(folder,'input-knowledge.json')));
  const componentEvidence=JSON.parse(fs.readFileSync(path.join(folder,'input-component-evidence.json')));
  const catalog=loadSourceVisualCatalog(path.join(review,'source-visual-manifest.json'),{
    qualityReportPath:path.join(review,'source-visual-quality.json'),semanticReportPath:path.join(review,'source-visual-semantic-matches.json')});
  let state=compileCanonicalProductionState({projectId:'isolated-visual-binding-proof',knowledgeModel:model,componentEvidence,sourceAssets:catalog.assets});
  const materialized=await require('../src/services/visualPlanMaterializer.cjs').materializeVisualPlanFrames({state,outputDir:path.join(folder,'instructional-materialization')});
  if(args['composition-review']){
    const sourceAssets=require('../src/services/visualPlanMaterializer.cjs').attachSequenceReviewEvidence({assets:catalog.assets,
      records:materialized.records,reviewPaths:[path.resolve(args['composition-review'])]});
    state=compileCanonicalProductionState({projectId:'isolated-visual-binding-proof',knowledgeModel:model,componentEvidence,sourceAssets});
    const resultPath=path.join(folder,`sequence-binding-${Date.now()}.json`);
    fs.writeFileSync(resultPath,JSON.stringify({sourceSelections:state.sourceSelections.map(s=>({ruleAtomId:s.ruleAtomId,status:s.status,confidence:s.confidence,
      candidates:s.ranked.map(r=>({id:r.candidate?.id||r.assetId,valid:r.valid,confidence:r.confidence,violations:r.hardViolations||r.violations}))})),
      scenes:state.scenes.filter(s=>s.instructionalSequence).map(s=>({id:s.id,visualReviewState:s.visualReviewState,planValidation:s.canonicalVisualPlan.validation,renderVisual:s.renderVisual,
        frames:s.instructionalSequence.frames.map(f=>({id:f.id,outputPath:f.outputPath,phonePath:f.phonePath}))}))},null,2));
    console.log(JSON.stringify({bindings:resultPath,accepted:state.sourceSelections.filter(s=>s.status==='AUTO_ACCEPTED').length}));
  }
  const target=path.join(folder,`materialization-${Date.now()}.json`);
  fs.writeFileSync(target,JSON.stringify({providerCalls:0,records:materialized.records},null,2));
  console.log(JSON.stringify({report:target,preparedSequences:materialized.records.length,providerCalls:0}));
  process.exit(0);
}
for (const name of ['knowledge', 'manifest', 'pdf', 'output', 'max-visual-calls']) if (!args[name]) throw new Error(`Missing --${name}`);
const output = path.resolve(args.output);
if (fs.existsSync(output) && !args.resume) throw new Error('Use a fresh isolated proof directory or explicitly resume this isolated proof.');
// Preserve failed execution reports; valid measurement caches stay in place.
if (args.resume && fs.existsSync(path.join(output, 'proof.json'))) {
  const history = path.join(output, 'history', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(history, { recursive: true });
  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    if (entry.isFile()) fs.copyFileSync(path.join(output, entry.name), path.join(history, entry.name), fs.constants.COPYFILE_EXCL);
  }
  const review = path.join(output, 'data/isolated-visual-binding-proof/source-visual-review');
  if (fs.existsSync(review)) for (const entry of fs.readdirSync(review, { withFileTypes: true })) {
    if (entry.isFile()) fs.copyFileSync(path.join(review, entry.name), path.join(history, `review-${entry.name}`), fs.constants.COPYFILE_EXCL);
  }
}
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
  '--asset-manifest', path.join(output, 'input-manifest.json'), '--hephaestus-evidence', path.join(output, 'input-component-evidence.json'), '--source-pdf', path.resolve(args.pdf), '--output-dir', reviewDir];
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
      ...(args['cache-only'] === 'true' ? { MOBIUS_VISUAL_CACHE_ONLY: 'true' } : {}),
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
// Isolated in-process API authentication only; never a provider credential or
// a change to the configured/live MOBIUS API.
process.env.API_KEY = crypto.randomBytes(24).toString('hex');
const db = (await import(pathToFileURL(path.resolve('src/api/db.js')).href)).default;
const projectSource = createProjectSourceService({ dataRoot });
const { descriptor } = await projectSource.persistUpload(projectId, path.resolve(args.pdf), { filename: 'proof-rulebook.pdf' });
assert.equal(descriptor.sha256, knowledge.sourcePdfSha256);
const body = { name: knowledge.gameIdentity?.displayName, components, images: [], script: '', scenes: compiled.scenes,
  projectContext: { projectId, sourcePdf: descriptor, sourceSha256: descriptor.sha256, visualReviewItems: compiled.reviewItems,
    canonicalProductionState: compiled } };
let app = express();
app.use(express.json({ limit: transport.API_LIMIT_BYTES }));
app.use(transport.bodyErrorHandler);
registerProjectPersistenceRoutes(app, { db, projectSource });
let server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
let url = `http://127.0.0.1:${server.address().port}`;
const measured = first.scenes.flatMap((s) => s.candidates).filter((c) => c.status === 'MEASURED');
const report = { project: knowledge.gameIdentity, sourceSha: descriptor.sha256, sourceImagesCopied: images.length, unavailable,
  provider: first.summary, replay: replay.summary, imagesExamined: new Set(measured.map((c) => c.asset_id)).size,
  objectsMatched: compiled.sourceSelections.flatMap((s) => s.referentSelections || []).filter((s) => s.status === 'AUTO_ACCEPTED').length,
  fullyBoundScenes: compiled.sourceSelections.filter((s) => s.status === 'AUTO_ACCEPTED').length,
  scenes: compiled.scenes.length, reviews: compiled.reviewItems.length, hephaestusProviderCalls: 0, ruleGenerationCalls: 0,
  status: first.summary.providerBlocker ? 'BLOCKED' : 'PARTIEL', inputsHash: hash(knowledge), replayIdentical: true };
try {
  const packet = transport.packProjectState(body);
  report.persistence = { logicalStateBytes: transport.bytes(compiled), compactStateBytes: transport.bytes(transport.packProjectState(compiled)),
    logicalBodyBytes: transport.bytes(body), httpBodyBytes: transport.bytes(packet), budgetBytes: transport.TRANSPORT_BUDGET_BYTES,
    apiLimitBytes: transport.API_LIMIT_BYTES, replays: [] };
  assert.ok(transport.bytes(packet) < transport.TRANSPORT_BUDGET_BYTES);
  // Each bounded persistence observation owns a connection. Packing a complete
  // state is synchronous and may outlast an idle keep-alive socket's lifetime.
  const post = async payload => {
    const response = await fetch(`${url}/api/projects/${projectId}/production-state`, { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify(payload) });
    await response.arrayBuffer();
    return response.status;
  };
  assert.equal(await post(packet), 200);
  const diskFile = process.env.DB_DATA_FILE;
  const initialDisk = hash(fs.readFileSync(diskFile));
  const load = async () => {
    const response = await fetch(`${url}/load-project/${projectId}`, { headers: { 'x-api-key': process.env.API_KEY, connection: 'close' } });
    assert.equal(response.status, 200, 'Real Cockpit hydration route must succeed');
    return response.json();
  };
  const hydrated = await load();
  assert.equal(hash(hydrated.projectContext.canonicalProductionState), hash(JSON.parse(JSON.stringify(compiled))));
  assert.equal(hash(hydrated.projectContext.visualReviewItems), hash(compiled.reviewItems));
  for (let i = 0; i < 3; i++) {
    const reencoded = transport.packProjectState(transport.unpackProjectState(packet));
    assert.equal(hash(reencoded), hash(packet));
    assert.equal(await post(reencoded), 200);
    assert.equal(hash(fs.readFileSync(diskFile)), initialDisk);
    report.persistence.replays.push({ httpBodyBytes: transport.bytes(reencoded), storedBytes: fs.statSync(diskFile).size, identical: true });
  }
  report.persistence.rejections = [];
  for (const [label, context] of [
    ['wrong-project', { ...body.projectContext, projectId: 'foreign-project' }],
    ['wrong-source-sha', { ...body.projectContext, sourceSha256: '0'.repeat(64) }],
    ['wrong-descriptor-sha', { ...body.projectContext, sourcePdf: { ...descriptor, sha256: '0'.repeat(64) } }],
  ]) {
    const status = await post(transport.packProjectState({ ...body, projectContext: context }));
    assert.ok([400, 409].includes(status));
    assert.equal(hash(fs.readFileSync(diskFile)), initialDisk);
    report.persistence.rejections.push({ label, status, noPartialWrite: true });
  }
  if (transport.bytes(body) > transport.API_LIMIT_BYTES) {
    assert.equal(await post(body), 413);
    assert.equal(hash(fs.readFileSync(diskFile)), initialDisk);
    report.persistence.rejections.push({ label: 'oversize-full-unpacked-body', status: 413, noPartialWrite: true });
  }
  await new Promise(resolve => server.close(resolve));
  const resumedDb = (await import(pathToFileURL(path.resolve('src/api/db.js')).href + '?proof-resume=' + Date.now())).default;
  const resumedApp = express();
  resumedApp.use(express.json({ limit: transport.API_LIMIT_BYTES }));
  resumedApp.use(transport.bodyErrorHandler);
  registerProjectPersistenceRoutes(resumedApp, { db: resumedDb, projectSource });
  app = resumedApp;
  server = await new Promise(resolve => { const s = resumedApp.listen(0, '127.0.0.1', () => resolve(s)); });
  url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(hash(await load()), hash(hydrated));
  report.persistence.restartHydrationIdentical = true;
  report.persistence.storedBytes = fs.statSync(diskFile).size;
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
  if (proofScene && args['render-still'] === 'true') {
    const { materializeInstructionalStill } = require('../src/services/visualPlanMaterializer.cjs');
    report.instructionalStill = await materializeInstructionalStill({ state: compiled, sceneId: `knowledge-${proofScene.id}`,
      outputDir: path.join(output, 'instructional-stills'), allowReviewCandidate: true });
    if (report.instructionalStill.produced && args['verify-still'] === 'true') {
      const inputPath = path.join(output, 'instructional-stills', 'composition-review-input.json');
      fs.writeFileSync(inputPath, JSON.stringify({ ...report.instructionalStill,
        scene: compiled.scenes.find(s => s.id === report.instructionalStill.sceneId),
        componentTerms: Object.fromEntries(components.map(c => [c.id, c.name])) }));
      const reviewOutput = path.dirname(inputPath);
      const inspect = () => {
        const p = spawnSync(process.execPath, ['scripts/prepare-source-visuals.mjs', '--composition-review', inputPath, '--output-dir', reviewOutput],
          { windowsHide: true, encoding: 'utf8', env: { ...canonicalEnv, MOBIUS_VISUAL_SCENE_ID: report.instructionalStill.sceneId,
            MOBIUS_VISUAL_BUDGET_LEDGER: path.resolve(args['budget-ledger']), MOBIUS_VISUAL_BUDGET_GROUP: args['budget-group'] } });
        if (p.status !== 0) throw new Error('Composition review execution failed; no automatic retry.');
        return read(path.join(reviewOutput, 'composition-review.json'));
      };
      const measuredComposition = inspect();
      report.compositionReview = measuredComposition;
      if (!measuredComposition.summary.providerBlocker) {
        report.compositionReplay = inspect();
        assert.equal(report.compositionReplay.summary.providerCalls, 0);
      }
      const measuredObjects = measuredComposition.scenes.flatMap(s => s.candidates).filter(c => c.status === 'MEASURED').flatMap(c => c.objects);
      report.instructionalStill.validated = !report.instructionalStill.preparedOnly
        && measuredObjects.length === proofScene.visualRequirement.requiredObjects.length
        && measuredObjects.every(o => o.present && o.complete && o.stateCompatible && o.purposeSatisfied && o.phoneReadable && o.confidence >= 0.9);
    }
  }
  report.fullyIllustratedScenes = Number(report.instructionalStill?.validated === true);
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
} catch (error) {
  write('proof-failure.json', { ...report, status: 'FAIL', error: { code: error.code || null, message: error.message } });
  throw error;
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
