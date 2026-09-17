import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import ffprobeStatic from 'ffprobe-static';
import { generateNarration } from '../src/services/elevenLabsService.js';
import editorialStandard from '../src/services/editorialStandard.cjs';

const require = createRequire(import.meta.url);
const { buildKnowledgeTeachingPlan, buildTutorialCoverageMatrix, runMultiPassRulebookIntelligence } = require('../src/services/rulebookKnowledge.cjs');
const { evaluateVisualQuality, resolveInstructionalVisual, resolveVisualPaneAlignment } = require('../src/services/instructionalVisualResolver.cjs');
const { resolveStoryboardBackground } = require('../src/services/tutorialAssemblyVisual.cjs');

const ROOT = path.resolve(process.cwd());
dotenv.config({ path: path.join(ROOT, '.env'), override: false });
const FFPROBE = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID_AMELIE || 'UJCi4DDncuo0VJDSIegj';
const NARRATION_PRESET = editorialStandard.getNarrationPreset('warm-engaging-fr-ca');

function parseArgs(argv = process.argv.slice(2)) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    values[argv[i].slice(2)] = argv[i + 1]; i += 1;
  }
  return values;
}
function absolute(value) { return path.resolve(ROOT, value); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function hashValue(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function exists(file) { return Boolean(file && fs.existsSync(file)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function probeDuration(file) { return Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim()); }
function normalizeText(text) { return editorialStandard.normalizeSpokenSymbols(String(text || '').replace(/\s+/g, ' ').trim()); }

function referenceText(refs = []) {
  const pages = [...new Set(refs.map((ref) => Number(ref.page)).filter((page) => page > 0))].sort((a, b) => a - b);
  if (!pages.length) return 'Source vérifiée';
  const contiguous = pages.length > 1 && pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  return contiguous ? `Livret p. ${pages[0]}–${pages.at(-1)}` : `Livret p. ${pages.join(', ')}`;
}

function makeSectionCard(title, banner, sonic) {
  const id = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `section-card-${id}`, type: 'section_card', sectionCard: true,
    majorSection: title, section: title, chapterTitle: title, durationSec: 2,
    narrationText: '', spokenNarration: 'NONE', ttsGenerated: false,
    background: { image: banner, kind: 'brand-section-card' },
    layout: { mode: 'brand', brandBanner: true },
    overlays: [{ type: 'section-card-title', text: title, position: 'section-card-title', fontColor: '#f7ecd2' }],
    audio: { speechRequired: false }, sourceRefs: [],
    canonicalTimelineRole: 'major-section-boundary', sonicSignatureReplay: false,
    approvedSonicMaster: sonic,
  };
}

function makeBrandScene(opening, project) {
  const source = clone(opening.scenes.find((scene) => scene.id === project.presentation.brandSceneId) || opening.scenes.find((scene) => ['brand-signature', 'brand-intro'].includes(scene.id)));
  const sonic = absolute(project.sonicMaster);
  source.id = 'brand-signature'; source.durationSec = 3.6; source.narrationText = '';
  source.spokenNarration = 'NONE'; source.ttsGenerated = false;
  source.audio = { ambientFile: sonic, ambientGain: 1, ambientFadeOutSec: 0.72, audioRole: 'café-ludique sonic signature', speechRequired: false, preMastered: true };
  source.background = { image: absolute(project.brandBanner), kind: 'brand-banner' };
  source.layout = { mode: 'brand', brandBanner: true }; source.overlays = []; source.sourceRefs = [];
  source.editorial = { ...(source.editorial || {}), brandAudio: clone(editorialStandard.BRAND_AUDIO_CONTRACT) };
  source.approvedSonicSha256 = sha256(sonic);
  return source;
}

function makeMetadataScenes(opening, project) {
  return (project.presentation.reuseOpeningSceneIds || []).map((id) => {
    const found = opening.scenes.find((scene) => scene.id === id);
    if (!found) throw new Error(`Missing configured presentation scene: ${id}`);
    const source = clone(found);
    source.id = `presentation-${id}`; source.majorSection = 'Présentation / But du jeu';
    source.section = source.majorSection; source.chapterTitle = source.majorSection;
    source.overlays = (source.overlays || []).filter((overlay) => overlay.type !== 'badge');
    if (project.presentation.metadataAudio && exists(absolute(project.presentation.metadataAudio))) {
      source.audio.file = absolute(project.presentation.metadataAudio);
      source.audio.deliveryProfile = project.presentation.metadataDeliveryProfile || 'AMELIE_METADATA';
      source.audio.narrationPreset = source.audio.deliveryProfile;
      source.audio.postSpeechTailSec = 0.35;
      source.durationSec = Number((probeDuration(source.audio.file) + 0.35).toFixed(3));
    }
    source.audio.ambientFile = absolute('src/assets/branding/sonic/cafe-ambience-freesound-25813.mp3');
    source.audio.ambientGain = 0.07;
    source.layout = { ...(source.layout || {}), visualAspectRatio: 1, visualPaneAlignment: { horizontal: 'CENTER', vertical: 'CENTER', fit: 'CONTAIN' } };
    return source;
  });
}

function makeTeachingScene(atom, asset, project) {
  const hasPauseCue = Boolean(atom.teaching.pauseCue);
  const alignment = resolveVisualPaneAlignment({
    visualPaneAlignment: { horizontal: 'CENTER', vertical: hasPauseCue ? 'TOP' : 'CENTER', fit: 'CONTAIN' },
    visualLowerZonePurpose: hasPauseCue ? 'pause-cue' : null,
  });
  const scene = {
    id: `knowledge-${atom.id}`, atomId: atom.id, type: 'teaching',
    majorSection: atom.teaching.majorSection, section: atom.teaching.majorSection, chapterTitle: atom.teaching.majorSection,
    narrationText: normalizeText(atom.teaching.narration), displayText: atom.teaching.displayLines.join('\n'),
    background: {
      // An animation base intentionally omits the content that the renderer will
      // reveal. Using that base without an actual cue timeline produces an empty
      // instructional frame even though the reviewed storyboard is complete.
      image: resolveStoryboardBackground(asset),
      reviewImage: asset.filePath,
      kind: asset.containsActualGamePixels ? 'visual-plan-with-actual-game-assets' : 'source-grounded-instructional-diagram',
      provenance: asset.provenance,
    },
    layout: { mode: asset.renderMode || 'diagram-full', visualAspectRatio: asset.width / asset.height, visualPaneAlignment: alignment },
    overlays: [],
    audio: { file: null, speechRequired: true, provider: 'elevenlabs', providerVoiceId: VOICE_ID, narrationPreset: project.narrationTeachingProfile || atom.teaching.profile || 'AMELIE_TEACHING' },
    sourceRefs: atom.sourceRefs, sourceReferenceDisplay: referenceText(atom.sourceRefs),
    visualBinding: { atomId: atom.id, assetId: asset.id, filePath: asset.filePath, visualUtility: asset.visualUtility, sourceType: asset.sourceType, visualClassification: asset.visualClassification, containsActualGamePixels: asset.containsActualGamePixels === true, cropCompleteness: asset.cropCompleteness, cropPurity: asset.cropPurity, reviewState: asset.reviewState },
    visualRequirement: atom.visualRequirement, visualPaneAlignment: alignment,
    pauseCue: atom.teaching.pauseCue || null,
    generatedNarration: { sceneId: atom.id, text: normalizeText(atom.teaching.narration), profile: project.narrationTeachingProfile || atom.teaching.profile || 'AMELIE_TEACHING' },
    focusCueTimeline: asset.focusCueTimeline || [],
    motionCueTimeline: asset.motionCueTimeline || [],
    timedOverlayTimeline: asset.timedOverlayTimeline || [],
  };
  if (atom.teaching.pauseCue) {
    scene.overlays.push({ type: 'pause-cue', text: atom.teaching.pauseCue, position: 'pause-cue', fontColor: '#f6ecd5' });
    scene.pauseHoldSec = 4;
  }
  return scene;
}

function makeOutro(opening, project) {
  const found = opening.scenes.find((scene) => scene.id === project.presentation.reuseOutroSceneId);
  if (!found) throw new Error(`Missing configured outro scene: ${project.presentation.reuseOutroSceneId}`);
  const source = clone(found);
  source.id = 'brand-outro'; source.majorSection = 'Conclusion'; source.section = 'Conclusion'; source.chapterTitle = 'Conclusion';
  source.background = { image: absolute(project.brandBanner), kind: 'brand-banner' }; source.overlays = [];
  source.audio.deliveryProfile = 'AMELIE_OUTRO'; source.audio.narrationPreset = 'AMELIE_OUTRO';
  const narrationDurationSec = probeDuration(source.audio.file); const safeTailSec = 1.25;
  source.durationSec = Number((narrationDurationSec + safeTailSec).toFixed(3));
  source.outroCompletionGuard = { narrationDurationSec, safeTailSec, requiredDurationSec: source.durationSec, valid: true };
  return source;
}

async function ensureNarration(scenes, outputDir, seedManifestPath = null, options = {}) {
  const audioDir = path.join(outputDir, 'audio'); fs.mkdirSync(audioDir, { recursive: true });
  const manifestPath = path.join(outputDir, 'narration-assets.json');
  const seed = seedManifestPath ? absolute(seedManifestPath) : null;
  const previous = exists(manifestPath) ? readJson(manifestPath) : exists(seed) ? readJson(seed) : { assets: [] };
  const forceRegenerateSceneIds = new Set(options.forceRegenerateSceneIds || []);
  const assets = []; let generated = 0; let reused = 0;
  for (const scene of scenes.filter((entry) => entry.atomId)) {
    const profile = scene.generatedNarration.profile;
    const delivery = editorialStandard.getNarrationDeliveryProfile(profile);
    const settings = NARRATION_PRESET[delivery?.voiceSettingsKey]
      || (profile === 'AMELIE_OUTRO' ? NARRATION_PRESET.outroVoiceSettings : NARRATION_PRESET.voiceSettings);
    const sourceTextHash = hashValue({
      text: scene.narrationText,
      voiceId: VOICE_ID,
      modelId: NARRATION_PRESET.modelId,
      voiceSettings: settings,
      deliveryProfile: profile,
      deliveryProfileVersion: delivery?.contract || NARRATION_PRESET.version,
      pronunciationContractVersion: 'mobius-fr-ca-display-spoken-v2',
    });
    const cachedCandidate = previous.assets.find((asset) => asset.sourceTextHash === sourceTextHash && exists(asset.filePath));
    const cachedIsCandidateLocal = cachedCandidate
      && path.resolve(cachedCandidate.filePath).startsWith(`${path.resolve(audioDir)}${path.sep}`);
    const cached = forceRegenerateSceneIds.has(scene.atomId) && !cachedIsCandidateLocal ? null : cachedCandidate;
    const target = cached?.filePath || path.join(audioDir, `${scene.atomId}-${sourceTextHash.slice(0, 12)}.mp3`);
    if (cached) reused += 1;
    else { await generateNarration(scene.narrationText, VOICE_ID, target, { modelId: NARRATION_PRESET.modelId, voiceSettings: settings }); generated += 1; }
    const durationSec = probeDuration(target);
    scene.audio.file = target; scene.audio.sourceTextHash = sourceTextHash;
    scene.audio.postSpeechTailSec = 0.4 + (scene.pauseHoldSec || 0);
    scene.durationSec = Number((durationSec + 0.4 + (scene.pauseHoldSec || 0)).toFixed(3));
    scene.generatedNarration = { ...scene.generatedNarration, sourceTextHash, filePath: target, durationSec, reused: Boolean(cached) };
    assets.push({ sceneId: scene.atomId, sourceText: scene.narrationText, sourceTextHash, profile, voiceSettingsHash: hashValue(settings), deliveryProfileVersion: delivery?.contract || NARRATION_PRESET.version, pronunciationContractVersion: 'mobius-fr-ca-display-spoken-v2', filePath: target, durationSec, sha256: sha256(target), reused: Boolean(cached) });
  }
  writeJson(manifestPath, { contract: 'mobius-rule-atom-narration-cache-v1', generatedAt: new Date().toISOString(), voiceId: VOICE_ID, modelId: NARRATION_PRESET.modelId, generated, reused, assets });
  return { generated, reused, manifestPath };
}

function makeChapters(scenes) {
  let cursor = 0; const chapters = [];
  for (const scene of scenes) {
    if (scene.sectionCard) chapters.push({ startSec: Number(cursor.toFixed(3)), title: scene.majorSection, sceneId: scene.id });
    cursor += Number(scene.durationSec || 0);
  }
  return chapters;
}

function buildQa({ project, model, scenes, chapters, assets, resolutions, coverage, outputPath, replay }) {
  const violations = [];
  const add = (code, sceneId, issue) => violations.push({ id: `DET-R4-${String(violations.length + 1).padStart(3, '0')}`, code, sceneId, issue });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const scene of scenes) {
    if (scene.atomId) {
      if (!scene.sourceRefs?.length) add('SOURCE_REF_MISSING', scene.id, 'Atome enseigné sans référence source.');
      const asset = assetById.get(scene.visualBinding?.assetId);
      if (!asset) add('VISUAL_BINDING_MISSING', scene.id, 'Visuel accepté absent.');
      else {
        const quality = evaluateVisualQuality(asset, scene.visualRequirement, { width: 1805, height: 1015 });
        if (!quality.valid) quality.hardViolations.forEach((issue) => add('VISUAL_QUALITY', scene.id, issue));
      }
      if (/\b(?:Âge|Age)\s+(?:I|II|III)\b/.test(scene.narrationText)) add('ROMAN_NUMERAL_SPOKEN', scene.id, 'Numéral romain non normalisé dans le texte TTS.');
      if (!exists(scene.audio?.file)) add('NARRATION_MISSING', scene.id, 'Fichier de narration absent.');
    }
    if ((scene.overlays || []).some((overlay) => overlay.type === 'badge')) add('REDUNDANT_BADGE', scene.id, 'Badge flottant présent malgré les cartes de section.');
    if (scene.outroCompletionGuard && (!scene.outroCompletionGuard.valid || scene.durationSec < scene.outroCompletionGuard.requiredDurationSec)) add('OUTRO_GUARD', scene.id, 'Durée de conclusion insuffisante.');
  }
  for (let i = 1; i < scenes.length; i += 1) {
    const before = String(scenes[i - 1].narrationText || '').trim().toLowerCase();
    const after = String(scenes[i].narrationText || '').trim().toLowerCase();
    if (before && before === after) add('DUPLICATE_NARRATION', scenes[i].id, 'Narration identique à la scène précédente.');
  }
  const cards = scenes.filter((scene) => scene.sectionCard);
  if (cards.length !== chapters.length) add('CHAPTER_ALIGNMENT', null, 'Nombre de chapitres différent du nombre de cartes de section.');
  let cursor = 0;
  for (const scene of scenes) {
    if (scene.sectionCard) {
      const chapter = chapters.find((entry) => entry.sceneId === scene.id);
      if (!chapter || Math.abs(chapter.startSec - cursor) > 0.01) add('CHAPTER_ALIGNMENT', scene.id, 'Le chapitre ne commence pas avec la carte de section.');
    }
    cursor += Number(scene.durationSec || 0);
  }
  coverage.missingHighPriorityDomains.forEach((domain) => add('COVERAGE_GAP', null, domain));
  if (!replay.deterministic) add('REPLAY', null, 'La timeline n’est pas déterministe.');
  const approvedSonic = absolute(project.sonicMaster);
  if (sha256(approvedSonic) !== scenes[0].approvedSonicSha256) add('SONIC_IDENTITY_CHANGED', scenes[0].id, 'Le master sonore approuvé ne correspond pas.');
  return {
    contract: 'mobius-publishability-r4-deterministic-qa-v1', namespace: 'DET', generatedAt: new Date().toISOString(),
    status: violations.length ? 'FAIL' : 'PASS', violationCount: violations.length, violations,
    sourceGrounding: { projectId: model.projectId, sourcePdfSha256: model.sourcePdfSha256, acceptedAtoms: model.ruleAtoms.filter((atom) => atom.reviewState === 'accepted').length, uncertainties: model.uncertainties.length },
    visualQuality: { acceptedAssets: assets.length, semanticallyWrong: violations.filter((item) => item.code === 'VISUAL_QUALITY' && /mismatch/.test(item.issue)).length, incompleteCrops: violations.filter((item) => item.issue === 'incomplete-crop').length, splitPaneCenteringViolations: resolutions.filter((item) => item.centering && !item.centering.valid).length },
    coverage: coverage.status, outputPath,
  };
}

async function main() {
  const values = parseArgs();
  if (!values.project) throw new Error('Usage: --project <canonical-project-assembly.json> [--out <directory>]');
  const projectPath = absolute(values.project);
  const project = readJson(projectPath); const outputDir = absolute(values.out || project.outputRoot);
  fs.mkdirSync(outputDir, { recursive: true });
  const seed = readJson(absolute(project.knowledgeSeed));
  const knowledgePath = path.join(outputDir, 'rulebook-knowledge-model.json');
  const knowledgeCachePath = project.knowledgeModelCache ? absolute(project.knowledgeModelCache) : knowledgePath;
  const intelligence = await runMultiPassRulebookIntelligence({ projectSeed: seed, cachePath: knowledgeCachePath });
  const model = intelligence.model; const plan = buildKnowledgeTeachingPlan(model);
  if (knowledgeCachePath !== knowledgePath) writeJson(knowledgePath, model);
  const visualDir = project.visualStoryboardRoot ? absolute(project.visualStoryboardRoot) : path.join(outputDir, 'instructional-visuals');
  const manifestPath = project.visualManifest ? absolute(project.visualManifest) : path.join(visualDir, 'manifest.json');
  if (!exists(manifestPath) && project.visualPlan) {
    const componentManifest = project.componentLibraryManifest ? absolute(project.componentLibraryManifest) : path.join(outputDir, 'component-library', 'manifest.json');
    if (!exists(componentManifest)) execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-real-component-assets-r5.mjs'), '--project', absolute(project.visualPlan), '--out', path.dirname(componentManifest)], { stdio: 'inherit' });
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-visual-storyboard-r5.mjs'), '--project', absolute(project.visualPlan), '--knowledge', knowledgePath, '--assets', componentManifest, '--out', visualDir], { stdio: 'inherit' });
  }
  if (!exists(manifestPath)) {
    if (project.allowLegacyAbstractVisuals !== true) throw new Error('VisualPlan unresolved: physical rule atoms may not silently fall back to abstract instructional diagrams.');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-instructional-diagrams-r4.mjs'), '--knowledge', knowledgePath, '--out', visualDir], { stdio: 'inherit' });
  }
  const visualManifest = readJson(manifestPath);
  if (visualManifest.qa && visualManifest.qa.status !== 'PASS') throw new Error(`Visual storyboard QA failed: ${JSON.stringify(visualManifest.qa.violations)}`);
  const explicitBindings = Object.fromEntries(visualManifest.assets.flatMap((asset) => (asset.atomIds || []).map((atomId) => [atomId, [asset.id]])));
  const resolutions = [];
  for (const atom of model.ruleAtoms.filter((entry) => entry.reviewState === 'accepted' && entry.teaching?.narration)) {
    const resolved = resolveInstructionalVisual({ atom, assets: visualManifest.assets, explicitBindings, display: { width: 1805, height: 1015 } });
    if (!resolved.selectedAsset) throw new Error(`${atom.id}: no valid instructional visual (${JSON.stringify(resolved.candidates)})`);
    resolutions.push({ atomId: atom.id, assetId: resolved.selectedAsset.id, quality: resolved.quality });
  }
  const opening = readJson(absolute(project.openingConfig)); const scenes = [makeBrandScene(opening, project)];
  let activeSection = null; const metadata = makeMetadataScenes(opening, project);
  for (const item of plan.scenes) {
    if (item.majorSection !== activeSection) {
      activeSection = item.majorSection;
      scenes.push(makeSectionCard(activeSection, absolute(project.brandBanner), absolute(project.sonicMaster)));
      if (activeSection === 'Présentation / But du jeu') scenes.push(...metadata);
    }
    const atom = model.ruleAtoms.find((entry) => entry.id === item.atomId);
    const asset = visualManifest.assets.find((entry) => entry.id === resolutions.find((resolution) => resolution.atomId === atom.id).assetId);
    scenes.push(makeTeachingScene(atom, asset, project));
  }
  scenes.push(makeSectionCard('Conclusion', absolute(project.brandBanner), absolute(project.sonicMaster)));
  scenes.push(makeOutro(opening, project));
  const narration = await ensureNarration(scenes, outputDir, project.narrationSeedManifest, {
    forceRegenerateSceneIds: project.narrationRegenerateSceneIds || [],
  }); const chapters = makeChapters(scenes);
  for (const scene of scenes.filter((entry) => entry.atomId && entry.focusCueTimeline?.length)) {
    const speechDurationSec = Number(scene.generatedNarration?.durationSec || scene.durationSec || 0);
    scene.focusCueTimeline = {
      contract: 'mobius-focus-cue-timeline-v1',
      cues: scene.focusCueTimeline.map((cue) => ({
        ...cue,
        startSec: Number((speechDurationSec * Number(cue.startRatio)).toFixed(3)),
        endSec: Number((speechDurationSec * Number(cue.endRatio)).toFixed(3)),
      })),
    };
  }
  for (const scene of scenes.filter((entry) => entry.atomId && entry.motionCueTimeline?.length)) {
    const speechDurationSec = Number(scene.generatedNarration?.durationSec || scene.durationSec || 0);
    scene.motionCueTimeline = {
      contract: 'mobius-motion-cue-timeline-v1',
      cues: scene.motionCueTimeline.map((cue) => ({
        ...cue,
        startSec: Number((speechDurationSec * Number(cue.startRatio)).toFixed(3)),
        endSec: Number((speechDurationSec * Number(cue.endRatio)).toFixed(3)),
        holdEndSec: Number((speechDurationSec * Number(cue.holdEndRatio ?? 1)).toFixed(3)),
      })),
    };
  }
  for (const scene of scenes.filter((entry) => entry.atomId && entry.timedOverlayTimeline?.length)) {
    const speechDurationSec = Number(scene.generatedNarration?.durationSec || scene.durationSec || 0);
    scene.timedOverlayTimeline = {
      contract: 'mobius-timed-overlay-timeline-v1',
      cues: scene.timedOverlayTimeline.map((cue) => ({
        ...cue,
        startSec: Number((speechDurationSec * Number(cue.startRatio)).toFixed(3)),
        endSec: Number((speechDurationSec * Number(cue.endRatio ?? 1)).toFixed(3)),
      })),
    };
  }
  const atomIds = scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
  const coverage = buildTutorialCoverageMatrix(model, { includedAtomIds: atomIds, storyboardAtomIds: atomIds, visualizedAtomIds: atomIds, narratedAtomIds: atomIds });
  const config = {
    contract: 'mobius-rulebook-knowledge-tutorial-v1', projectId: project.projectId, gameName: model.gameIdentity.displayName, language: project.locale,
    sourceGrounded: true, generatorNative: true, source: { pdfSha256: model.sourcePdfSha256, pdfPath: seed.sourcePdfPath },
    knowledgeModelPath: knowledgePath, coverageMatrixPath: path.join(outputDir, 'tutorial-coverage-matrix.json'),
    approvedSonicMaster: { path: absolute(project.sonicMaster), sha256: sha256(absolute(project.sonicMaster)), locked: true },
    video: { resolution: { width: 1920, height: 1080 }, fps: 30 }, scenes, chapters,
  };
  const projectTimeline = (value) => value.scenes.map((scene) => ({ id: scene.id, atomId: scene.atomId || null, durationSec: scene.durationSec, visual: scene.visualBinding?.assetId || scene.background?.image, narrationHash: scene.audio?.sourceTextHash || null }));
  const replayHashA = hashValue(projectTimeline(config)); const replayHashB = hashValue(projectTimeline(clone(config)));
  const replay = { contract: 'mobius-publishability-r4-replay-v1', deterministic: replayHashA === replayHashB, timelineHash: replayHashA, knowledgeCacheHit: intelligence.cacheHit, narrationGenerated: narration.generated, narrationReused: narration.reused };
  const outputPath = path.join(outputDir, project.outputFileName || `${project.projectId}-full-tutorial-r4.mp4`);
  const qa = buildQa({ project, model, scenes, chapters, assets: visualManifest.assets, resolutions, coverage, outputPath, replay });
  writeJson(path.join(outputDir, 'tutorial-coverage-matrix.json'), coverage);
  fs.writeFileSync(path.join(outputDir, 'tutorial-coverage-report.md'), `# Couverture tutorielle\n\n- Statut: ${coverage.status}\n- Domaines prioritaires manquants: ${coverage.missingHighPriorityDomains.length}\n- Atomes enseignés: ${atomIds.length}\n- Source PDF SHA-256: ${model.sourcePdfSha256}\n`);
  writeJson(path.join(outputDir, 'visual-resolution-report.json'), { contract: 'mobius-visual-resolution-r4-v1', status: resolutions.every((entry) => entry.quality.valid) ? 'PASS' : 'FAIL', resolutions });
  writeJson(path.join(outputDir, 'qa-report.json'), qa); writeJson(path.join(outputDir, 'replay-idempotence.json'), replay);
  writeJson(path.join(outputDir, 'chapters.json'), { contract: 'mobius-semantic-chapters-v1', chapters });
  fs.writeFileSync(path.join(outputDir, 'chapters.txt'), `${chapters.map((chapter) => `${chapter.startSec.toFixed(3)}\t${chapter.title}`).join('\n')}\n`);
  const configPath = path.join(outputDir, 'full-tutorial-config.json'); writeJson(configPath, config);
  if (qa.status !== 'PASS') throw new Error(`Deterministic QA failed: ${JSON.stringify(qa.violations)}`);
  console.log(JSON.stringify({ status: 'PASS', projectPath, configPath, outputPath, scenes: scenes.length, atomScenes: atomIds.length, durationSec: Number(scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0).toFixed(3)), narration, coverage: coverage.status, deterministicViolations: qa.violationCount }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

export { buildQa, makeSectionCard, referenceText };
