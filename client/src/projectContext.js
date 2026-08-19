import { contextualEvidenceAssignmentIsAllowed, validateStoryboardVisualPlans } from './storyboardVisualPlan';

export const PROJECT_CONTEXT_VERSION = 7;
export const PROJECT_SOURCE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  PENDING_CONTEXTUAL_RENDER: 'pending_contextual_render',
  MISSING: 'missing',
  TAMPERED: 'tampered',
  LEGACY_ADOPTION_REQUIRED: 'legacy_adoption_required',
});
export const SCRIPT_PROVENANCE = Object.freeze({
  MANUAL: 'manual',
  GENERATED_SOURCE_COMPLETE: 'generated_source_complete',
  LEGACY_INVALID_FALLBACK: 'legacy_invalid_fallback',
  GENERATION_FAILED: 'generation_failed',
});

export const INGESTION_MANIFEST_FAILURE = Object.freeze({
  MISSING: 'INGESTION_MANIFEST_MISSING',
  PROJECT_MISMATCH: 'INGESTION_MANIFEST_PROJECT_MISMATCH',
  INVALID: 'INGESTION_MANIFEST_INVALID',
});

const PROJECT_CONTEXT_PREFIX = 'mobius-project-context:';
const LATEST_PROJECT_CONTEXT_KEY = 'mobius-project-context:latest';
const SUPPORTED_SCRIPT_LANGUAGES = new Set(['english', 'french']);
const TRUSTED_SCRIPT_PROVENANCE = new Set([
  SCRIPT_PROVENANCE.MANUAL,
  SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE,
]);
const KNOWN_SCRIPT_PROVENANCE = new Set(Object.values(SCRIPT_PROVENANCE));
const CANONICAL_RECOVERY_PROJECT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export const IMAGE_REVIEW_STATUS = Object.freeze({
  PENDING_VISUAL_STORYBOARD_REVIEW: 'pending_visual_storyboard_review',
});

function isCuratedImageCandidate(image) {
  const curation = image?.curation || image?.metadata?.curation || {};
  return image && curation.candidate !== false && !curation.isDuplicate && !curation.lowInformation;
}

function isApprovedImageReviewLink(detail) {
  if (!detail || typeof detail !== 'object') return true; // Preserve legacy approved links.
  if (detail.origin === 'manual' || detail.origin === 'legacy') return true;
  return detail.origin === 'auto' && Number(detail.confidence) >= 0.9;
}

export function summarizeImageReview({ images = [], componentImageLinks = {}, componentImageLinkDetails = {}, components = [] } = {}) {
  const inventory = Array.isArray(images) ? images.filter((image) => image?.id) : [];
  const approvedComponentIds = new Set();
  let approvedLinkCount = 0;
  Object.entries(componentImageLinks && typeof componentImageLinks === 'object' ? componentImageLinks : {}).forEach(([componentId, assetIds]) => {
    [...new Set(Array.isArray(assetIds) ? assetIds.filter((assetId) => typeof assetId === 'string' && assetId) : [])].forEach((assetId) => {
      if (!isApprovedImageReviewLink(componentImageLinkDetails?.[componentId]?.[assetId])) return;
      approvedLinkCount += 1;
      approvedComponentIds.add(componentId);
    });
  });
  const componentIds = (Array.isArray(components) ? components : [])
    .map((component) => asTrimmedString(component?.id) || asTrimmedString(component?.name))
    .filter(Boolean);
  return {
    inventoryAssetCount: inventory.length,
    curatedCandidateCount: inventory.filter(isCuratedImageCandidate).length,
    approvedLinkCount,
    unresolvedComponentCount: componentIds.filter((componentId) => !approvedComponentIds.has(componentId)).length,
  };
}

export function createImageReviewStatus(context = {}, reviewedAt = new Date().toISOString()) {
  return {
    status: IMAGE_REVIEW_STATUS.PENDING_VISUAL_STORYBOARD_REVIEW,
    ...summarizeImageReview(context),
    reviewedAt: asTrimmedString(reviewedAt),
  };
}

function normalizeImageReviewStatus(value) {
  if (!value || value.status !== IMAGE_REVIEW_STATUS.PENDING_VISUAL_STORYBOARD_REVIEW) return null;
  const fields = ['inventoryAssetCount', 'curatedCandidateCount', 'approvedLinkCount', 'unresolvedComponentCount'];
  if (!fields.every((field) => Number.isInteger(value[field]) && value[field] >= 0)) return null;
  return {
    status: IMAGE_REVIEW_STATUS.PENDING_VISUAL_STORYBOARD_REVIEW,
    inventoryAssetCount: value.inventoryAssetCount,
    curatedCandidateCount: value.curatedCandidateCount,
    approvedLinkCount: value.approvedLinkCount,
    unresolvedComponentCount: value.unresolvedComponentCount,
    reviewedAt: asTrimmedString(value.reviewedAt),
  };
}

export function isCanonicalRecoveryProjectId(value) {
  const projectId = asTrimmedString(value);
  return projectId.length <= 128 && CANONICAL_RECOVERY_PROJECT_ID.test(projectId);
}

export function normalizeProjectSourceRecord(value, projectId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const expectedProjectId = asTrimmedString(projectId);
  const sourceId = asTrimmedString(value.sourceId);
  const documentId = asTrimmedString(value.documentId);
  const documentFingerprint = asTrimmedString(value.documentFingerprint);
  const filename = asTrimmedString(value.filename);
  const sha256 = asTrimmedString(value.sha256);
  const status = asTrimmedString(value.status) || PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER;
  const filenameHasUnsafeCharacters = Array.from(filename).some((character) => character.charCodeAt(0) < 32 || character === '\\' || character === '/');
  if (!isCanonicalRecoveryProjectId(expectedProjectId) || documentId !== expectedProjectId
    || !/^source-[a-f0-9]{32}$/.test(sourceId) || !/^document-[a-f0-9]{32}$/.test(documentFingerprint)
    || !/^[a-f0-9]{64}$/.test(sha256) || !filename || filename.length > 200 || filenameHasUnsafeCharacters
    || !Number.isInteger(value.bytes) || value.bytes < 1 || !Number.isInteger(value.pageCount) || value.pageCount < 1
    || value.provenance !== 'direct_project_upload'
    || !Object.values(PROJECT_SOURCE_STATUS).includes(status)) return null;
  return {
    sourceId, documentId, documentFingerprint, filename, sha256,
    bytes: value.bytes, pageCount: value.pageCount, provenance: value.provenance, status,
  };
}

export function isTrustedScriptProvenance(provenance) {
  return TRUSTED_SCRIPT_PROVENANCE.has(provenance);
}

export function isKnownLegacyInvalidFallback(script) {
  const text = asTrimmedString(script);
  return /\bRulebook Text section is empty\b/i.test(text)
    || /\bI can(?:['’])t produce a complete,\s*rules-accurate tutorial\b/i.test(text);
}

export function createLegacyScriptPackage(script, title = 'Tutorial') {
  const spokenText = String(script || '').trim();
  return spokenText ? {
    contractVersion: '1.0',
    legacy: true,
    sections: [{
      id: 'section-01', order: 1, title, spokenText, visualDirections: [], sources: [],
    }],
  } : null;
}

export function isScriptPackage(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.sections)
    && value.sections.length > 0 && value.sections.every((section) => (
      typeof section?.title === 'string' && typeof section?.spokenText === 'string'
        && Array.isArray(section?.visualDirections) && Array.isArray(section?.sources)
    )));
}

export function isSourceCompleteScriptPackage(value) {
  return isScriptPackage(value) && value.legacy !== true
    && value.sections.every((section) => section.sources.length > 0);
}

export function scriptPackageToEditableNarration(scriptPackage, fallback = '') {
  if (!isScriptPackage(scriptPackage)) return String(fallback || '');
  return scriptPackage.sections.map((section) => `## ${section.title}\n\n${section.spokenText}`).join('\n\n').trim();
}

export function getSpokenSections(scriptPackage, fallback = '') {
  if (isScriptPackage(scriptPackage)) {
    return scriptPackage.sections.map((section) => ({ title: section.title, spokenText: section.spokenText }));
  }
  const spokenText = String(fallback || '').trim();
  return spokenText ? [{ title: 'Tutorial', spokenText }] : [];
}

function splitEditedNarration(value) {
  const text = String(value || '').trim();
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)];
  if (!headings.length) return [{ title: '', spokenText: text }];
  const leadingText = text.slice(0, headings[0].index).trim();
  const sections = leadingText ? [{ title: '', spokenText: leadingText }] : [];
  return [
    ...sections,
    ...headings.map((heading, index) => ({
      title: heading[1].trim(),
      spokenText: text.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim(),
    })),
  ];
}

// Operator edits intentionally replace only narration; generated visual directions
// and source references remain attached to their stable section order.
export function applyEditedNarration(scriptPackage, editedSummary) {
  const existing = isScriptPackage(scriptPackage) ? scriptPackage : createLegacyScriptPackage(editedSummary);
  if (!existing) return null;
  const editedSections = splitEditedNarration(editedSummary);
  const retainsStableSectionLayout = editedSections.length === existing.sections.length
    && editedSections.every((edited, index) => !edited.title || edited.title === existing.sections[index].title);
  if (!retainsStableSectionLayout) {
    // A structural edit has no reliable provenance binding. Preserve it as an
    // editable manual package instead of attaching another section's evidence
    // or visual direction to the new narration.
    return {
      contractVersion: existing.contractVersion || '1.0',
      legacy: true,
      sections: editedSections.filter((section) => section.spokenText).map((section, index) => ({
        id: `section-${String(index + 1).padStart(2, '0')}`,
        order: index + 1,
        title: section.title || `Section ${index + 1}`,
        spokenText: section.spokenText,
        visualDirections: [],
        sources: [],
      })),
    };
  }
  return {
    ...existing,
    legacy: false,
    sections: existing.sections.map((section, index) => {
      const edited = editedSections[index] || (index === 0 ? editedSections[0] : null);
      return edited ? { ...section, title: edited.title || section.title, spokenText: edited.spokenText } : section;
    }).filter((section) => section.spokenText),
  };
}

function normalizeScriptState(context) {
  let script = typeof context.script === 'string' ? context.script : '';
  const suppliedProvenance = KNOWN_SCRIPT_PROVENANCE.has(context.scriptProvenance)
    ? context.scriptProvenance : null;
  let scriptProvenance = suppliedProvenance;
  if (!scriptProvenance) {
    if (script && isKnownLegacyInvalidFallback(script)) scriptProvenance = SCRIPT_PROVENANCE.LEGACY_INVALID_FALLBACK;
    else if (asTrimmedString(script)) scriptProvenance = context.generatedScript === true
      ? SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE : SCRIPT_PROVENANCE.MANUAL;
  }
  if (scriptProvenance === SCRIPT_PROVENANCE.LEGACY_INVALID_FALLBACK || scriptProvenance === SCRIPT_PROVENANCE.GENERATION_FAILED) script = '';
  const scriptPackage = isScriptPackage(context.scriptPackage)
    ? context.scriptPackage
    : createLegacyScriptPackage(script);
  // Pre-package generated text remains editable, but cannot claim source-complete
  // provenance without per-section offsets under the canonical contract.
  if (scriptProvenance === SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE
    && !isSourceCompleteScriptPackage(scriptPackage)) {
    scriptProvenance = asTrimmedString(script) ? SCRIPT_PROVENANCE.MANUAL : null;
  }
  if (!asTrimmedString(script) && isTrustedScriptProvenance(scriptProvenance)) scriptProvenance = null;
  return {
    script,
    scriptPackage,
    scriptProvenance,
    generatedScript: scriptProvenance === SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE,
  };
}

export function isUsableComponentName(value) {
  const name = String(value || '').trim();
  if (!name || /^(unknown|unknown component|component|components|item|items|n\/a|none|null)$/i.test(name)) return false;
  if (name.split(/\s+/).length > 12 || /[.!?]/.test(name)) return false;
  return true;
}

export function hasValidatedComponents(components) {
  return Array.isArray(components) && components.some((component) => isUsableComponentName(component?.name));
}

export function getScriptInputReadiness({ projectId, gameName, rulebookText, components, language }) {
  if (!asTrimmedString(projectId)) return { ready: false, message: 'Cannot generate: this project has no ID. Return to Project Setup and confirm the project.' };
  if (!asTrimmedString(rulebookText)) return { ready: false, message: 'Cannot generate: this project has no persisted rulebook text. Return to Project Setup and re-import the PDF.' };
  if (!asTrimmedString(gameName)) return { ready: false, message: 'Cannot generate: this project has no game name. Return to Project Setup and enter a game name.' };
  if (!hasValidatedComponents(components)) return { ready: false, message: 'Cannot generate: this project has no validated component inventory. Return to Ingestion Review and confirm at least one named component.' };
  const selectedLanguage = asTrimmedString(language).toLowerCase();
  if (!selectedLanguage) return { ready: false, message: 'Cannot generate: this project has no selected language. Return to Project Setup and select a language.' };
  if (!SUPPORTED_SCRIPT_LANGUAGES.has(selectedLanguage)) return { ready: false, message: 'Cannot generate: this project has an unsupported language. Return to Project Setup and select English or French.' };
  return { ready: true, message: '' };
}

export function buildScriptGenerationRequest(context) {
  const readiness = getScriptInputReadiness(context);
  if (!readiness.ready) return { request: null, readiness };
  return { readiness, request: {
    projectId: asTrimmedString(context.projectId), gameName: asTrimmedString(context.gameName),
    language: asTrimmedString(context.language).toLowerCase(), rulebookText: context.rulebookText.trim(),
    components: context.components, metadata: context.metadata && typeof context.metadata === 'object' ? context.metadata : {},
  } };
}

export function buildDeterministicIngestionPages(text) {
  const paragraphs = String(text || '')
    .split(/\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const pages = [];
  for (let index = 0; index < paragraphs.length; index += 6) {
    pages.push({
      number: pages.length + 1,
      blocks: paragraphs.slice(index, index + 6).map((paragraph, blockIndex) => ({
        text: paragraph,
        fontSize: blockIndex === 0 ? 24 : 14,
        x: 50,
        y: 40 + blockIndex * 30,
        width: 500,
        height: 20,
      })),
    });
  }
  return pages;
}

export function getIngestionDocumentId({ projectId, gameName } = {}) {
  return (asTrimmedString(projectId) || asTrimmedString(gameName) || 'rulebook')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'rulebook';
}

async function sha256Hex(value) {
  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : null;
  if (!subtle || typeof TextEncoder === 'undefined') return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRuntimeIngestionManifest(manifest) {
  return Boolean(manifest && typeof manifest === 'object'
    && typeof manifest.version === 'string'
    && manifest.document && typeof manifest.document === 'object'
    && ['id', 'title', 'gameId', 'source'].every((field) => asTrimmedString(manifest.document[field]))
    && Array.isArray(manifest.outline) && manifest.outline.length > 0
    && Array.isArray(manifest.components) && manifest.components.length === manifest.outline.length
    && manifest.assets && Array.isArray(manifest.assets.pages) && manifest.assets.pages.length > 0
    && Array.isArray(manifest.assets.components));
}

export async function validateMatchingIngestionManifest(manifest, context = {}) {
  if (!manifest) return { valid: false, code: INGESTION_MANIFEST_FAILURE.MISSING };
  if (!isRuntimeIngestionManifest(manifest)) return { valid: false, code: INGESTION_MANIFEST_FAILURE.INVALID };
  const documentId = getIngestionDocumentId(context);
  if (manifest.document.id !== documentId || manifest.document.gameId !== documentId) {
    return { valid: false, code: INGESTION_MANIFEST_FAILURE.PROJECT_MISMATCH };
  }
  const pages = buildDeterministicIngestionPages(context.rulebookText);
  if (!pages.length || pages.length !== manifest.assets.pages.length) {
    return { valid: false, code: INGESTION_MANIFEST_FAILURE.INVALID };
  }
  const expectedHashes = await Promise.all(pages.map((page) => sha256Hex(
    `${page.number}:${page.blocks.map((block) => String(block.text).normalize('NFKC').replace(/\s+/g, ' ').trim()).join('\n')}`,
  )));
  if (expectedHashes.some((hash) => !hash)
    || manifest.assets.pages.some((page, index) => page?.page !== pages[index].number || page?.hash !== expectedHashes[index])) {
    return { valid: false, code: INGESTION_MANIFEST_FAILURE.INVALID };
  }
  return { valid: true, code: null, manifest };
}

export async function resolveMatchingIngestionManifest({
  manifest, storage, context, recover, onRecoveryDiagnostic,
} = {}) {
  const projectId = asTrimmedString(context?.projectId);
  const projectIdValid = isCanonicalRecoveryProjectId(projectId);
  const report = (details) => {
    if (typeof onRecoveryDiagnostic === 'function') onRecoveryDiagnostic({
      projectIdPresent: Boolean(projectId), projectIdValid, ...details,
    });
  };
  const persistedManifest = !manifest && projectId
    ? loadProjectContext(storage, projectId)?.ingestionManifest
    : null;
  const candidate = manifest || persistedManifest || null;
  if (candidate) {
    const validation = await validateMatchingIngestionManifest(candidate, context);
    report({ recoveryAttempted: false, httpRouteReached: false, finalCode: validation.code });
    return { ...validation, manifest: validation.valid ? candidate : null };
  }
  if (!projectIdValid || typeof recover !== 'function') {
    const code = projectIdValid
      ? INGESTION_MANIFEST_FAILURE.MISSING
      : INGESTION_MANIFEST_FAILURE.INVALID;
    report({ recoveryAttempted: false, httpRouteReached: false, finalCode: code });
    return { valid: false, code, manifest: null };
  }

  let recovery;
  try {
    recovery = await recover(projectId);
  } catch {
    report({ recoveryAttempted: true, httpRouteReached: false, responseStatus: null, finalCode: INGESTION_MANIFEST_FAILURE.INVALID });
    return { valid: false, code: INGESTION_MANIFEST_FAILURE.INVALID, manifest: null };
  }
  if (!recovery?.manifest) {
    const code = Object.values(INGESTION_MANIFEST_FAILURE).includes(recovery?.code)
      ? recovery.code
      : INGESTION_MANIFEST_FAILURE.INVALID;
    report({
      recoveryAttempted: true,
      httpRouteReached: recovery?.httpRouteReached === true,
      responseStatus: Number.isInteger(recovery?.responseStatus) ? recovery.responseStatus : null,
      diagnosticId: typeof recovery?.diagnosticId === 'string' ? recovery.diagnosticId : null,
      finalCode: code,
    });
    return { valid: false, code, manifest: null };
  }
  const validation = await validateMatchingIngestionManifest(recovery.manifest, context);
  report({
    recoveryAttempted: true,
    httpRouteReached: recovery?.httpRouteReached === true,
    responseStatus: Number.isInteger(recovery?.responseStatus) ? recovery.responseStatus : null,
    diagnosticId: typeof recovery?.diagnosticId === 'string' ? recovery.diagnosticId : null,
    finalCode: validation.code,
  });
  return { ...validation, manifest: validation.valid ? recovery.manifest : null };
}

export function createPersistedProjectContext(context) {
  const scriptState = normalizeScriptState(context);
  const completedStepIds = Array.isArray(context.completedStepIds) ? [...new Set(context.completedStepIds.filter((stepId) => typeof stepId === 'string'))] : [];
  const canConfirmScript = Boolean(asTrimmedString(scriptState.script)) && isTrustedScriptProvenance(scriptState.scriptProvenance);
  return {
    version: PROJECT_CONTEXT_VERSION, projectId: asTrimmedString(context.projectId), gameName: asTrimmedString(context.gameName),
    language: asTrimmedString(context.language).toLowerCase(), rulebookText: typeof context.rulebookText === 'string' ? context.rulebookText : '',
    rulebookPages: Array.isArray(context.rulebookPages) ? context.rulebookPages : [], components: Array.isArray(context.components) ? context.components : [],
    sourcePdf: normalizeProjectSourceRecord(context.sourcePdf, context.projectId),
    metadata: context.metadata && typeof context.metadata === 'object' ? context.metadata : {}, images: Array.isArray(context.images) ? context.images : [],
    componentImageLinks: context.componentImageLinks && typeof context.componentImageLinks === 'object' ? context.componentImageLinks : {},
    componentImageLinkDetails: context.componentImageLinkDetails && typeof context.componentImageLinkDetails === 'object' ? context.componentImageLinkDetails : {},
    imageReviewStatus: normalizeImageReviewStatus(context.imageReviewStatus),
    visualPlanPolicy: context.visualPlanPolicy && typeof context.visualPlanPolicy === 'object' ? context.visualPlanPolicy : { allowAutomaticComponentLinks: false },
    ingestionManifest: context.ingestionManifest && typeof context.ingestionManifest === 'object' && !Array.isArray(context.ingestionManifest) ? context.ingestionManifest : null,
    storyboardManifest: context.storyboardManifest && typeof context.storyboardManifest === 'object' && !Array.isArray(context.storyboardManifest) ? context.storyboardManifest : null,
    ...scriptState, activeStepId: asTrimmedString(context.activeStepId) || 'project',
    completedStepIds: canConfirmScript ? completedStepIds : completedStepIds.filter((stepId) => stepId !== 'script'),
  };
}

export function hydrateProjectContext(value) {
  const context = value && typeof value === 'object' ? value : null;
  if (!context || ![1, 2, 3, 4, 5, 6, PROJECT_CONTEXT_VERSION].includes(context.version) || !asTrimmedString(context.projectId)) return null;
  return createPersistedProjectContext(context);
}

export function saveProjectContext(storage, context) {
  const persisted = createPersistedProjectContext(context);
  if (!storage || !persisted.projectId) return persisted;
  storage.setItem(`${PROJECT_CONTEXT_PREFIX}${persisted.projectId}`, JSON.stringify(persisted));
  storage.setItem(LATEST_PROJECT_CONTEXT_KEY, persisted.projectId);
  return persisted;
}

export function loadProjectContext(storage, projectId) {
  if (!storage || !asTrimmedString(projectId)) return null;
  try {
    const raw = storage.getItem(`${PROJECT_CONTEXT_PREFIX}${projectId}`);
    return hydrateProjectContext(raw ? JSON.parse(raw) : null);
  } catch { return null; }
}

export function loadLatestProjectContext(storage) {
  if (!storage) return null;
  try {
    return loadProjectContext(storage, storage.getItem(LATEST_PROJECT_CONTEXT_KEY));
  } catch { return null; }
}


const STORYBOARD_TRANSITIONS = new Set(['fade-in', 'slide-left', 'slide-right', 'zoom-on-component', 'highlight-pulse']);

function countStoryboardWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

export function applyStoryboardSceneEdit(manifest, sceneId, patch = {}) {
  if (!manifest || !Array.isArray(manifest.scenes)) return manifest;
  let startMs = 0;
  const scenes = manifest.scenes.map((scene, index) => {
    const isEditedScene = scene.id === sceneId;
    const updated = isEditedScene ? { ...scene, ...patch } : { ...scene };
    const durationMs = Math.max(100, Math.round((Number(updated.durationMs) || 0) / 100) * 100);
    const spokenText = String(updated.spokenText || '').trim();
    const wordCount = countStoryboardWords(spokenText);
    const visualReviewState = updated.visualReviewState || 'needs_visual_review';
    const status = visualReviewState === 'blocked'
      ? 'blocked'
      : (isEditedScene && Object.prototype.hasOwnProperty.call(patch, 'visualReviewState') && updated.status === 'blocked')
        ? 'draft'
        : updated.status || 'draft';
    const timing = { startMs, endMs: startMs + durationMs };
    startMs = timing.endMs;
    return {
      ...updated,
      index,
      order: index + 1,
      spokenText,
      wordCount,
      estimatedDurationMs: durationMs,
      durationMs,
      durationSec: durationMs / 1000,
      timing,
      visualReviewState,
      status,
      imageAssetIds: Array.isArray(updated.imageAssetIds) ? [...new Set(updated.imageAssetIds.filter((id) => typeof id === 'string' && id.trim()))] : [],
      visualDirections: Array.isArray(updated.visualDirections) ? updated.visualDirections : [],
      reviewNotes: typeof updated.reviewNotes === 'string' ? updated.reviewNotes : '',
    };
  });
  return { ...manifest, scenes, totalEstimatedDurationMs: startMs };
}

export function validateStoryboardReview(manifest, projectImages = null, visualContext = {}) {
  if (!manifest || !Array.isArray(manifest.scenes) || manifest.scenes.length === 0) {
    return { valid: false, code: 'STORYBOARD_REVIEW_MISSING' };
  }
  const knownImageAssetIds = Array.isArray(projectImages) ? new Set(projectImages.map((image) => image?.id).filter(Boolean)) : null;
  const failures = manifest.scenes.filter((scene) => {
    const imageAssetIds = Array.isArray(scene.imageAssetIds) ? scene.imageAssetIds.filter(Boolean) : [];
    const hasConfirmedContextualEvidence = (scene.visualPlan?.contextualEvidenceAssignments || []).some((assignment) => contextualEvidenceAssignmentIsAllowed(scene.visualPlan?.primaryIntent, assignment));
    const hasResolvedMatchedAsset = scene.visualReviewState !== 'matched'
      || hasConfirmedContextualEvidence
      || (imageAssetIds.length > 0 && (!knownImageAssetIds || imageAssetIds.some((id) => knownImageAssetIds.has(id))));
    return !String(scene.spokenText || '').trim()
      || !Array.isArray(scene.sources) || scene.sources.length === 0
      || !Number.isFinite(scene.durationMs) || scene.durationMs < 100
      || !STORYBOARD_TRANSITIONS.has(scene.transition)
      || scene.status === 'blocked' || scene.visualReviewState === 'blocked'
      || !hasResolvedMatchedAsset;
  });
  if (failures.length) {
    return { valid: false, code: 'STORYBOARD_REVIEW_INCOMPLETE', sceneIds: failures.map((scene) => scene.id) };
  }
  const visualValidation = validateStoryboardVisualPlans(manifest, {
    images: projectImages || [],
    ...visualContext,
  });
  return visualValidation.valid
    ? { valid: true, code: null, visualSummary: visualValidation.summary }
    : { valid: false, code: visualValidation.code, sceneIds: visualValidation.sceneIds, visualSummary: visualValidation.summary };
}
