const { generateStoryboardFromIngestion } = require('../../src/storyboard/storyboard_from_ingestion');

describe('generateStoryboardFromIngestion', () => {
  it('produces a governed storyboard with intro, setup steps, and end card', () => {
    const ingestion = {
      ingestionContractVersion: '1.0.0',
      game: {
        slug: 'sample-game',
        name: 'Sample Game',
        languagesSupported: ['en'],
        sources: { bggUrl: null, manualEntry: true }
      },
      rulebook: { filename: 'rulebook.pdf', pages: 4, sha256: 'x'.repeat(32) },
      structure: {
        headings: [],
        components: [],
        setupSteps: [
          {
            id: 'setup-1',
            order: 1,
            text: 'Place the board in the center of the table.',
            componentRefs: ['board'],
            pageRefs: [1],
            pauseCue: true
          },
          {
            id: 'setup-2',
            order: 2,
            text: 'Deal five cards to each player.',
            componentRefs: ['cards'],
            pageRefs: [1],
            pauseCue: false
          }
        ]
      },
      diagnostics: {
        warnings: [],
        errors: [],
        parser: { engine: 'test', version: '0.0.0' },
        ocr: { used: false, reason: null }
      }
    };

    const storyboard = generateStoryboardFromIngestion(ingestion);

    expect(storyboard).toBeTruthy();
    expect(storyboard.storyboardContractVersion).toBe('1.1.0');
    expect(storyboard.game.slug).toBe('sample-game');
    expect(storyboard.resolution.width).toBe(1920);
    expect(Array.isArray(storyboard.scenes)).toBe(true);
    expect(storyboard.scenes.map((scene) => scene.type)).toEqual([
      'intro',
      'setup_step',
      'setup_step',
      'end_card'
    ]);

    storyboard.scenes.forEach((scene, index, list) => {
      expect(scene.index).toBe(index);
      expect(scene.durationSec).toBeGreaterThanOrEqual(1);
      expect(scene.prevSceneId).toBe(index === 0 ? null : list[index - 1].id);
      expect(scene.nextSceneId).toBe(index === list.length - 1 ? null : list[index + 1].id);
    });
  });
});
