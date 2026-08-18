export const SCRIPT_PACKAGE_VERSION = '1.0';

// Configuration-owned educational pacing policies. The resolver below receives
// measured source inputs; no game title or game-specific value participates.
export const TUTORIAL_LENGTH_PROFILES = Object.freeze({
  short: Object.freeze({
    name: 'short',
    targetSpokenWords: Object.freeze({ min: 450, max: 700 }),
    maxSpokenWords: 800,
  }),
  standard: Object.freeze({
    name: 'standard',
    targetSpokenWords: Object.freeze({ min: 800, max: 1200 }),
    maxSpokenWords: 1300,
  }),
  complex: Object.freeze({
    name: 'complex',
    targetSpokenWords: Object.freeze({ min: 1100, max: 1600 }),
    maxSpokenWords: 1750,
  }),
});

export function countSpokenWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

export function resolveTutorialLengthProfile({
  rulebookNonWhitespaceChars = 0,
  componentCount = 0,
  structuralComplexity = 0,
} = {}) {
  const input = {
    rulebookNonWhitespaceChars: Math.max(0, Number(rulebookNonWhitespaceChars) || 0),
    componentCount: Math.max(0, Number(componentCount) || 0),
    structuralComplexity: Math.max(0, Number(structuralComplexity) || 0),
  };
  let profile = TUTORIAL_LENGTH_PROFILES.standard;
  if (input.rulebookNonWhitespaceChars <= 8000
    && input.componentCount <= 12
    && input.structuralComplexity <= 2) {
    profile = TUTORIAL_LENGTH_PROFILES.short;
  } else if (input.rulebookNonWhitespaceChars >= 30000
    || input.componentCount >= 30
    || input.structuralComplexity >= 5) {
    profile = TUTORIAL_LENGTH_PROFILES.complex;
  }
  return { ...profile, input };
}

export function sanitizeSpokenText(value) {
  return String(value || '')
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/^\s*(?:source|sources|evidence)\s*:\s*.*$/gim, '')
    .replace(/(?:^|\s)(?:visual|opening shot|on screen|source|sources|evidence)\s*:\s*[^.\n]*(?:\.|$)/gim, ' ')
    .replace(/\[(?:visual|opening shot|on screen|source)\s*:[^\]]*\]/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonObject(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    const value = JSON.parse(candidate);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    const error = new Error('Final synthesis did not return the required script-package JSON object.');
    error.code = 'SCRIPT_PACKAGE_INVALID';
    throw error;
  }
}

function normalizeVisualDirections(value) {
  if (!Array.isArray(value)) return [];
  return value.map((direction) => {
    if (typeof direction === 'string' && direction.trim()) return { instruction: direction.trim() };
    if (!direction || typeof direction !== 'object') return null;
    const normalized = {
      instruction: String(direction.instruction || direction.description || '').trim(),
      onScreenText: String(direction.onScreenText || '').trim(),
      camera: String(direction.camera || '').trim(),
      highlights: Array.isArray(direction.highlights) ? direction.highlights.map(String).filter(Boolean) : [],
      arrows: Array.isArray(direction.arrows) ? direction.arrows.map(String).filter(Boolean) : [],
      componentRefs: Array.isArray(direction.componentRefs) ? direction.componentRefs.map(String).filter(Boolean) : [],
    };
    return Object.values(normalized).some((entry) => Array.isArray(entry) ? entry.length : entry) ? normalized : null;
  }).filter(Boolean);
}

function normalizeSources(value, chunks) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const allowed = new Map(chunks.map((chunk) => [
    `${chunk.index}:${chunk.startOffset}:${chunk.endOffset}`,
    chunk,
  ]));
  const sources = value.map((source) => {
    const section = Number(source?.section ?? source?.sectionIndex);
    const startOffset = Number(source?.startOffset);
    const endOffset = Number(source?.endOffset);
    const chunk = allowed.get(`${section}:${startOffset}:${endOffset}`);
    if (!chunk) return null;
    return {
      section,
      startOffset,
      endOffset,
      uncertainty: String(source?.uncertainty || '').trim() || null,
    };
  }).filter(Boolean);
  return sources.length === value.length ? sources : null;
}

export function parseGeneratedScriptPackage(content, { chunks, profile }) {
  const value = parseJsonObject(content);
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    const error = new Error('Final synthesis did not provide ordered script sections.');
    error.code = 'SCRIPT_PACKAGE_INVALID';
    throw error;
  }
  const sections = value.sections.map((section, index) => {
    const title = String(section?.title || '').trim();
    const spokenText = sanitizeSpokenText(section?.spokenText);
    const sources = normalizeSources(section?.sources, chunks);
    if (!title || !spokenText || !sources) {
      const error = new Error(`Final synthesis section ${index + 1} lacks title, spoken narration, or valid source provenance.`);
      error.code = 'SCRIPT_PACKAGE_INVALID';
      throw error;
    }
    return {
      id: `section-${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      title,
      spokenText,
      visualDirections: normalizeVisualDirections(section.visualDirections),
      sources,
    };
  });
  const spokenWordCount = sections.reduce((total, section) => total + countSpokenWords(section.spokenText), 0);
  if (spokenWordCount > profile.maxSpokenWords) {
    const error = new Error(`Final synthesis exceeds the ${profile.name} profile maximum of ${profile.maxSpokenWords} spoken words.`);
    error.code = 'SCRIPT_PACKAGE_WORD_CAP_EXCEEDED';
    error.spokenWordCount = spokenWordCount;
    throw error;
  }
  return {
    contractVersion: SCRIPT_PACKAGE_VERSION,
    lengthProfile: {
      name: profile.name,
      targetSpokenWords: profile.targetSpokenWords,
      maxSpokenWords: profile.maxSpokenWords,
      spokenWordCount,
      input: profile.input,
    },
    sections,
  };
}

export function scriptPackageToNarrationMarkdown(scriptPackage) {
  if (!scriptPackage || !Array.isArray(scriptPackage.sections)) return '';
  return scriptPackage.sections
    .map((section) => `## ${section.title}\n\n${section.spokenText}`)
    .join('\n\n')
    .trim();
}

export function attachScriptPackageToStoryboard(storyboard, scriptPackage) {
  if (!scriptPackage?.sections?.length) return storyboard;
  // Ingestion scene count is independent of tutorial section count. Preserve every
  // package section as an explicit storyboard input instead of guessing positional
  // bindings or silently dropping/repeating visual directions.
  const scriptSections = scriptPackage.sections.map((section) => ({
    id: section.id,
    order: section.order,
    title: section.title,
    narration: section.spokenText,
    visualDirections: section.visualDirections,
    sources: section.sources,
    componentRefs: [...new Set(section.visualDirections.flatMap((direction) => direction.componentRefs || []))],
  }));
  return { ...storyboard, scriptPackage, scriptSections };
}
