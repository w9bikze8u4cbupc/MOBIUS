const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const legacyContract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/spec/storyboard_contract.json'), 'utf-8'));

const NARRATION_RATES_WPM = Object.freeze({
  english: 145,
  french: 135,
});
const STORYBOARD_TRANSITION_ALLOWANCE_MS = 400;
const STORYBOARD_DURATION_QUANTUM_MS = 100;
const STANDARD_TUTORIAL_DURATION_MS = Object.freeze({ min: 5 * 60 * 1000, max: 10 * 60 * 1000 });

function roundDuration(value, quantum = legacyContract.timing.frameQuantumMs) {
  return Math.round(value / quantum) * quantum;
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildMotionPrimitive(index) {
  const motionType = legacyContract.motions.allowed[index % legacyContract.motions.allowed.length];
  return {
    type: motionType,
    durationMs: roundDuration(legacyContract.timing.defaultMotionDurationMs),
    easing: legacyContract.motions.defaults.easing,
  };
}

function countWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function normalizeLanguage(value) {
  return String(value || '').trim().toLowerCase() === 'french' ? 'french' : 'english';
}

function cloneVisualDirections(value) {
  return Array.isArray(value) ? value
    .filter((direction) => direction && typeof direction === 'object' && !Array.isArray(direction))
    .map((direction) => ({
      instruction: String(direction.instruction || '').trim(),
      onScreenText: String(direction.onScreenText || '').trim(),
      camera: String(direction.camera || '').trim(),
      highlights: Array.isArray(direction.highlights) ? direction.highlights.map(String).filter(Boolean) : [],
      arrows: Array.isArray(direction.arrows) ? direction.arrows.map(String).filter(Boolean) : [],
      componentRefs: Array.isArray(direction.componentRefs) ? direction.componentRefs.map(String).filter(Boolean) : [],
    })) : [];
}

function cloneSources(value) {
  return Array.isArray(value) ? value
    .filter((source) => source && typeof source === 'object' && Number.isInteger(source.section)
      && Number.isInteger(source.startOffset) && Number.isInteger(source.endOffset))
    .map((source) => ({
      section: source.section,
      startOffset: source.startOffset,
      endOffset: source.endOffset,
      uncertainty: source.uncertainty ?? null,
    })) : [];
}

function isCanonicalScriptPackage(value) {
  return Boolean(value && typeof value === 'object' && value.legacy !== true
    && Array.isArray(value.sections) && value.sections.length > 0
    && value.sections.every((section) => (
      typeof section?.id === 'string' && section.id.trim()
      && Number.isInteger(section?.order) && section.order > 0
      && typeof section?.title === 'string' && section.title.trim()
      && typeof section?.spokenText === 'string' && section.spokenText.trim()
      && Array.isArray(section?.visualDirections)
      && Array.isArray(section?.sources) && section.sources.length > 0
    )));
}

function sentenceChunks(spokenText, maxWords = 72) {
  const paragraphs = String(spokenText || '').split(/\n\s*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const units = paragraphs.flatMap((paragraph) => paragraph.match(/[^.!?]+(?:[.!?]+|$)/g) || [paragraph]);
  const chunks = [];
  let current = [];
  let currentWords = 0;
  for (const unit of units) {
    const text = unit.trim();
    if (!text) continue;
    const words = countWords(text);
    if (current.length && currentWords + words > maxWords) {
      chunks.push(current.join(' ').trim());
      current = [];
      currentWords = 0;
    }
    current.push(text);
    currentWords += words;
  }
  if (current.length) chunks.push(current.join(' ').trim());
  return chunks.length ? chunks : [String(spokenText || '').trim()];
}

function transitionFor({ sectionId, chunkIndex, visualDirections }) {
  if (chunkIndex === 0 && sectionId === 'section-01') return 'fade-in';
  if (visualDirections.some((direction) => direction.highlights.length || direction.arrows.length)) return 'highlight-pulse';
  if (visualDirections.some((direction) => direction.componentRefs.length)) return 'zoom-on-component';
  return parseInt(hash(`${sectionId}:${chunkIndex}`).slice(0, 2), 16) % 2 === 0 ? 'slide-left' : 'slide-right';
}

function estimateSceneDurationMs(wordCount, language = 'english') {
  const rate = NARRATION_RATES_WPM[normalizeLanguage(language)];
  const narratedMs = (Math.max(0, Number(wordCount) || 0) / rate) * 60_000;
  return Math.max(STORYBOARD_DURATION_QUANTUM_MS, roundDuration(narratedMs + STORYBOARD_TRANSITION_ALLOWANCE_MS, STORYBOARD_DURATION_QUANTUM_MS));
}

function createCanonicalScene(section, chunk, index, language) {
  const visualDirections = cloneVisualDirections(section.visualDirections);
  const sources = cloneSources(section.sources);
  const componentRefs = [...new Set(visualDirections.flatMap((direction) => direction.componentRefs))];
  const wordCount = countWords(chunk);
  const estimatedDurationMs = estimateSceneDurationMs(wordCount, language);
  const hasVisualInstruction = visualDirections.some((direction) => direction.instruction || direction.onScreenText || direction.highlights.length || direction.arrows.length);
  const overlay = {
    onScreenText: visualDirections.map((direction) => direction.onScreenText).filter(Boolean),
    highlights: visualDirections.flatMap((direction) => direction.highlights),
    arrows: visualDirections.flatMap((direction) => direction.arrows),
  };
  return {
    id: `scene-${section.id}-${index + 1}`,
    index,
    order: index + 1,
    sectionId: section.id,
    sourceId: section.id,
    title: section.title,
    spokenText: chunk,
    wordCount,
    estimatedDurationMs,
    durationMs: estimatedDurationMs,
    durationSec: estimatedDurationMs / 1000,
    transition: transitionFor({ sectionId: section.id, chunkIndex: index, visualDirections }),
    visualDirections,
    sources,
    componentRefs,
    visualPlan: {
      componentRefs,
      componentRefMatches: [],
      primaryIntent: 'operator_defined',
      primaryComponentRefs: [],
      supportingComponentRefs: [],
      coverageStatus: 'unresolved',
      coverageReason: 'No primary visual evidence has been selected.',
      coverageEvidence: [],
      assetAssignments: [],
      assetReuse: [],
      sourceReferences: sources.map(({ section, startOffset, endOffset }) => ({ section, startOffset, endOffset })),
      assetCandidates: [],
      selectedAssetIds: [],
      selectionMethod: 'unresolved',
      reviewState: 'needs_visual_review',
      reviewReason: hasVisualInstruction
        ? 'No approved project asset has been bound to this scene yet.'
        : 'No visual plan has been selected for this instructional scene yet.',
      requiresExplicitVisual: true,
      overviewExceptionAllowed: false,
      overviewSelectionConfirmed: false,
      manualSelectionReviewed: false,
    },
    imageAssetIds: [],
    visualReviewState: 'needs_visual_review',
    overlay,
    status: 'draft',
    reviewNotes: '',
    assets: [{ sourceId: section.id, hash: hash(section.id), type: 'script-section' }],
  };
}

function createScriptPackageStoryboard(ingestionManifest, scriptPackage, options = {}) {
  if (!ingestionManifest || !ingestionManifest.document?.id) throw new Error('STORYBOARD_INVALID_INGESTION');
  if (!isCanonicalScriptPackage(scriptPackage)) throw new Error('STORYBOARD_INVALID_SCRIPT_PACKAGE');
  const language = normalizeLanguage(options.language);
  const orderedSections = [...scriptPackage.sections].sort((a, b) => a.order - b.order);
  const scenes = orderedSections.flatMap((section) => sentenceChunks(section.spokenText).map((chunk) => ({ section, chunk })))
    .map(({ section, chunk }, index) => createCanonicalScene(section, chunk, index, language));
  let startMs = 0;
  scenes.forEach((scene, index) => {
    scene.prevSceneId = index === 0 ? null : scenes[index - 1].id;
    scene.nextSceneId = index === scenes.length - 1 ? null : scenes[index + 1].id;
    scene.timing = { startMs, endMs: startMs + scene.estimatedDurationMs };
    startMs = scene.timing.endMs;
  });
  const durationWarning = startMs < STANDARD_TUTORIAL_DURATION_MS.min || startMs > STANDARD_TUTORIAL_DURATION_MS.max
    ? 'Narration-derived duration is outside the standard 5–10 minute profile; review script pacing before confirmation.'
    : null;
  return {
    version: '1.2.0',
    storyboardContractVersion: '1.2.0',
    sourceDocument: ingestionManifest.document.id,
    language,
    narrationRateWpm: NARRATION_RATES_WPM[language],
    transitionAllowanceMs: STORYBOARD_TRANSITION_ALLOWANCE_MS,
    totalEstimatedDurationMs: startMs,
    durationWarning,
    scenes,
    hashManifest: { storyboard: hash(JSON.stringify(scenes)) },
  };
}

// Legacy fallback for callers without a source-complete script package.
function generateLegacyStoryboard(ingestionManifest, options = {}) {
  if (!ingestionManifest || !Array.isArray(ingestionManifest.outline)) throw new Error('STORYBOARD_INVALID_INGESTION');
  const scenes = ingestionManifest.outline.map((entry, index) => {
    const durationMs = roundDuration(options.sceneDurationMs ?? legacyContract.timing.defaultSceneDurationMs);
    const durationSec = durationMs / 1000;
    const overlays = options.includeOverlayHashes ? [{
      id: `overlay-${entry.slug}`,
      textHash: hash(entry.title.toLowerCase()),
      placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      zIndex: 1,
      startSec: 0,
      endSec: durationSec,
    }] : [];
    return {
      id: `${legacyContract.scenes.idPrefix}${index + 1}`,
      sourceId: entry.id,
      durationMs,
      durationSec,
      index,
      prevSceneId: index === 0 ? null : `${legacyContract.scenes.idPrefix}${index}`,
      nextSceneId: index === ingestionManifest.outline.length - 1 ? null : `${legacyContract.scenes.idPrefix}${index + 2}`,
      motion: buildMotionPrimitive(index),
      overlays,
      assets: [{ sourceId: entry.id, hash: hash(entry.title), type: 'text' }],
    };
  });
  return { version: legacyContract.version, sourceDocument: ingestionManifest.document.id, scenes, hashManifest: { storyboard: hash(JSON.stringify(scenes)) } };
}

function generateStoryboard(ingestionManifest, options = {}) {
  return options.scriptPackage
    ? createScriptPackageStoryboard(ingestionManifest, options.scriptPackage, options)
    : generateLegacyStoryboard(ingestionManifest, options);
}

function writeStoryboard(manifest, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
}

module.exports = {
  NARRATION_RATES_WPM,
  STANDARD_TUTORIAL_DURATION_MS,
  STORYBOARD_DURATION_QUANTUM_MS,
  STORYBOARD_TRANSITION_ALLOWANCE_MS,
  createScriptPackageStoryboard,
  estimateSceneDurationMs,
  generateStoryboard,
  writeStoryboard,
};
