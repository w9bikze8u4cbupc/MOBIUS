export const PROJECT_CONTEXT_VERSION = 1;
const PROJECT_CONTEXT_PREFIX = 'mobius-project-context:';
const LATEST_PROJECT_CONTEXT_KEY = 'mobius-project-context:latest';
const SUPPORTED_SCRIPT_LANGUAGES = new Set(['english', 'french']);

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isUsableComponentName(value) {
  const name = String(value || '').trim();
  if (!name || /^(unknown|unknown component|component|components|item|items|n\/a|none|null)$/i.test(name)) return false;
  if (name.split(/\s+/).length > 12 || /[.!?]/.test(name)) return false;
  return true;
}

export function hasValidatedComponents(components) {
  return Array.isArray(components)
    && components.some((component) => isUsableComponentName(component?.name));
}

export function getScriptInputReadiness({ projectId, gameName, rulebookText, components, language }) {
  if (!asTrimmedString(projectId)) {
    return { ready: false, message: 'Cannot generate: this project has no ID. Return to Project Setup and confirm the project.' };
  }
  if (!asTrimmedString(rulebookText)) {
    return { ready: false, message: 'Cannot generate: this project has no persisted rulebook text. Return to Project Setup and re-import the PDF.' };
  }
  if (!asTrimmedString(gameName)) {
    return { ready: false, message: 'Cannot generate: this project has no game name. Return to Project Setup and enter a game name.' };
  }
  if (!hasValidatedComponents(components)) {
    return { ready: false, message: 'Cannot generate: this project has no validated component inventory. Return to Ingestion Review and confirm at least one named component.' };
  }
  const selectedLanguage = asTrimmedString(language).toLowerCase();
  if (!selectedLanguage) {
    return { ready: false, message: 'Cannot generate: this project has no selected language. Return to Project Setup and select a language.' };
  }
  if (!SUPPORTED_SCRIPT_LANGUAGES.has(selectedLanguage)) {
    return { ready: false, message: 'Cannot generate: this project has an unsupported language. Return to Project Setup and select English or French.' };
  }
  return { ready: true, message: '' };
}

export function buildScriptGenerationRequest(context) {
  const readiness = getScriptInputReadiness(context);
  if (!readiness.ready) {
    return { request: null, readiness };
  }

  return {
    readiness,
    request: {
      projectId: asTrimmedString(context.projectId),
      gameName: asTrimmedString(context.gameName),
      language: asTrimmedString(context.language).toLowerCase(),
      rulebookText: context.rulebookText.trim(),
      components: context.components,
      metadata: context.metadata && typeof context.metadata === 'object' ? context.metadata : {},
    },
  };
}

export function createPersistedProjectContext(context) {
  return {
    version: PROJECT_CONTEXT_VERSION,
    projectId: asTrimmedString(context.projectId),
    gameName: asTrimmedString(context.gameName),
    language: asTrimmedString(context.language).toLowerCase(),
    rulebookText: typeof context.rulebookText === 'string' ? context.rulebookText : '',
    rulebookPages: Array.isArray(context.rulebookPages) ? context.rulebookPages : [],
    components: Array.isArray(context.components) ? context.components : [],
    metadata: context.metadata && typeof context.metadata === 'object' ? context.metadata : {},
    images: Array.isArray(context.images) ? context.images : [],
    componentImageLinks: context.componentImageLinks && typeof context.componentImageLinks === 'object'
      ? context.componentImageLinks
      : {},
    script: typeof context.script === 'string' ? context.script : '',
    generatedScript: context.generatedScript === true,
    activeStepId: asTrimmedString(context.activeStepId) || 'project',
    completedStepIds: Array.isArray(context.completedStepIds) ? context.completedStepIds : [],
  };
}

export function hydrateProjectContext(value) {
  const context = value && typeof value === 'object' ? value : null;
  if (!context || context.version !== PROJECT_CONTEXT_VERSION || !asTrimmedString(context.projectId)) {
    return null;
  }
  return createPersistedProjectContext(context);
}

export function saveProjectContext(storage, context) {
  const persisted = createPersistedProjectContext(context);
  if (!storage || !persisted.projectId) return persisted;
  storage.setItem(`${PROJECT_CONTEXT_PREFIX}${persisted.projectId}`, JSON.stringify(persisted));
  storage.setItem(LATEST_PROJECT_CONTEXT_KEY, persisted.projectId);
  return persisted;
}

export function loadLatestProjectContext(storage) {
  if (!storage) return null;
  try {
    const projectId = storage.getItem(LATEST_PROJECT_CONTEXT_KEY);
    if (!projectId) return null;
    const raw = storage.getItem(`${PROJECT_CONTEXT_PREFIX}${projectId}`);
    return hydrateProjectContext(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}
