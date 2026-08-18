import {
  attachScriptPackageToStoryboard,
  buildAllowedSourceRegistry,
  inspectScriptPackageTransport,
  parseGeneratedScriptPackage,
  resolveTutorialLengthProfile,
  sanitizeSpokenText,
} from '../../src/services/scriptPackage.js';

const chunks = [
  { index: 1, startOffset: 0, endOffset: 500 },
  { index: 2, startOffset: 501, endOffset: 900 },
];
const profile = resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 15000, componentCount: 9, structuralComplexity: 3 });
const canonicalSection = (overrides = {}) => ({
  title: 'Setup',
  spokenText: 'Place the board in the center.',
  visualDirections: [{ instruction: 'Overhead view', onScreenText: 'Setup', componentRefs: ['board'] }],
  sourceIds: ['S1'],
  ...overrides,
});
const parse = (section = canonicalSection()) => parseGeneratedScriptPackage(JSON.stringify({ sections: [section] }), { chunks, profile });

describe('canonical script package', () => {
  test('parses direct canonical JSON and resolves S source IDs to validated offsets', () => {
    const scriptPackage = parse();
    expect(scriptPackage).toMatchObject({ contractVersion: '1.0', lengthProfile: { name: 'standard' } });
    expect(scriptPackage.sections[0]).toEqual(expect.objectContaining({
      id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board in the center.',
      visualDirections: [expect.objectContaining({ instruction: 'Overhead view', onScreenText: 'Setup', componentRefs: ['board'] })],
      sources: [{ section: 1, startOffset: 0, endOffset: 500, uncertainty: null }],
    }));
  });

  test('parses a complete JSON code fence and records the expected transport', () => {
    const content = `\`\`\`json\n${JSON.stringify({ sections: [canonicalSection()] })}\n\`\`\``;
    const scriptPackage = parseGeneratedScriptPackage(content, { chunks, profile });
    expect(scriptPackage.sections[0].sources[0]).toMatchObject({ section: 1, startOffset: 0, endOffset: 500 });
    expect(inspectScriptPackageTransport(content)).toMatchObject({ transport: 'json_fence', parseable: true, topLevelKeys: ['sections'] });
  });

  test.each([
    ['spoken_text', { spoken_text: 'Place the board in the center.' }],
    ['narration', { narration: 'Place the board in the center.' }],
    ['narrationText', { narrationText: 'Place the board in the center.' }],
    ['sectionTitle', { sectionTitle: 'Setup' }],
    ['visual_directions', { visual_directions: [{ instruction: 'Overhead view' }] }],
    ['sourceRefs', { sourceRefs: ['S1'] }],
    ['provenance', { provenance: ['S1'] }],
  ])('normalizes the documented %s alias without persisting alias keys', (_alias, replacement) => {
    const section = canonicalSection();
    if (replacement.spoken_text || replacement.narration || replacement.narrationText) delete section.spokenText;
    if (replacement.sectionTitle) delete section.title;
    if (replacement.visual_directions) delete section.visualDirections;
    if (replacement.sourceRefs || replacement.provenance) delete section.sourceIds;
    Object.assign(section, replacement);
    const result = parse(section).sections[0];
    expect(result).toEqual(expect.objectContaining({ title: 'Setup', spokenText: 'Place the board in the center.' }));
    expect(Object.keys(result)).toEqual(['id', 'order', 'title', 'spokenText', 'visualDirections', 'sources']);
    expect(result.sources).toEqual([{ section: 1, startOffset: 0, endOffset: 500, uncertainty: null }]);
  });

  test('accepts documented numeric source compatibility aliases only when they resolve to the exact validated source', () => {
    const fromSection = parse(canonicalSection({ sourceIds: undefined, sources: [{ section: 2, startOffset: 501, endOffset: 900 }] }));
    const fromSectionIndex = parse(canonicalSection({ sourceIds: undefined, sources: [{ sectionIndex: 2, startOffset: 501, endOffset: 900 }] }));
    expect(fromSection.sections[0].sources[0]).toMatchObject({ section: 2, startOffset: 501, endOffset: 900 });
    expect(fromSectionIndex.sections[0].sources[0]).toMatchObject({ section: 2, startOffset: 501, endOffset: 900 });
  });

  test.each([
    ['unknown source ID', canonicalSection({ sourceIds: ['S99'] }), 'unknown_source_id', ['sections[0].sources[0]']],
    ['missing source IDs', canonicalSection({ sourceIds: [] }), 'missing_source_ids', ['sections[0].sourceIds']],
    ['missing title', canonicalSection({ title: '' }), 'missing_title', ['sections[0].title']],
    ['missing spoken text', canonicalSection({ spokenText: '' }), 'missing_spoken_text', ['sections[0].spokenText']],
    ['missing visual directions', canonicalSection({ visualDirections: undefined }), 'missing_visual_directions', ['sections[0].visualDirections']],
    ['mismatched source offsets', canonicalSection({ sourceIds: undefined, sources: [{ sourceId: 'S1', startOffset: 1, endOffset: 500 }] }), 'source_offset_mismatch', ['sections[0].sources[0]']],
  ])('rejects %s with typed validation fields', (_label, section, reason, fields) => {
    expect(() => parse(section)).toThrow(expect.objectContaining({ code: 'SCRIPT_PACKAGE_INVALID', reason, validationFields: fields }));
  });

  test('rejects malformed and prose-wrapped JSON rather than repairing it', () => {
    for (const content of ['{not json}', `Explanation\n${JSON.stringify({ sections: [canonicalSection()] })}`]) {
      expect(() => parseGeneratedScriptPackage(content, { chunks, profile })).toThrow(expect.objectContaining({ code: 'SCRIPT_PACKAGE_INVALID', reason: 'malformed_json' }));
    }
  });

  test('rejects standard narration over its hard spoken-word cap', () => {
    const overCap = Array.from({ length: 1301 }, () => 'word').join(' ');
    expect(() => parse(canonicalSection({ title: 'Rules', spokenText: overCap }))).toThrow('maximum of 1300 spoken words');
  });

  test('builds a unique deterministic source registry', () => {
    const registry = buildAllowedSourceRegistry(chunks);
    expect(registry.byId.get('S1')).toEqual({ sourceId: 'S1', section: 1, startOffset: 0, endOffset: 500 });
    expect(() => buildAllowedSourceRegistry([{ index: 1, startOffset: 0, endOffset: 1 }, { index: 1, startOffset: 2, endOffset: 3 }])).toThrow('invalid or duplicate source');
  });

  test('attaches non-spoken visual directions to storyboard sections while narration stays separate', () => {
    const scriptPackage = parse(canonicalSection({ visualDirections: [{ instruction: 'Highlight board', componentRefs: ['board'] }] }));
    const storyboard = attachScriptPackageToStoryboard({ scenes: [{ id: 'scene-1' }] }, scriptPackage);
    expect(storyboard.scriptSections[0]).toMatchObject({ narration: 'Place the board in the center.', visualDirections: [{ instruction: 'Highlight board', componentRefs: ['board'] }], componentRefs: ['board'] });
  });

  test('resolves short, standard, and complex profiles deterministically', () => {
    expect(resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 5000, componentCount: 6, structuralComplexity: 1 }).name).toBe('short');
    expect(profile).toMatchObject({ name: 'standard', targetSpokenWords: { min: 800, max: 1200 }, maxSpokenWords: 1300 });
    expect(resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 36000, componentCount: 10, structuralComplexity: 4 }).name).toBe('complex');
    expect(sanitizeSpokenText('[Visual: show board] Place the board.\n[Source: S1]')).toBe('Place the board.');
  });
});
