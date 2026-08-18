import {
  attachScriptPackageToStoryboard,
  parseGeneratedScriptPackage,
  resolveTutorialLengthProfile,
  sanitizeSpokenText,
} from '../../src/services/scriptPackage.js';

describe('canonical script package', () => {
  const chunks = [{ index: 1, startOffset: 0, endOffset: 500 }];

  test('separates narratable text, visual directions, and source provenance', () => {
    const scriptPackage = parseGeneratedScriptPackage(JSON.stringify({
      sections: [{
        title: 'Setup',
        spokenText: 'Place the board in the center.',
        visualDirections: [{ instruction: 'Overhead view', onScreenText: 'Setup', componentRefs: ['board'] }],
        sources: [{ section: 1, startOffset: 0, endOffset: 500 }],
      }],
    }), { chunks, profile: resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 15000, componentCount: 9, structuralComplexity: 3 }) });

    expect(scriptPackage.sections[0]).toEqual(expect.objectContaining({
      spokenText: 'Place the board in the center.',
      visualDirections: [expect.objectContaining({ instruction: 'Overhead view', componentRefs: ['board'] })],
      sources: [{ section: 1, startOffset: 0, endOffset: 500, uncertainty: null }],
    }));
    expect(sanitizeSpokenText('[Visual: show board] Place the board.\n[Source: Section 1, offsets 0-500]')).toBe('Place the board.');
  });

  test('attaches non-spoken visual directions to storyboard scenes while narration stays separate', () => {
    const scriptPackage = parseGeneratedScriptPackage(JSON.stringify({
      sections: [{ title: 'Setup', spokenText: 'Place the board.', visualDirections: [{ instruction: 'Highlight board', componentRefs: ['board'] }], sources: [{ section: 1, startOffset: 0, endOffset: 500 }] }],
    }), { chunks, profile: resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 15000, componentCount: 9, structuralComplexity: 3 }) });
    const storyboard = attachScriptPackageToStoryboard({ scenes: [{ id: 'scene-1' }] }, scriptPackage);
    expect(storyboard.scriptSections[0]).toMatchObject({ narration: 'Place the board.', visualDirections: [{ instruction: 'Highlight board', componentRefs: ['board'] }], componentRefs: ['board'] });
    expect(storyboard.scriptPackage.sections[0].sources).toHaveLength(1);
  });

  test('resolves short, standard, and complex profiles deterministically from measured inputs', () => {
    expect(resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 5000, componentCount: 6, structuralComplexity: 1 }).name).toBe('short');
    const standard = resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 15000, componentCount: 9, structuralComplexity: 3 });
    expect(standard).toMatchObject({ name: 'standard', targetSpokenWords: { min: 800, max: 1200 }, maxSpokenWords: 1300 });
    expect(resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 36000, componentCount: 10, structuralComplexity: 4 }).name).toBe('complex');
  });

  test('rejects standard narration over its hard spoken-word cap', () => {
    const overCap = Array.from({ length: 1301 }, () => 'word').join(' ');
    expect(() => parseGeneratedScriptPackage(JSON.stringify({
      sections: [{ title: 'Rules', spokenText: overCap, visualDirections: [], sources: [{ section: 1, startOffset: 0, endOffset: 500 }] }],
    }), { chunks, profile: resolveTutorialLengthProfile({ rulebookNonWhitespaceChars: 15000, componentCount: 9, structuralComplexity: 3 }) })).toThrow('maximum of 1300 spoken words');
  });
});
