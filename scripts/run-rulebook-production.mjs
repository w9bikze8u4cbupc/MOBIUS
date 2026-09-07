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
import editorialStandard from '../src/services/editorialStandard.cjs';
import { listConfiguredProviders, resolveConfiguredProviderModels } from '../src/services/aiProviderExecutor.js';
import { resolveCanonicalGameIdentity, titleFromRulebook } from '../src/services/gameIdentity.cjs';
import { buildHephaestusEvidence, writeHephaestusEvidence } from '../src/services/hephaestusEvidence.js';
import { buildGameplayModel, buildGameplayTeachingPlan, writeGameplayModel } from '../src/services/gameplayActions.js';
import { buildEndgameModel, buildEndgameTeachingPlan, writeEndgameModel } from '../src/services/scoringEndgame.js';

const require = createRequire(import.meta.url);
const { extractPdfToIngestionInput } = require('../src/ingestion/pdfExtractor.js');
const { COMPONENT_INVENTORY_CONTRACT_VERSION, extractComponentInventory } = await import('../src/services/componentInventory.js');
const { generateStoryboard } = require('../src/storyboard/generator.js');
const { buildKnowledgeTeachingPlan, buildTutorialCoverageMatrix, runMultiPassRulebookIntelligence } = require('../src/services/rulebookKnowledge.cjs');
const { compileCanonicalProductionState } = require('../src/services/canonicalProductionCompiler.cjs');
const { recoverAuthorizedBggCandidates, rectifyAuthorizedCandidate } = require('../src/services/sourceAssetResolver.cjs');
const { buildPhoneScaleQaSheet } = require('../src/services/phoneScaleQa.cjs');
const { materializeVisualPlanFrames } = require('../src/services/visualPlanMaterializer.cjs');

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID_AMELIE || 'UJCi4DDncuo0VJDSIegj';
const VOICE_NAME = 'Amélie';
const MODEL_ID = 'eleven_multilingual_v2';
const { DEFAULT_NARRATION_PRESET, getEditorialContract } = editorialStandard;
const VISUAL_PIPELINE_VERSION = 'focused-source-visuals-v4-layout-semantic-recovery';
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

function findProjectKnowledgeSeed(root, projectId, sourcePdfSha256) {
  const preferred = path.join(root, 'config', 'projects', projectId, 'rulebook-knowledge.v1.json');
  if (exists(preferred)) return preferred;
  const projectsRoot = path.join(root, 'config', 'projects');
  if (!exists(projectsRoot)) return null;
  for (const directory of fs.readdirSync(projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const candidate = path.join(projectsRoot, directory.name, 'rulebook-knowledge.v1.json');
    const seed = jsonIf(candidate);
    if (seed?.sourcePdfSha256 === sourcePdfSha256) return candidate;
  }
  return null;
}

function fallbackKnowledgeSeed({ projectId, identity, sourcePdfSha256, components, storyboardManifest, ranges }) {
  const ruleAtoms = (storyboardManifest.scenes || []).map((scene, index) => {
    const pages = teachingSourcePages(scene, ranges).map((page) => ({ page }));
    const setup = scene.type === 'setup_step' || /mise en place|setup/i.test(`${scene.title || ''} ${scene.section || ''}`);
    return {
      id: `source-section-${scene.id || index + 1}`,
      domain: setup ? 'setup' : 'source_section',
      coverageDomains: setup ? ['complete_setup', 'component_placement_orientation'] : [],
      title: scene.title || scene.section || `Règle ${index + 1}`,
      mandatoryOrOptional: 'mandatory',
      procedureSteps: [scene.spokenText || scene.narration || scene.text].filter(Boolean),
      stateChange: scene.spokenText || scene.narration || scene.text || null,
      stateAfter: 'La règle expliquée est appliquée.',
      result: 'La partie peut poursuivre selon la source.',
      componentRefs: scene.componentRefs || scene.visualPlan?.componentRefs || [],
      sourceRefs: pages,
      confidence: pages.length ? 0.72 : 0.4,
      reviewState: 'review-required',
      visualRequirement: {
        purpose: scene.title || scene.section || 'Expliquer la règle source.',
        requiredObjects: scene.componentRefs?.length ? scene.componentRefs : [scene.title || scene.section || 'élément de jeu'],
        preferredComposition: setup ? 'WIDE_SETUP' : 'SPLIT_CONTAIN_CENTERED',
      },
      teaching: {
        majorSection: scene.section || scene.title || 'Règles',
        heading: scene.title || scene.section || 'Règle',
        narration: scene.spokenText || scene.narration || scene.text || '',
        displayLines: (scene.visualDirections || []).map((direction) => direction.onScreenText).filter(Boolean),
        sequence: (index + 1) * 10,
      },
    };
  });
  return {
    projectId,
    sourcePdfSha256,
    extractionModel: 'existing-provider-plus-mobius-multipass-critic',
    gameIdentity: { displayName: identity.displayName, spokenName: identity.spokenName, locale: identity.locale, edition: identity.edition },
    components,
    ruleAtoms,
    uncertainties: [{ code: 'UNREVIEWED_AUTOMATIC_EXTRACTION', reviewState: 'review-required' }],
  };
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
function gameNameFromRulebookText(text, fallback) {
  return titleFromRulebook(text) || fallback;
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
  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${route} failed (${response.status}): ${body.error || body.code || 'unknown error'}`);
    error.status = response.status;
    error.code = body.code || null;
    error.classification = body.classification || null;
    error.providerAttempts = body.providerAttempts || [];
    throw error;
  }
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
  const cited = pagesForSources(scene.sources, ranges);
  const nonCover = cited.filter((page) => page > 1 && (available.size === 0 || available.has(page)));
  // Source offsets are authoritative. The old title table paired scenes with
  // unrelated neighbouring pages in real rulebooks.
  if (nonCover.length) return nonCover.slice(0, 2);
  const validCited = cited.filter((page) => available.size === 0 || available.has(page));
  return validCited.length ? validCited.slice(0, 2) : [1];
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
      production: { voiceName: VOICE_NAME, voiceId: VOICE_ID, modelId: MODEL_ID, narrationPreset: DEFAULT_NARRATION_PRESET, editorial: getEditorialContract({ narrationPreset: DEFAULT_NARRATION_PRESET }) },
    },
    components: [], images: [], script: '', audio: '', scenes: [],
  }, apiKey);
}

async function persistProject({ baseUrl, apiKey, projectId, gameName, language, descriptor, manifest, components, scriptPackage, storyboardManifest, scenes, images, production = {}, audioAssets = [], gameMetadata = {}, gameplayModel = null, endgameModel = null, rulebookKnowledgeModel = null, tutorialCoverage = null, canonicalProductionState = null }) {
  const context = {
    projectId, gameName, language, metadata: gameMetadata, sourcePdf: descriptor, sourceSha256: descriptor.sha256,
    rulebookText: manifest.text.full, ingestionManifest: manifest.ingestion,
    storyboardManifest, scriptPackage, audioAssets, status: production.status || 'processing',
    gameplayModel,
    endgameModel,
    rulebookKnowledgeModel,
    tutorialCoverage,
    visualPlans: canonicalProductionState?.visualPlans || [],
    physicalGameStates: canonicalProductionState?.physicalStates || [],
    visualReviewItems: canonicalProductionState?.reviewItems || [],
    productionQa: canonicalProductionState?.qa || null,
    generatorProductization: canonicalProductionState ? {
      contract: canonicalProductionState.contract,
      sourceResolverContract: canonicalProductionState.sourceResolverContract,
      codeRequiredForNormalProduction: false,
      status: canonicalProductionState.status,
    } : null,
    production: { voiceName: VOICE_NAME, voiceId: VOICE_ID, modelId: MODEL_ID, narrationPreset: DEFAULT_NARRATION_PRESET, editorial: getEditorialContract({ narrationPreset: DEFAULT_NARRATION_PRESET }), ...production },
  };
  return postJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/production-state`, {
    name: gameName,
    metadata: { sourceIdentity: descriptor, ingestionDiagnostics: manifest.diagnostics, gameMetadata },
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
  let gameName = prior?.documentId ? (jsonIf(path.join(root, 'data', projectId, 'production', 'zero-state-extraction.json'))?.gameName || gameNameFromPdf(requested)) : gameNameFromPdf(requested);
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
  const extractionHash = hashValue({ sourceSha256: identity.sha256, engine: 'auto', mergeLines: false, componentInventory: COMPONENT_INVENTORY_CONTRACT_VERSION, gameIdentity: 'content-before-filename-v1' });
  let extraction;
  if (stageReady(checkpoint, 'extraction', extractionHash, [extractionPath])) {
    extraction = jsonIf(extractionPath);
    checkpoint.stages.extraction.reused = true;
  } else {
    const sourcePath = await projectSourceService.resolveFile(projectId);
    const input = await extractPdfToIngestionInput(sourcePath, { source: descriptor.filename, mergeLines: false });
    const text = pageText(input.pages);
    if (!text) throw new Error('PDF extraction produced no usable text; the source requires OCR before production can continue.');
    gameName = gameNameFromRulebookText(text, gameName);
    const components = await extractComponentInventory(input.pages, { gameName });
    const manifest = await apiJson(baseUrl, '/api/ingest', {
      method: 'POST', apiKey,
      body: JSON.stringify({ documentId: projectId, metadata: { title: gameName, gameId: projectId, source: 'canonical-local-project' }, pages: input.pages, ocr: input.ocr, bggMetadata: {} }),
    });
    extraction = {
      projectId,
      gameName,
      identity: resolveCanonicalGameIdentity({
        projectMetadata: { gameName },
        rulebook: { gameName, text },
        filename: descriptor.filename,
        locale: 'fr-CA',
        sourceLanguage: 'en',
      }),
      source: identity, rulebookText: text, pages: input.pages,
      extractionMetadata: input.metadata, diagnostics: input.diagnostics,
      ingestion: manifest.manifest, components,
      pageRanges: pageRanges(input.pages),
    };
    await saveJson(extractionPath, extraction);
  }
  gameName = extraction.gameName || gameName;
  const manifest = { text: { full: extraction.rulebookText }, ingestion: extraction.ingestion, diagnostics: extraction.diagnostics || [] };
  const componentHash = hashValue(extraction.components);
  markStage(checkpoint, 'extraction', extractionHash, [extractionPath], { reused: checkpoint.stages.extraction?.reused === true, components: extraction.components.length, pages: extraction.pages.length, sourceEvidencePages: extraction.pageRanges.length });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'extraction', checkpointPath, { projectId })) return { status: 'stopped', stage: 'extraction' };

  const scriptPath = path.join(productionDir, 'zero-state-script-package.json');
  const providerResolution = await resolveConfiguredProviderModels({ providers: listConfiguredProviders() });
  const providerContract = providerResolution.providers.map(({ name, model }) => ({ name, model }));
  const scriptHash = hashValue({ sourceSha256: identity.sha256, componentHash, language, providerContract, editorialContract: 'metadata-card-v1-section-labels-v1' });
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
    scriptPackage = {
      ...response.scriptPackage,
      metadata: response.metadata || {},
      generationProvenance: response.generationProvenance || null,
    };
    await saveJson(scriptPath, scriptPackage);
  }
  const gameMetadata = scriptPackage.metadata || {};
  markStage(checkpoint, 'script', scriptHash, [scriptPath], { reused: checkpoint.stages.script?.reused === true, sections: scriptPackage.sections.length });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'script', checkpointPath, { projectId })) return { status: 'stopped', stage: 'script' };

  const storyboardPath = path.join(productionDir, 'zero-state-storyboard.json');
  let storyboardHash = hashValue({ scriptHash, ingestion: hashValue(extraction.ingestion), language });
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
  const hephEvidencePath = path.join(hephDir, 'component-evidence.json');
  const hephHash = identity.sha256;
  if (!stageReady(checkpoint, 'hephaestus', hephHash, [hephManifestPath]) || jsonIf(hephStatePath)?.sourceSha256 !== identity.sha256) {
    await postJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/images/extract-hephaestus`, {}, apiKey);
    await saveJson(hephStatePath, { sourceSha256: identity.sha256, extractedAt: new Date().toISOString() });
  }
  const hephEvidence = buildHephaestusEvidence({
    manifestPath: hephManifestPath,
    projectId,
    sourcePdfSha256: identity.sha256,
    gameIdentity: extraction.identity || { displayName: gameName },
    components: extraction.components.components || extraction.components,
    setupSteps: storyboardManifest.scenes.filter((scene) => scene.type === 'setup_step').map((scene) => ({
      id: scene.id,
      text: scene.spokenText || scene.text,
      componentRefs: scene.componentRefs || scene.visualPlan?.componentRefs || [],
    })),
  });
  await writeHephaestusEvidence(hephEvidencePath, hephEvidence);
  markStage(checkpoint, 'hephaestus', hephHash, [hephManifestPath, hephEvidencePath], { reused: checkpoint.stages.hephaestus?.inputHash === hephHash && jsonIf(hephStatePath)?.sourceSha256 === identity.sha256, evidenceContract: hephEvidence.contract, acceptedVisuals: hephEvidence.acceptedVisuals.length, reviewQueue: hephEvidence.reviewQueue.length });

  const gameplayModelPath = path.join(productionDir, 'gameplay-actions.json');
  const gameplayHash = hashValue({ sourceSha256: identity.sha256, scriptHash, hephEvidence: hashValue(hephEvidence), contract: 'mobius-gameplay-actions-v1' });
  let gameplayModel;
  if (stageReady(checkpoint, 'gameplay-actions', gameplayHash, [gameplayModelPath])) {
    gameplayModel = jsonIf(gameplayModelPath);
    checkpoint.stages['gameplay-actions'].reused = true;
  } else {
    gameplayModel = buildGameplayModel({
      projectId,
      gameIdentity: extraction.identity || { displayName: gameName },
      sections: scriptPackage.sections || [],
      components: extraction.components.components || extraction.components,
      evidence: hephEvidence,
    });
    writeGameplayModel(gameplayModelPath, gameplayModel);
  }
  markStage(checkpoint, 'gameplay-actions', gameplayHash, [gameplayModelPath], { reused: checkpoint.stages['gameplay-actions']?.reused === true, contract: gameplayModel.contract, actions: gameplayModel.actions.length, acceptedBindings: gameplayModel.visualBindings.filter((binding) => binding.reviewState === 'accepted').length, reviewRequired: gameplayModel.reviewRequired });
  const endgameModelPath = path.join(productionDir, 'scoring-endgame.json');
  const endgameHash = hashValue({ sourceSha256: identity.sha256, scriptHash, hephEvidence: hashValue(hephEvidence), gameplay: hashValue(gameplayModel), contract: 'mobius-scoring-endgame-v1' });
  let endgameModel;
  if (stageReady(checkpoint, 'scoring-endgame', endgameHash, [endgameModelPath])) {
    endgameModel = jsonIf(endgameModelPath);
    checkpoint.stages['scoring-endgame'].reused = true;
  } else {
    endgameModel = buildEndgameModel({
      projectId,
      gameIdentity: extraction.identity || { displayName: gameName },
      sections: scriptPackage.sections || [],
      components: extraction.components.components || extraction.components,
      evidence: hephEvidence,
    });
    writeEndgameModel(endgameModelPath, endgameModel);
  }
  markStage(checkpoint, 'scoring-endgame', endgameHash, [endgameModelPath], { reused: checkpoint.stages['scoring-endgame']?.reused === true, contract: endgameModel.contract, categories: endgameModel.scoringCategories.length, immediateVictoryConditions: endgameModel.endGameModel.immediateVictoryConditions.length, reviewRequired: endgameModel.reviewRequired });

  // Canonical rule intelligence sits between extraction and tutorial writing.
  // A source-SHA-specific reviewed seed may contribute verified project facts,
  // while unseen games enter through the same model and completeness critic.
  const rulebookKnowledgePath = path.join(productionDir, 'rulebook-knowledge-model.json');
  const tutorialCoveragePath = path.join(productionDir, 'tutorial-coverage-matrix.json');
  const reviewedSeedPath = findProjectKnowledgeSeed(root, projectId, identity.sha256);
  const projectSeed = reviewedSeedPath
    ? jsonIf(reviewedSeedPath)
    : fallbackKnowledgeSeed({
      projectId,
      identity: extraction.identity || { displayName: gameName, locale: language },
      sourcePdfSha256: identity.sha256,
      components: extraction.components.components || extraction.components,
      storyboardManifest,
      ranges: extraction.pageRanges,
    });
  const knowledgeHash = hashValue({
    sourceSha256: identity.sha256,
    projectSeed,
    gameplay: hashValue(gameplayModel),
    endgame: hashValue(endgameModel),
    contract: 'mobius-rulebook-intelligence-multipass-v1',
  });
  const intelligence = await runMultiPassRulebookIntelligence({
    projectSeed,
    pages: extraction.pages.map((page) => ({ page: page.number, text: page.blocks.map((block) => block.text || '').join('\n') })),
    gameplayModel,
    endgameModel,
    cachePath: rulebookKnowledgePath,
  });
  const rulebookKnowledgeModel = intelligence.model;
  const knowledgeTeachingPlan = buildKnowledgeTeachingPlan(rulebookKnowledgeModel);
  const knowledgeReady = rulebookKnowledgeModel.completenessCritic.incompleteAtoms.length === 0
    && rulebookKnowledgeModel.contradictionCheck.status === 'PASS'
    && rulebookKnowledgeModel.uncertainties.length === 0;
  const knowledgeScenes = knowledgeTeachingPlan.scenes.map((item) => ({
    id: `knowledge-${item.atomId}`,
    atomId: item.atomId,
    type: 'teaching_atom',
    title: item.heading,
    section: item.majorSection,
    spokenText: item.narration,
    narration: item.narration,
    deliveryProfile: item.profile || 'AMELIE_TEACHING_WARM_R10',
    on_screen_text: item.displayLines.join('\n'),
    source_pages: item.sourceRefs.map((ref) => ref.page).filter(Boolean),
    sourceRefs: item.sourceRefs,
    visualRequirement: item.visualRequirement,
  }));
  if (knowledgeReady && knowledgeScenes.length) storyboardManifest.scenes = knowledgeScenes;
  const initialKnowledgeIds = knowledgeScenes.map((scene) => scene.atomId);
  let tutorialCoverage = buildTutorialCoverageMatrix(rulebookKnowledgeModel, {
    includedAtomIds: initialKnowledgeIds,
    storyboardAtomIds: knowledgeReady ? initialKnowledgeIds : [],
  });
  await saveJson(tutorialCoveragePath, tutorialCoverage);
  markStage(checkpoint, 'rulebook-knowledge', knowledgeHash, [rulebookKnowledgePath, tutorialCoveragePath], {
    reused: intelligence.cacheHit,
    passesExecuted: intelligence.passesExecuted,
    reviewedSeedPath,
    knowledgeReady,
    atoms: rulebookKnowledgeModel.ruleAtoms.length,
    incompleteAtoms: rulebookKnowledgeModel.completenessCritic.incompleteAtoms.length,
    missingHighPriorityDomains: tutorialCoverage.missingHighPriorityDomains,
  });
  storyboardManifest = {
    ...storyboardManifest,
    gameplayTeachingPlan: buildGameplayTeachingPlan(gameplayModel),
    endgameTeachingPlan: buildEndgameTeachingPlan(endgameModel),
    knowledgeTeachingPlan,
    rulebookKnowledgePath,
    tutorialCoveragePath,
  };
  await saveJson(storyboardPath, storyboardManifest);
  storyboardHash = hashValue({ scriptHash, ingestion: hashValue(extraction.ingestion), language, gameplay: hashValue(storyboardManifest.gameplayTeachingPlan), endgame: hashValue(storyboardManifest.endgameTeachingPlan), knowledge: hashValue(knowledgeTeachingPlan) });
  markStage(checkpoint, 'storyboard', storyboardHash, [storyboardPath], { reused: false, scenes: storyboardManifest.scenes.length, gameplayTeachingScenes: storyboardManifest.gameplayTeachingPlan.scenes.length, endgameTeachingScenes: storyboardManifest.endgameTeachingPlan.scenes.length, knowledgeTeachingScenes: knowledgeTeachingPlan.scenes.length });
  if (await stopIfRequested(options, checkpoint, 'gameplay-actions', checkpointPath, { projectId, actions: gameplayModel.actions.length })) return { status: 'stopped', stage: 'gameplay-actions' };

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
  const focusedCropManifestPath = path.join(visualReviewDir, 'focused-page-crops.json');
  const combinedVisualManifestPath = path.join(visualReviewDir, 'source-visual-manifest.json');
  const visualReviewHash = hashValue({
    pipeline: VISUAL_PIPELINE_VERSION,
    visualScriptHash,
    hephHash,
    sourceSha256: identity.sha256,
    qualityModel: process.env.MOBIUS_VISUAL_QA_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini',
    matchModel: process.env.MOBIUS_VISUAL_MATCH_MODEL || process.env.OPENAI_MODEL || 'gpt-5',
  });
  if (!stageReady(checkpoint, 'visual-review', visualReviewHash, [qualityPath, semanticPath, combinedVisualManifestPath, focusedCropManifestPath])) {
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-source-visuals.mjs'), '--script', visualScriptPath, '--asset-manifest', hephManifestPath, '--output-dir', visualReviewDir, '--page-dir', pageDir, '--extraction', path.join(productionDir, 'zero-state-extraction.json'), '--source-sha256', identity.sha256], {
      cwd: root, env: { ...process.env, PYTHON: python }, stdio: 'inherit', windowsHide: true,
    });
    if (result.status !== 0) throw new Error(`prepare-source-visuals exited with code ${result.status}`);
  }
  markStage(checkpoint, 'visual-review', visualReviewHash, [qualityPath, semanticPath, combinedVisualManifestPath, focusedCropManifestPath]);

  const catalog = loadSourceVisualCatalog(combinedVisualManifestPath, { qualityReportPath: qualityPath, semanticReportPath: semanticPath, hephaestusEvidencePath: hephEvidencePath });
  const canonicalStatePath = path.join(productionDir, 'canonical-production-state.json');
  const visualPlansPath = path.join(productionDir, 'visual-plans.json');
  const physicalStatesPath = path.join(productionDir, 'physical-game-states.json');
  const visualReviewItemsPath = path.join(productionDir, 'visual-review-items.json');
  const productionQaPath = path.join(productionDir, 'production-qa.json');
  const phoneScaleQaPath = path.join(productionDir, 'phone-scale-qa.png');
  const authorizedManifestIndex = jsonIf(path.join(root, 'config', 'projects', projectId, 'authorized-source-manifests.json'), {});
  const authorizedCandidateManifestPaths = (authorizedManifestIndex.manifests || [])
    .map((entry) => path.resolve(root, entry.path || entry))
    .filter(exists);
  const recoveryConfig = jsonIf(path.join(root, 'config', 'projects', projectId, 'authorized-source-recovery.json'), {});
  if (recoveryConfig.enabled === true && recoveryConfig.exactGameVerified === true && recoveryConfig.targetsPath
      && (recoveryConfig.bggObjectId || gameMetadata.bggId)) {
    const recovered = recoverAuthorizedBggCandidates({
      root,
      objectId: recoveryConfig.bggObjectId || gameMetadata.bggId,
      targetsPath: path.resolve(root, recoveryConfig.targetsPath),
      outputDir: path.resolve(projectDir, 'source', 'authorized-bgg-candidates'),
      python: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
      pages: recoveryConfig.pages || 9,
    });
    authorizedCandidateManifestPaths.push(recovered.originalManifest);
  }
  if (recoveryConfig.enabled === true && recoveryConfig.exactGameVerified === true
      && Array.isArray(recoveryConfig.rectifications) && recoveryConfig.rectifications.length) {
    const rectifiedCandidates = recoveryConfig.rectifications.map((entry) => rectifyAuthorizedCandidate({
      root,
      id: entry.id,
      sourcePath: path.resolve(root, entry.sourcePath),
      outputPath: path.resolve(projectDir, entry.outputPath || path.join('source', 'rectified-candidates', `${entry.id}.png`)),
      reportPath: path.resolve(projectDir, entry.reportPath || path.join('source', 'rectified-candidates', `${entry.id}.report.json`)),
      templatePath: entry.templatePath ? path.resolve(root, entry.templatePath) : null,
      points: entry.points || null,
      width: entry.width,
      height: entry.height,
      padding: entry.padding,
      minimumInliers: entry.minimumInliers,
      python: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
      sourceAuthority: entry.sourceAuthority,
      semanticObjects: entry.semanticObjects,
      sourceRefs: entry.sourceRefs,
    }));
    const rectifiedManifestPath = path.resolve(projectDir, 'source', 'rectified-candidates', 'authorized-rectified-candidates.json');
    await saveJson(rectifiedManifestPath, {
      contract: 'mobius-authorized-rectified-source-candidates-v1',
      authority: 'AUTHORIZED_EXACT_EDITION_HIGH_RES',
      candidates: rectifiedCandidates,
    });
    authorizedCandidateManifestPaths.push(rectifiedManifestPath);
  }
  let canonicalProductionState = compileCanonicalProductionState({
    projectId,
    knowledgeModel: rulebookKnowledgeModel,
    coverageMatrix: tutorialCoverage,
    componentEvidence: hephEvidence,
    sourceAssets: catalog.assets,
    authorizedCandidateManifestPaths,
    displayBounds: { width: 1080, height: 760 },
  });
  const materialized = await materializeVisualPlanFrames({
    state: canonicalProductionState,
    outputDir: path.join(productionDir, 'visual-plan-frames'),
  });
  canonicalProductionState = {
    ...canonicalProductionState,
    scenes: materialized.scenes,
    visualPlanMaterialization: {
      contract: materialized.contract,
      outputDir: materialized.outputDir,
      records: materialized.records,
    },
  };
  await saveJson(canonicalStatePath, canonicalProductionState);
  await saveJson(visualPlansPath, { contract: 'mobius-canonical-visual-plans-v1', plans: canonicalProductionState.visualPlans });
  await saveJson(physicalStatesPath, { contract: 'mobius-physical-game-state-collection-v1', states: canonicalProductionState.physicalStates });
  await saveJson(visualReviewItemsPath, { contract: 'mobius-cockpit-visual-review-queue-v1', items: canonicalProductionState.reviewItems });
  await saveJson(productionQaPath, canonicalProductionState.qa);
  const phoneScaleQa = await buildPhoneScaleQaSheet({ scenes: canonicalProductionState.scenes, outputPath: phoneScaleQaPath });
  const boundScenes = canonicalProductionState.scenes;
  const visualCounts = boundScenes.reduce((counts, scene) => {
    const kind = scene.renderVisual?.kind || 'missing';
    if (kind === 'automatic-component' || kind === 'automatic-asset' || kind === 'component' || kind === 'automatic-visual-plan-composite') counts.automaticComponent += 1;
    else if (['focused-page-crop', 'focused-page-region'].includes(kind)) counts.automaticFocusedCrop += 1;
    else if (kind === 'explicit-asset') counts.explicit += 1;
    else if (kind === 'missing') counts.missing += 1;
    else counts.fallback += 1;
    return counts;
  }, { explicit: 0, automaticComponent: 0, automaticFocusedCrop: 0, fallback: 0, missing: 0 });
  const unresolvedVisuals = boundScenes.filter((scene) => !scene.renderVisual?.path || scene.visualReviewState === 'needs_visual_review');
  markStage(checkpoint, 'visual-bindings', hashValue({ visualScriptHash, semantic: jsonIf(semanticPath), canonicalCompiler: canonicalProductionState.contract }), [hephManifestPath, qualityPath, semanticPath, canonicalStatePath, visualPlansPath, physicalStatesPath, visualReviewItemsPath, productionQaPath, phoneScaleQaPath], { counts: visualCounts, unresolved: unresolvedVisuals.length, phoneScaleQa });

  const visualizedKnowledgeIds = boundScenes.filter((scene) => scene.atomId && scene.renderVisual?.path).map((scene) => scene.atomId);
  tutorialCoverage = buildTutorialCoverageMatrix(rulebookKnowledgeModel, {
    includedAtomIds: initialKnowledgeIds,
    storyboardAtomIds: knowledgeReady ? initialKnowledgeIds : [],
    visualizedAtomIds: visualizedKnowledgeIds,
  });
  await saveJson(tutorialCoveragePath, tutorialCoverage);

  const imagesResponse = await apiJson(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/images`, { apiKey });
  const initialStateHash = hashValue({ identity: identity.sha256, scriptHash, storyboardHash, visualCounts });
  await persistProject({ baseUrl, apiKey, projectId, gameName, language, descriptor, manifest, components: extraction.components.components || extraction.components, scriptPackage, storyboardManifest, scenes: boundScenes, images: imagesResponse.images || [], gameMetadata, gameplayModel, endgameModel, rulebookKnowledgeModel, tutorialCoverage, canonicalProductionState, production: { status: unresolvedVisuals.length ? 'review_required' : 'ready_for_production', sourceVisualManifest: combinedVisualManifestPath, visualQualityReport: qualityPath, semanticVisualReport: semanticPath, hephaestusEvidencePath: hephEvidencePath, hephaestusEvidenceContract: hephEvidence.contract, gameplayModelPath, gameplayModelContract: gameplayModel.contract, endgameModelPath, endgameModelContract: endgameModel.contract, rulebookKnowledgePath, rulebookKnowledgeContract: rulebookKnowledgeModel.contract, tutorialCoveragePath, tutorialCoverageContract: tutorialCoverage.contract, canonicalStatePath, visualPlansPath, physicalStatesPath, visualReviewItemsPath, productionQaPath, phoneScaleQaPath, inputHash: initialStateHash } });
  markStage(checkpoint, 'canonical-state', initialStateHash, [storyboardPath, canonicalStatePath, visualPlansPath, physicalStatesPath, visualReviewItemsPath, productionQaPath, phoneScaleQaPath], { reused: false, visualCounts, reviewItems: canonicalProductionState.reviewItems.length });
  await saveJson(checkpointPath, checkpoint);
  if (await stopIfRequested(options, checkpoint, 'canonical-state', checkpointPath, { projectId, visualCounts })) return { status: 'stopped', stage: 'canonical-state' };

  if (unresolvedVisuals.length) {
    return {
      status: 'review_required',
      stage: 'canonical-state',
      projectId,
      reviewItems: canonicalProductionState.reviewItems.length,
      reviewQueuePath: visualReviewItemsPath,
      codeRequiredForNormalProduction: false,
      message: 'Canonical source resolution requires Cockpit review before narration/render; no weak fallback was silently accepted.',
    };
  }

  const production = await runProduction({ projectId, language, root, baseUrl, apiKey, forceRender: Boolean(options.forceRender) });
  const audioSidecar = jsonIf(path.join(productionDir, 'narration-assets.json'), {});
  const report = jsonIf(path.join(productionDir, 'production-report.json'), production);
  const narratedKnowledgeIds = (audioSidecar.assets || []).map((asset) => asset.sceneId).filter((id) => initialKnowledgeIds.includes(id) || initialKnowledgeIds.includes(String(id).replace(/^knowledge-/, ''))).map((id) => String(id).replace(/^knowledge-/, ''));
  tutorialCoverage = buildTutorialCoverageMatrix(rulebookKnowledgeModel, {
    includedAtomIds: initialKnowledgeIds,
    storyboardAtomIds: knowledgeReady ? initialKnowledgeIds : [],
    visualizedAtomIds: visualizedKnowledgeIds,
    narratedAtomIds: narratedKnowledgeIds,
  });
  await saveJson(tutorialCoveragePath, tutorialCoverage);
  const qualityReport = jsonIf(qualityPath, {});
  const semanticReport = jsonIf(semanticPath, {});
  report.visuals = {
    ...(report.visuals || {}),
    explicit: visualCounts.explicit,
    automatic: visualCounts.automaticComponent + visualCounts.automaticFocusedCrop,
    automaticComponent: visualCounts.automaticComponent,
    automaticFocusedCrop: visualCounts.automaticFocusedCrop,
    fallback: visualCounts.fallback,
    missing: visualCounts.missing,
    rejectedForQuality: Number(qualityReport.summary?.rejected || 0),
    rejectedForSemantic: (semanticReport.scenes || []).filter((scene) => ['no-qualified-source-asset', 'no-semantic-match'].includes(scene.status)).length,
  };
  await saveJson(path.join(productionDir, 'production-report.json'), report);
  await persistProject({ baseUrl, apiKey, projectId, gameName, language, descriptor, manifest, components: extraction.components.components || extraction.components, scriptPackage, storyboardManifest, scenes: boundScenes, images: imagesResponse.images || [], audioAssets: audioSidecar.assets || [], gameMetadata, gameplayModel, endgameModel, rulebookKnowledgeModel, tutorialCoverage, canonicalProductionState, production: { status: 'complete', sourceVisualManifest: combinedVisualManifestPath, visualQualityReport: qualityPath, semanticVisualReport: semanticPath, hephaestusEvidencePath: hephEvidencePath, hephEvidenceContract: hephEvidence.contract, gameplayModelPath, gameplayModelContract: gameplayModel.contract, endgameModelPath, endgameModelContract: endgameModel.contract, rulebookKnowledgePath, rulebookKnowledgeContract: rulebookKnowledgeModel.contract, tutorialCoveragePath, tutorialCoverageContract: tutorialCoverage.contract, canonicalStatePath, visualPlansPath, physicalStatesPath, visualReviewItemsPath, productionQaPath, reportPath: path.join(productionDir, 'production-report.json'), report }, });
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

export { chooseNext, gameNameFromRulebookText, pagesForSources, sceneForProduction, teachingSourcePages, runZeroState, stageReady };
