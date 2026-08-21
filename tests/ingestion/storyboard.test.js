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

  it('derives game identity and setup scenes from the canonical deterministic ingestion manifest', () => {
    const ingestion = {
      document: {
        id: 'hanamikoji-rulebook',
        gameId: 'hanamikoji',
        title: 'Hanamikoji',
        bgg: { name: 'Hanamikoji' },
      },
      outline: [
        { id: 'heading-title', title: 'HANAMIKOJI', page: 1 },
        { id: 'heading-setup', title: 'Setup', page: 1 },
        { id: 'heading-gameplay', title: 'Gameplay', page: 2 },
      ],
      components: [
        {
          id: 'comp-setup',
          sourceHeading: 'heading-setup',
          text: 'HANAMIKOJI Setup Shuffle the favor cards and place them face down.',
          pageStart: 1,
          pageEnd: 1,
        },
        {
          id: 'comp-gameplay',
          sourceHeading: 'heading-gameplay',
          text: 'Each round players perform four actions.',
          pageStart: 2,
          pageEnd: 2,
        },
      ],
    };

    const storyboard = generateStoryboardFromIngestion(ingestion);

    expect(storyboard.game).toEqual({ slug: 'hanamikoji', name: 'Hanamikoji' });
    expect(storyboard.scenes.map((scene) => scene.type)).toEqual([
      'intro', 'setup_step', 'end_card',
    ]);
    expect(storyboard.scenes[1].overlays[0].text).toContain('Shuffle the favor cards');
    expect(storyboard.scenes[1].overlays[0].text).not.toContain('Each round players');
  });
});
