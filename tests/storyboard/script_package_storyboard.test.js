const {
  createScriptPackageStoryboard,
  estimateSceneDurationMs,
  NARRATION_RATES_WPM,
} = require('../../src/storyboard/generator');
const { validateStoryboard } = require('../../src/validators/storyboardValidator');

const ingestionManifest = { document: { id: 'abyss-test' }, outline: Array.from({ length: 66 }, (_, index) => ({ id: `heading-${index + 1}` })) };
const section = (index, overrides = {}) => ({
  id: `section-${String(index).padStart(2, '0')}`,
  order: index,
  title: `Section ${index}`,
  spokenText: `Sentence ${index} explains a verified tutorial step.`,
  visualDirections: [{ instruction: `Show approved visual ${index}.`, onScreenText: `Step ${index}`, camera: '', highlights: index === 1 ? ['board'] : [], arrows: [], componentRefs: index === 1 ? ['board'] : [] }],
  sources: [{ section: index, startOffset: index * 10, endOffset: index * 10 + 9, uncertainty: null }],
  ...overrides,
});

const packageOf = (count = 11) => ({ sections: Array.from({ length: count }, (_, index) => section(index + 1)) });

describe('script-package canonical storyboard', () => {
  test('uses 11 ordered script sections rather than a 66-entry ingestion outline', () => {
    const manifest = createScriptPackageStoryboard(ingestionManifest, packageOf(11), { language: 'english' });
    expect(manifest).toMatchObject({ version: '1.2.0', language: 'english', narrationRateWpm: NARRATION_RATES_WPM.english });
    expect(manifest.scenes).toHaveLength(11);
    expect(manifest.totalEstimatedDurationMs).toBe(36_300);
    expect(manifest.durationWarning).toMatch(/outside the standard 5–10 minute profile/i);
    expect(manifest.scenes.map((scene) => scene.sectionId)).toEqual(Array.from({ length: 11 }, (_, index) => `section-${String(index + 1).padStart(2, '0')}`));
    expect(manifest.scenes.every((scene) => scene.visualReviewState === 'needs_visual_review' && scene.imageAssetIds.length === 0)).toBe(true);
    expect(validateStoryboard(manifest, { contractVersion: '1.2.0' })).toMatchObject({ valid: true });
  });

  test('derives timing from spoken words and language rates, summing all scene durations', () => {
    const shortText = 'One two three.';
    const longText = Array.from({ length: 145 }, () => 'word').join(' ');
    const english = createScriptPackageStoryboard(ingestionManifest, { sections: [section(1, { spokenText: shortText }), section(2, { spokenText: longText })] }, { language: 'english' });
    const french = createScriptPackageStoryboard(ingestionManifest, { sections: [section(1, { spokenText: longText })] }, { language: 'french' });
    expect(english.scenes[1].estimatedDurationMs).toBeGreaterThan(english.scenes[0].estimatedDurationMs);
    expect(french.scenes[0].estimatedDurationMs).toBeGreaterThan(estimateSceneDurationMs(145, 'english'));
    expect(english.totalEstimatedDurationMs).toBe(english.scenes.reduce((sum, scene) => sum + scene.estimatedDurationMs, 0));
  });

  test('preserves visual directions and source references across deterministic sentence splitting', () => {
    const spokenText = Array.from({ length: 80 }, (_, index) => `Sentence ${index + 1}.`).join(' ');
    const manifest = createScriptPackageStoryboard(ingestionManifest, { sections: [section(1, { spokenText })] });
    expect(manifest.scenes.length).toBeGreaterThan(1);
    manifest.scenes.forEach((scene) => {
      expect(scene.sources).toEqual([expect.objectContaining({ section: 1, startOffset: 10, endOffset: 19 })]);
      expect(scene.visualDirections).toEqual([expect.objectContaining({ instruction: 'Show approved visual 1.', componentRefs: ['board'] })]);
      expect(scene.spokenText).not.toContain('Show approved visual');
    });
  });

  test('rejects non-source-complete packages instead of falling back to outline scenes', () => {
    expect(() => createScriptPackageStoryboard(ingestionManifest, { sections: [section(1, { sources: [] })] })).toThrow('STORYBOARD_INVALID_SCRIPT_PACKAGE');
  });
});
