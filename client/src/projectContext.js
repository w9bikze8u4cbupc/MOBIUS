export const PROJECT_CONTEXT_VERSION = 4;
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

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

export async function resolveMatchingIngestionManifest({ manifest, storage, context } = {}) {
  const persistedManifest = !manifest && context?.projectId
    ? loadProjectContext(storage, context.projectId)?.ingestionManifest
    : null;
  const candidate = manifest || persistedManifest || null;
  const validation = await validateMatchingIngestionManifest(candidate, context);
  return { ...validation, manifest: validation.valid ? candidate : null };
}

export function createPersistedProjectContext(context) {
  const scriptState = normalizeScriptState(context);
  const completedStepIds = Array.isArray(context.completedStepIds) ? [...new Set(context.completedStepIds.filter((stepId) => typeof stepId === 'string'))] : [];
  const canConfirmScript = Boolean(asTrimmedString(scriptState.script)) && isTrustedScriptProvenance(scriptState.scriptProvenance);
  return {
    version: PROJECT_CONTEXT_VERSION, projectId: asTrimmedString(context.projectId), gameName: asTrimmedString(context.gameName),
    language: asTrimmedString(context.language).toLowerCase(), rulebookText: typeof context.rulebookText === 'string' ? context.rulebookText : '',
    rulebookPages: Array.isArray(context.rulebookPages) ? context.rulebookPages : [], components: Array.isArray(context.components) ? context.components : [],
    metadata: context.metadata && typeof context.metadata === 'object' ? context.metadata : {}, images: Array.isArray(context.images) ? context.images : [],
    componentImageLinks: context.componentImageLinks && typeof context.componentImageLinks === 'object' ? context.componentImageLinks : {},
    ingestionManifest: context.ingestionManifest && typeof context.ingestionManifest === 'object' && !Array.isArray(context.ingestionManifest) ? context.ingestionManifest : null,
    storyboardManifest: context.storyboardManifest && typeof context.storyboardManifest === 'object' && !Array.isArray(context.storyboardManifest) ? context.storyboardManifest : null,
    ...scriptState, activeStepId: asTrimmedString(context.activeStepId) || 'project',
    completedStepIds: canConfirmScript ? completedStepIds : completedStepIds.filter((stepId) => stepId !== 'script'),
  };
}

export function hydrateProjectContext(value) {
  const context = value && typeof value === 'object' ? value : null;
  if (!context || ![1, 2, 3, PROJECT_CONTEXT_VERSION].includes(context.version) || !asTrimmedString(context.projectId)) return null;
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
