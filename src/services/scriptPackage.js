export const SCRIPT_PACKAGE_VERSION = '1.0';

export const TUTORIAL_LENGTH_PROFILES = Object.freeze({
  short: Object.freeze({ name: 'short', targetSpokenWords: Object.freeze({ min: 450, max: 700 }), maxSpokenWords: 800 }),
  standard: Object.freeze({ name: 'standard', targetSpokenWords: Object.freeze({ min: 800, max: 1200 }), maxSpokenWords: 1300 }),
  complex: Object.freeze({ name: 'complex', targetSpokenWords: Object.freeze({ min: 1100, max: 1600 }), maxSpokenWords: 1750 }),
});

export function countSpokenWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

export function resolveTutorialLengthProfile({ rulebookNonWhitespaceChars = 0, componentCount = 0, structuralComplexity = 0 } = {}) {
  const input = {
    rulebookNonWhitespaceChars: Math.max(0, Number(rulebookNonWhitespaceChars) || 0),
    componentCount: Math.max(0, Number(componentCount) || 0),
    structuralComplexity: Math.max(0, Number(structuralComplexity) || 0),
  };
  let profile = TUTORIAL_LENGTH_PROFILES.standard;
  if (input.rulebookNonWhitespaceChars <= 8000 && input.componentCount <= 12 && input.structuralComplexity <= 2) profile = TUTORIAL_LENGTH_PROFILES.short;
  else if (input.rulebookNonWhitespaceChars >= 30000 || input.componentCount >= 30 || input.structuralComplexity >= 5) profile = TUTORIAL_LENGTH_PROFILES.complex;
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

function createValidationError(reason, message, validationFields = [], sectionIndex = null) {
  const error = new Error(message);
  error.code = 'SCRIPT_PACKAGE_INVALID';
  error.reason = reason;
  error.validationFields = validationFields;
  error.sectionIndex = sectionIndex;
  return error;
}

function getSingleAliasedValue(value, keys, field, sectionIndex) {
  const present = keys.filter((key) => value?.[key] !== undefined);
  if (present.length === 0) return undefined;
  const first = value[present[0]];
  if (present.slice(1).some((key) => JSON.stringify(value[key]) !== JSON.stringify(first))) {
    throw createValidationError('ambiguous_alias', `Final synthesis section ${sectionIndex} supplied conflicting ${field} aliases.`, [`sections[${sectionIndex - 1}].${field}`], sectionIndex);
  }
  return first;
}

export function inspectScriptPackageTransport(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const inspection = {
    transport: fenced ? 'json_fence' : 'direct_json',
    rawResponseChars: String(content || '').length,
    topLevelKeys: [],
    firstSectionKeys: [],
    parseable: false,
  };
  try {
    const value = JSON.parse(candidate);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return inspection;
    inspection.parseable = true;
    inspection.topLevelKeys = Object.keys(value).sort();
    if (Array.isArray(value.sections) && value.sections[0] && typeof value.sections[0] === 'object' && !Array.isArray(value.sections[0])) {
      inspection.firstSectionKeys = Object.keys(value.sections[0]).sort();
    }
  } catch {
    inspection.transport = fenced ? 'json_fence_invalid' : 'invalid_json';
  }
  return inspection;
}

function escapeRawControlCharactersInJsonStrings(value) {
  let inString = false;
  let escaped = false;
  let repaired = '';
  let changed = false;
  for (const character of value) {
    if (!inString) {
      if (character === '"') inString = true;
      repaired += character;
      continue;
    }
    if (escaped) {
      escaped = false;
      repaired += character;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      repaired += character;
      continue;
    }
    if (character === '"') {
      inString = false;
      repaired += character;
      continue;
    }
    if (character === '\n') {
      repaired += '\\n';
      changed = true;
      continue;
    }
    if (character === '\r') {
      repaired += '\\r';
      changed = true;
      continue;
    }
    if (character === '\t') {
      repaired += '\\t';
      changed = true;
      continue;
    }
    repaired += character;
  }
  return changed ? repaired : value;
}

function parseJsonObject(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parseObject = (json) => {
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  };
  try {
    return parseObject(candidate);
  } catch {
    // Some providers occasionally emit a literal line break inside an otherwise
    // valid JSON string. Escape only those forbidden control characters; never
    // unwrap prose, invent fields, or repair structural JSON mistakes.
    try {
      const repaired = escapeRawControlCharactersInJsonStrings(candidate);
      if (repaired === candidate) throw new Error('no deterministic repair');
      return parseObject(repaired);
    } catch {
      throw createValidationError('malformed_json', 'Final synthesis did not return the required script-package JSON object.', ['package']);
    }
  }
}

function normalizeVisualDirections(value, sectionIndex) {
  if (!Array.isArray(value)) {
    throw createValidationError('missing_visual_directions', `Final synthesis section ${sectionIndex} lacks visualDirections.`, [`sections[${sectionIndex - 1}].visualDirections`], sectionIndex);
  }
  return value.map((direction) => {
    if (typeof direction === 'string' && direction.trim()) return { instruction: direction.trim(), onScreenText: '', camera: '', highlights: [], arrows: [], componentRefs: [] };
    if (!direction || typeof direction !== 'object' || Array.isArray(direction)) return null;
    return {
      instruction: String(direction.instruction || direction.description || '').trim(),
      onScreenText: String(direction.onScreenText || direction.on_screen_text || '').trim(),
      camera: String(direction.camera || '').trim(),
      highlights: Array.isArray(direction.highlights) ? direction.highlights.map(String).filter(Boolean) : [],
      arrows: Array.isArray(direction.arrows) ? direction.arrows.map(String).filter(Boolean) : [],
      componentRefs: Array.isArray(direction.componentRefs) ? direction.componentRefs.map(String).filter(Boolean) : [],
    };
  }).filter(Boolean);
}

export function buildAllowedSourceRegistry(chunks = []) {
  const byId = new Map();
  const bySection = new Map();
  for (const chunk of chunks) {
    const section = Number(chunk?.index);
    const startOffset = Number(chunk?.startOffset);
    const endOffset = Number(chunk?.endOffset);
    const sourceId = `S${section}`;
    if (!Number.isInteger(section) || section < 1 || !Number.isInteger(startOffset) || !Number.isInteger(endOffset)
      || byId.has(sourceId) || bySection.has(section)) {
      throw createValidationError('invalid_source_registry', 'Validated source registry contains an invalid or duplicate source.', ['chunks']);
    }
    const source = { sourceId, section, startOffset, endOffset };
    byId.set(sourceId, source);
    bySection.set(section, source);
  }
  return { byId, bySection };
}

function resolveOneSource(reference, registry, sectionIndex, referenceIndex) {
  const field = `sections[${sectionIndex - 1}].sources[${referenceIndex}]`;
  let sourceId = null;
  let numericSection = null;
  let suppliedStart = null;
  let suppliedEnd = null;
  if (typeof reference === 'string') {
    sourceId = reference;
  } else if (reference && typeof reference === 'object' && !Array.isArray(reference)) {
    sourceId = reference.sourceId ?? null;
    const numericAlias = reference.section ?? reference.sectionIndex;
    numericSection = numericAlias === undefined ? null : Number(numericAlias);
    suppliedStart = reference.startOffset === undefined ? null : Number(reference.startOffset);
    suppliedEnd = reference.endOffset === undefined ? null : Number(reference.endOffset);
  } else {
    throw createValidationError('invalid_source_reference', 'Final synthesis supplied an invalid source reference.', [field], sectionIndex);
  }

  let byId = null;
  if (sourceId !== null) {
    if (typeof sourceId !== 'string' || !/^S[1-9]\d*$/.test(sourceId)) {
      throw createValidationError('unknown_source_id', 'Final synthesis cited an unknown source ID.', [field], sectionIndex);
    }
    byId = registry.byId.get(sourceId) || null;
    if (!byId) throw createValidationError('unknown_source_id', 'Final synthesis cited an unknown source ID.', [field], sectionIndex);
  }
  let bySection = null;
  if (numericSection !== null) {
    if (!Number.isInteger(numericSection) || numericSection < 1) {
      throw createValidationError('invalid_source_reference', 'Final synthesis supplied an invalid source section.', [field], sectionIndex);
    }
    bySection = registry.bySection.get(numericSection) || null;
    if (!bySection) throw createValidationError('unknown_source_id', 'Final synthesis cited an unknown source ID.', [field], sectionIndex);
  }
  const resolved = byId || bySection;
  if (!resolved || (byId && bySection && byId.sourceId !== bySection.sourceId)) {
    throw createValidationError('ambiguous_source_reference', 'Final synthesis supplied conflicting source references.', [field], sectionIndex);
  }
  if ((suppliedStart !== null && suppliedStart !== resolved.startOffset) || (suppliedEnd !== null && suppliedEnd !== resolved.endOffset)) {
    throw createValidationError('source_offset_mismatch', 'Final synthesis supplied offsets that do not match the validated source.', [field], sectionIndex);
  }
  return {
    section: resolved.section,
    startOffset: resolved.startOffset,
    endOffset: resolved.endOffset,
    uncertainty: typeof reference === 'object' && String(reference.uncertainty || '').trim() ? String(reference.uncertainty).trim() : null,
  };
}

function normalizeSources(value, registry, sectionIndex) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createValidationError('missing_source_ids', `Final synthesis section ${sectionIndex} lacks sourceIds.`, [`sections[${sectionIndex - 1}].sourceIds`], sectionIndex);
  }
  return value.map((reference, referenceIndex) => resolveOneSource(reference, registry, sectionIndex, referenceIndex));
}

export function parseGeneratedScriptPackage(content, { chunks, profile }) {
  const value = parseJsonObject(content);
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw createValidationError('missing_sections', 'Final synthesis did not provide ordered script sections.', ['sections']);
  }
  const registry = buildAllowedSourceRegistry(chunks);
  const sections = value.sections.map((rawSection, index) => {
    const sectionIndex = index + 1;
    if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) {
      throw createValidationError('invalid_section', `Final synthesis section ${sectionIndex} is invalid.`, [`sections[${index}]`], sectionIndex);
    }
    const title = String(getSingleAliasedValue(rawSection, ['title', 'sectionTitle'], 'title', sectionIndex) || '').trim();
    const spokenText = sanitizeSpokenText(getSingleAliasedValue(rawSection, ['spokenText', 'spoken_text', 'narration', 'narrationText'], 'spokenText', sectionIndex));
    const visualDirections = normalizeVisualDirections(getSingleAliasedValue(rawSection, ['visualDirections', 'visual_directions'], 'visualDirections', sectionIndex), sectionIndex);
    const sources = normalizeSources(getSingleAliasedValue(rawSection, ['sourceIds', 'sources', 'sourceRefs', 'provenance'], 'sourceIds', sectionIndex), registry, sectionIndex);
    if (!title) throw createValidationError('missing_title', `Final synthesis section ${sectionIndex} lacks a title.`, [`sections[${index}].title`], sectionIndex);
    if (!spokenText) throw createValidationError('missing_spoken_text', `Final synthesis section ${sectionIndex} lacks spoken narration.`, [`sections[${index}].spokenText`], sectionIndex);
    return {
      id: `section-${String(sectionIndex).padStart(2, '0')}`,
      order: sectionIndex,
      title,
      spokenText,
      visualDirections,
      sources,
    };
  });
  const spokenWordCount = sections.reduce((total, section) => total + countSpokenWords(section.spokenText), 0);
  if (spokenWordCount > profile.maxSpokenWords) {
    const error = new Error(`Final synthesis exceeds the ${profile.name} profile maximum of ${profile.maxSpokenWords} spoken words.`);
    error.code = 'SCRIPT_PACKAGE_WORD_CAP_EXCEEDED';
    error.reason = 'spoken_word_cap_exceeded';
    error.validationFields = ['sections.spokenText'];
    error.spokenWordCount = spokenWordCount;
    throw error;
  }
  return {
    contractVersion: SCRIPT_PACKAGE_VERSION,
    lengthProfile: { name: profile.name, targetSpokenWords: profile.targetSpokenWords, maxSpokenWords: profile.maxSpokenWords, spokenWordCount, input: profile.input },
    sections,
  };
}

export function scriptPackageToNarrationMarkdown(scriptPackage) {
  if (!scriptPackage || !Array.isArray(scriptPackage.sections)) return '';
  return scriptPackage.sections.map((section) => `## ${section.title}\n\n${section.spokenText}`).join('\n\n').trim();
}

export function attachScriptPackageToStoryboard(storyboard, scriptPackage) {
  if (!scriptPackage?.sections?.length) return storyboard;
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
