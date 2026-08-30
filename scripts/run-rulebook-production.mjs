#!/usr/bin/env node
import 'dotenv/config';

/**
 * Zero-state rulebook production.
 *
 * This command is intentionally an orchestration layer. PDF extraction,
 * ingestion validation, script generation, storyboard generation, visual QA,
 * narration, rendering, and media QA remain owned by the existing MOBIUS
 * services and production runner.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { computePdfIdentity, discoverRulebooks, findProcessedBySha } from './rulebook-library.mjs';
import { projectSourceService } from '../src/services/projectSourceService.js';
import { loadSourceVisualCatalog, selectSourceVisual } from '../src/services/sourceVisualSelection.js';
import { runProduction } from './run-source-grounded-production.mjs';

const require = createRequire(import.meta.url);
const { extractPdfToIngestionInput } = require('../src/ingestion/pdfExtractor.js');
const { extractComponentInventory } = await import('../src/services/componentInventory.js');
const { generateStoryboard } = require('../src/storyboard/generator.js');

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID_AMELIE || 'UJCi4DDncuo0VJDSIegj';
const VOICE_NAME = 'Amélie';
const MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_BASE_URL = process.env.MOBIUS_BASE_URL || 'http://127.0.0.1:5001';

function argsToObject(argv = process.argv.slice(2)) {
  const values = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { values[name] = argv[i + 1]; i += 1; }
    else flags.add(name);
  }
  return { values, flags };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function hashValue(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function jsonIf(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}
function exists(filePath) { return Boolean(filePath && fs.existsSync(filePath)); }
async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function slug(value) {
  return String(value || 'rulebook').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'rulebook';
}
function gameNameFromPdf(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, ' ').trim();
  const withoutEdition = base.replace(/\b(rulebook|rules|us|en|english|fr|french)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return withoutEdition.split(' ').map((word) => word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word).join(' ') || 'Rulebook';
}
function headers(apiKey) {
  return { 'content-type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) };
}
async function apiJson(baseUrl, route, options = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}${route}`;
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        ...options,
        headers: { ...headers(options.apiKey || process.env.API_KEY), ...(options.headers || {}) },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  if (!response) throw new Error(`${options.method || 'GET'} ${route} network request failed after 3 attempts: ${lastError?.message || 'unknown error'}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${route} failed (${response.status}): ${body.error || body.code || 'unknown error'}`);
  return body;
}
async function postJson(baseUrl, route, body, apiKey) {
  return apiJson(baseUrl, route, { method: 'POST', body: JSON.stringify(body), apiKey });
}

function stageReady(checkpoint, name, inputHash, outputs) {
  return checkpoint.stages?.[name]?.inputHash === inputHash && outputs.every(exists);
}
function markStage(checkpoint, name, inputHash, outputs, extra = {}) {
  checkpoint.stages = checkpoint.stages || {};
  checkpoint.stages[name] = { inputHash, outputs, ...extra };
}
async function stopIfRequested(options, checkpoint, name, checkpointPath, result = {}) {
  if (options.stopAfter !== name) return false;
  checkpoint.stoppedAfter = name;
  await saveJson(checkpointPath, checkpoint);
  console.log(JSON.stringify({ status: 'stopped-after-stage', stage: name, ...result, checkpoint: checkpointPath }, null, 2));
  return true;
}

function pageText(pages) {
  return pages.map((page) => page.blocks.map((block) => String(block.text || '').trim()).filter(Boolean).join('\n')).join('\n\n').trim();
}
function pageRanges(pages) {
  let cursor = 0;
  return pages.map((page) => {
    const text = page.blocks.map((block) => String(block.text || '').trim()).filter(Boolean).join('\n');
    const start = cursor;
    cursor += text.length + 2;
    return { page: page.number, start, end: cursor };
  });
}
function pagesForSources(sources, ranges) {
  const selected = new Set();
  for (const source of sources || []) {
    const start = Number(source.startOffset);
    const end = Number(source.endOffset);
    ranges.forEach((range) => {
      if (Number.isFinite(start) && Number.isFinite(end) && end >= range.start && start <= range.end) selected.add(range.page);
    });
  }
  return selected.size ? [...selected].sort((a, b) => a - b) : [1];
}
function teachingSourcePages(scene, ranges, pages = []) {
  const available = new Set(pages.map((page) => Number(page.number)).filter(Number.isFinite));
  const title = String(scene.title || '').toLocaleLowerCase('fr-CA');
  const preferred = title.includes('présentation') || title.includes('introduction')
    ? [1, 2]
    : title.includes('objectif') || title.includes('matériel') || title.includes('mise en place') || title.includes('pause')
      ? [2, 3]
      : title.includes('tour') || title.includes('action')
        ? [3, 2]
        : title.includes('fin') || title.includes('décompte') || title.includes('conclusion')
          ? [4, 3]
          : [];
  const selected = preferred.filter((page) => available.size === 0 || available.has(page));
  if (selected.length) return selected;
  const cited = pagesForSources(scene.sources, ranges);
  const nonCover = cited.filter((page) => page > 1 && (available.size === 0 || available.has(page)));
  return nonCover.length ? [nonCover[0]] : cited;
}

function sceneForProduction(scene, ranges, pages = []) {
  const directions = Array.isArray(scene.visualDirections) ? scene.visualDirections : [];
  const overlayText = directions.map((direction) => direction.onScreenText).filter(Boolean).join(' ');
  return {
    id: scene.id,
    section: scene.title,
    narration: scene.spokenText,
    on_screen_text: overlayText || scene.title,
    source_pages: teachingSourcePages(scene, ranges, pages),
    callouts: directions.flatMap((direction) => direction.callouts || []),
    visual_focus: null,
  };
}
function sourcePageFallback(root, projectId, page) {
  return path.resolve(root, 'data', 'rulebook-images', projectId, `page-${page}.png`);
}

async function chooseNext(root) {
  const roots = [
    path.join(root, 'data', 'rulebook-input'),
    path.join(root, 'data', 'rulebooks'),
    path.join(root, 'data', 'pdf_images'),
    path.join(root, 'data', 'rulebook-library', 'rules'),
  ];
  const excluded = new Set(['node_modules', 'tests', 'fixtures', 'source']);
  const candidates = (await discoverRulebooks(roots)).filter((item) => !item.path.split(path.sep).some((part) => excluded.has(part.toLowerCase())));
  const rows = [];
  for (const candidate of candidates) {
    const processed = await findProcessedBySha(path.join(root, 'data'), candidate.sha256);
    rows.push({ ...candidate, processed: processed.map((record) => ({ projectId: record.documentId, status: record.status || null })) });
  }
  return { candidates: rows, next: rows.find((row) => row.processed.length === 0) || null };
}

async function reserveProject({ baseUrl, apiKey, projectId, gameName, language, descriptor }) {
  return postJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/production-state`, {
    name: gameName,
    projectContext: {
      projectId, gameName, language, sourcePdf: descriptor,
      sourceSha256: descriptor.sha256, status: 'processing',
      production: { voiceName: VOICE_NAME, voiceId: VOICE_ID, modelId: MODEL_ID },
    },
    components: [], images: [], script: '', audio: '', scenes: [],
  }, apiKey);
}

async function persistProject({ baseUrl, apiKey, projectId, gameName, language, descriptor, manifest, components, scriptPackage, storyboardManifest, scenes, images, production = {}, audioAssets = [] }) {
  const context = {
    projectId, gameName, language, sourcePdf: descriptor, sourceSha256: descriptor.sha256,
    rulebookText: manifest.text.full, ingestionManifest: manifest.ingestion,
    storyboardManifest, scriptPackage, audioAssets, status: production.status || 'processing',
    production: { voiceName: VOICE_NAME, voiceId: VOICE_ID, modelId: MODEL_ID, ...production },
  };
  return postJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/production-state`, {
    name: gameName,
    metadata: { sourceIdentity: descriptor, ingestionDiagnostics: manifest.diagnostics },
    projectContext: context,
    components, images, script: JSON.stringify(scriptPackage), audio: JSON.stringify(audioAssets), scenes,
  }, apiKey);
}

async function runZeroState(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const apiKey = options.apiKey || process.env.API_KEY;
  const language = options.language || 'fr-CA';
  if (language !== 'fr-CA') throw new Error(`The zero-state production profile requires fr-CA; received ${language}.`);

  const requested = path.resolve(options.pdf);
  if (!exists(requested)) throw new Error(`Rulebook PDF not found: ${requested}`);
  const identity = await computePdfIdentity(requested);
  const processed = await findProcessedBySha(path.join(root, 'data'), identity.sha256);
  const prior = processed[0] || null;
  const projectId = prior?.documentId || `${slug(gameNameFromPdf(requested))}-${identity.sha256.slice(0, 12)}`;
  const gameName = prior?.documentId ? (jsonIf(path.join(root, 'data', projectId, 'production', 'zero-state-extraction.json'))?.gameName || gameNameFromPdf(requested)) : gameNameFromPdf(requested);
  const projectDir = path.join(root, 'data', projectId);
  const productionDir = path.join(projectDir, 'production');
  const checkpointPath = path.join(productionDir, 'zero-state-production-state.json');
  const checkpoint = jsonIf(checkpointPath, { version: 1, projectId, stages: {} });
  checkpoint.projectId = projectId;
  checkpoint.source = identity;

  let descriptor;
  if (prior) descriptor = await projectSourceService.readDescriptor(projectId);
  else descriptor = (await projectSourceService.persistUpload(projectId, requested, { filename: identity.filename })).descriptor;
  let persistedProject = null;
  try { persistedProject = await apiJson(baseUrl, `/load-project/${encodeURIComponent(projectId)}`, { apiKey }); } catch { /* New source: reserve below. */ }
  if (!persistedProject) await reserveProject({ baseUrl, apiKey, projectId, gameName, language, descriptor });
  markStage(checkpoint, 'source', identity.sha256, [path.join(projectDir, 'source', 'rulebook.pdf')], { reused: Boolean(prior) });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'source', checkpointPath, { projectId })) return { status: 'stopped', stage: 'source' };

  const extractionPath = path.join(productionDir, 'zero-state-extraction.json');
  const extractionHash = hashValue({ sourceSha256: identity.sha256, engine: 'auto', mergeLines: false });
  let extraction;
  if (stageReady(checkpoint, 'extraction', extractionHash, [extractionPath])) {
    extraction = jsonIf(extractionPath);
    checkpoint.stages.extraction.reused = true;
  } else {
    const sourcePath = await projectSourceService.resolveFile(projectId);
    const input = await extractPdfToIngestionInput(sourcePath, { source: descriptor.filename, mergeLines: false });
    const text = pageText(input.pages);
    if (!text) throw new Error('PDF extraction produced no usable text; the source requires OCR before production can continue.');
    const components = await extractComponentInventory(input.pages, { gameName });
    const manifest = await apiJson(baseUrl, '/api/ingest', {
      method: 'POST', apiKey,
      body: JSON.stringify({ documentId: projectId, metadata: { title: gameName, gameId: projectId, source: 'canonical-local-project' }, pages: input.pages, ocr: input.ocr, bggMetadata: {} }),
    });
    extraction = {
      projectId, gameName, source: identity, rulebookText: text, pages: input.pages,
      extractionMetadata: input.metadata, diagnostics: input.diagnostics,
      ingestion: manifest.manifest, components,
      pageRanges: pageRanges(input.pages),
    };
    await saveJson(extractionPath, extraction);
  }
  const manifest = { text: { full: extraction.rulebookText }, ingestion: extraction.ingestion, diagnostics: extraction.diagnostics || [] };
  const componentHash = hashValue(extraction.components);
  markStage(checkpoint, 'extraction', extractionHash, [extractionPath], { reused: checkpoint.stages.extraction?.reused === true, components: extraction.components.length, pages: extraction.pages.length, sourceEvidencePages: extraction.pageRanges.length });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'extraction', checkpointPath, { projectId })) return { status: 'stopped', stage: 'extraction' };

  const scriptPath = path.join(productionDir, 'zero-state-script-package.json');
  const scriptHash = hashValue({ sourceSha256: identity.sha256, componentHash, language });
  let scriptPackage;
  if (stageReady(checkpoint, 'script', scriptHash, [scriptPath])) {
    scriptPackage = jsonIf(scriptPath);
    checkpoint.stages.script.reused = true;
  } else {
    const response = await postJson(baseUrl, '/summarize', {
      projectId, rulebookText: extraction.rulebookText, language: 'french', gameName,
      metadata: {}, components: extraction.components.components || extraction.components,
    }, apiKey);
    if (!response.scriptPackage?.sections?.length) throw new Error('Script generation returned no canonical sections.');
    scriptPackage = response.scriptPackage;
    await saveJson(scriptPath, scriptPackage);
  }
  markStage(checkpoint, 'script', scriptHash, [scriptPath], { reused: checkpoint.stages.script?.reused === true, sections: scriptPackage.sections.length });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'script', checkpointPath, { projectId })) return { status: 'stopped', stage: 'script' };

  const storyboardPath = path.join(productionDir, 'zero-state-storyboard.json');
  const storyboardHash = hashValue({ scriptHash, ingestion: hashValue(extraction.ingestion), language });
  let storyboardManifest;
  if (stageReady(checkpoint, 'storyboard', storyboardHash, [storyboardPath])) {
    storyboardManifest = jsonIf(storyboardPath);
    checkpoint.stages.storyboard.reused = true;
  } else {
    const storyboard = generateStoryboard(extraction.ingestion, { scriptPackage, language: 'french' });
    storyboardManifest = storyboard;
    await saveJson(storyboardPath, storyboardManifest);
  }
  markStage(checkpoint, 'storyboard', storyboardHash, [storyboardPath], { reused: checkpoint.stages.storyboard?.reused === true, scenes: storyboardManifest.scenes.length });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'storyboard', checkpointPath, { projectId })) return { status: 'stopped', stage: 'storyboard' };

  const pageDir = path.join(root, 'data', 'rulebook-images', projectId);
  const pageManifestHash = identity.sha256;
  if (!stageReady(checkpoint, 'page-visuals', pageManifestHash, [path.join(pageDir, 'page-1.png')])) {
    await postJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/images/extract-rulebook`, { pdfPath: await projectSourceService.resolveFile(projectId) }, apiKey);
  }
  markStage(checkpoint, 'page-visuals', pageManifestHash, [path.join(pageDir, 'page-1.png')], { reused: checkpoint.stages['page-visuals']?.inputHash === pageManifestHash });

  const hephDir = path.join(projectDir, 'hephaestus');
  const hephManifestPath = path.join(hephDir, 'manifest.json');
  const hephStatePath = path.join(hephDir, 'extraction-state.json');
  const hephHash = identity.sha256;
  if (!stageReady(checkpoint, 'hephaestus', hephHash, [hephManifestPath]) || jsonIf(hephStatePath)?.sourceSha256 !== identity.sha256) {
    await postJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/images/extract-hephaestus`, {}, apiKey);
    await saveJson(hephStatePath, { sourceSha256: identity.sha256, extractedAt: new Date().toISOString() });
  }
  markStage(checkpoint, 'hephaestus', hephHash, [hephManifestPath], { reused: checkpoint.stages.hephaestus?.inputHash === hephHash && jsonIf(hephStatePath)?.sourceSha256 === identity.sha256 });

  const visualScriptPath = path.join(productionDir, 'zero-state-visual-review-script.json');
  const visualScript = {
    version: 1, game: gameName, language, scenes: storyboardManifest.scenes.map((scene) => sceneForProduction(scene, extraction.pageRanges, extraction.pages)),
  };
  const visualScriptHash = hashValue({ storyboardHash, pages: extraction.pageRanges });
  if (!stageReady(checkpoint, 'visual-script', visualScriptHash, [visualScriptPath])) await saveJson(visualScriptPath, visualScript);
  markStage(checkpoint, 'visual-script', visualScriptHash, [visualScriptPath], { reused: checkpoint.stages['visual-script']?.inputHash === visualScriptHash });

  const visualReviewDir = path.join(productionDir, 'source-visual-review');
  const qualityPath = path.join(visualReviewDir, 'source-visual-quality.json');
  const semanticPath = path.join(visualReviewDir, 'source-visual-semantic-matches.json');
  const visualReviewHash = hashValue({ visualScriptHash, hephHash, qualityModel: process.env.MOBIUS_VISUAL_QA_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini', matchModel: process.env.MOBIUS_VISUAL_MATCH_MODEL || process.env.OPENAI_MODEL || 'gpt-5' });
  if (!stageReady(checkpoint, 'visual-review', visualReviewHash, [qualityPath, semanticPath])) {
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-source-visuals.mjs'), '--script', visualScriptPath, '--asset-manifest', hephManifestPath, '--output-dir', visualReviewDir], {
      cwd: root, env: { ...process.env, PYTHON: python }, stdio: 'inherit', windowsHide: true,
    });
    if (result.status !== 0) throw new Error(`prepare-source-visuals exited with code ${result.status}`);
  }
  markStage(checkpoint, 'visual-review', visualReviewHash, [qualityPath, semanticPath]);

  const catalog = loadSourceVisualCatalog(hephManifestPath, { qualityReportPath: qualityPath, semanticReportPath: semanticPath });
  const boundScenes = storyboardManifest.scenes.map((scene) => {
    const productionScene = sceneForProduction(scene, extraction.pageRanges, extraction.pages);
    const selection = selectSourceVisual(productionScene, catalog, sourcePageFallback(root, projectId, productionScene.source_pages[0]));
    if (!selection.path || !exists(selection.path)) throw new Error(`No renderable visual for ${scene.id}`);
    return {
      ...scene,
      renderVisual: {
        path: selection.path, assetId: selection.assetId || null, kind: selection.kind === 'component' ? 'automatic-asset' : 'rulebook-page-fallback',
        confidence: selection.confidence, reason: selection.reason, sourcePage: selection.sourcePage || productionScene.source_pages[0],
        semanticMatch: selection.semanticMatch || null,
      },
    };
  });
  const visualCounts = boundScenes.reduce((counts, scene) => {
    const kind = scene.renderVisual.kind;
    if (kind === 'automatic-asset') counts.automatic += 1;
    else if (kind === 'explicit-asset' || kind === 'component') counts.explicit += 1;
    else counts.fallback += 1;
    return counts;
  }, { explicit: 0, automatic: 0, fallback: 0, missing: 0 });
  if (visualCounts.missing) throw new Error('Zero-state visual contract has missing bindings.');
  markStage(checkpoint, 'visual-bindings', hashValue({ visualScriptHash, semantic: jsonIf(semanticPath) }), [hephManifestPath, qualityPath, semanticPath], { counts: visualCounts });

  const imagesResponse = await apiJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/images`, { apiKey });
  const initialStateHash = hashValue({ identity: identity.sha256, scriptHash, storyboardHash, visualCounts });
  await persistProject({ baseUrl, apiKey, projectId, gameName, language, descriptor, manifest, components: extraction.components.components || extraction.components, scriptPackage, storyboardManifest, scenes: boundScenes, images: imagesResponse.images || [], production: { status: 'ready_for_production', sourceVisualManifest: hephManifestPath, visualQualityReport: qualityPath, semanticVisualReport: semanticPath, inputHash: initialStateHash } });
  markStage(checkpoint, 'canonical-state', initialStateHash, [storyboardPath], { reused: false, visualCounts });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'canonical-state', checkpointPath, { projectId, visualCounts })) return { status: 'stopped', stage: 'canonical-state' };

  const production = await runProduction({ projectId, language, root, baseUrl, apiKey, forceRender: Boolean(options.forceRender) });
  const audioSidecar = jsonIf(path.join(productionDir, 'narration-assets.json'), {});
  const report = jsonIf(path.join(productionDir, 'production-report.json'), production);
  await persistProject({ baseUrl, apiKey, projectId, gameName, language, descriptor, manifest, components: extraction.components.components || extraction.components, scriptPackage, storyboardManifest, scenes: boundScenes, images: imagesResponse.images || [], audioAssets: audioSidecar.assets || [], production: { status: 'complete', sourceVisualManifest: hephManifestPath, visualQualityReport: qualityPath, semanticVisualReport: semanticPath, reportPath: path.join(productionDir, 'production-report.json'), report }, });
  checkpoint.stages.production = { inputHash: hashValue({ initialStateHash, report: report.render?.outputSha256 || null }), reused: report.render?.reused === true, reportPath: path.join(productionDir, 'production-report.json'), ttsReused: report.narration?.reused || 0, ttsGenerated: report.narration?.generated || 0 };
  checkpoint.stages.qa = { status: report.status, output: report.render?.outputPath, media: report.media, visuals: visualCounts };
  delete checkpoint.stoppedAfter;
  await saveJson(checkpointPath, checkpoint);
  const final = { ...report, zeroState: { projectId, gameName, source: identity, extraction: { pages: extraction.pages.length, diagnostics: extraction.diagnostics, components: (extraction.components.components || extraction.components).length, scenes: storyboardManifest.scenes.length }, visuals: visualCounts, checkpoint: checkpointPath } };
  await saveJson(path.join(productionDir, 'zero-state-production-report.json'), final);
  console.log(JSON.stringify(final, null, 2));
  return final;
}

async function main() {
  const { values, flags } = argsToObject();
  const root = path.resolve(values.root || process.cwd());
  if (flags.has('next') || values.next !== undefined) {
    const inventory = await chooseNext(root);
    if (flags.has('dry-run') || values['dry-run'] !== undefined) { console.log(JSON.stringify(inventory, null, 2)); return; }
    if (!inventory.next) throw new Error('No unused rulebook PDF was found in the configured input folders.');
    values.pdf = inventory.next.path;
  }
  if (!values.pdf) throw new Error('Use --pdf <path>, or --next [--dry-run].');
  await runZeroState({ root, pdf: values.pdf, language: values.lang || values.language || 'fr-CA', baseUrl: values['base-url'], apiKey: values['api-key'], stopAfter: values['stop-after-stage'], forceRender: flags.has('force-render') });
}

if (pathToFileURL(path.resolve(process.argv[1] || '')).href === import.meta.url) {
  main().catch((error) => { console.error(`[run-rulebook-production] ${error.message}`); process.exitCode = 1; });
}

export { chooseNext, runZeroState, stageReady };
