const { generateStoryboardFromIngestion } = require('../../src/ingest/storyboard');

describe('generateStoryboardFromIngestion', () => {
  it('produces a storyboard with at least one scene', () => {
    const ingestion = {
      ingestionContractVersion: '1.0.0',
      game: {
        slug: 'sample-game',
        name: 'Sample Game',
        languagesSupported: ['en'],
        sources: { bggUrl: null, manualEntry: true }
      },
      rulebook: { filename: 'rulebook.pdf', pages: 4, sha256: 'x'.repeat(32) },
      text: {
        full: 'Setup: Do X.\nGameplay: Do Y.',
        pages: [{ page: 1, text: 'Setup: Do X.' }],
        sha256: 'y'.repeat(32)
      },
      structure: {
        headings: [],
        components: [],
        setupSteps: [
          {
            id: 'setup-1',
            order: 1,
            text: 'Place the board in the center of the table.',
            componentRefs: [],
            pageRefs: [1],
            pauseCue: true
          }
        ],
        phases: []
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
    expect(storyboard.storyboardContractVersion).toBe('1.0.0');
    expect(storyboard.game.slug).toBe('sample-game');
    expect(Array.isArray(storyboard.scenes)).toBe(true);
    expect(storyboard.scenes.length).toBeGreaterThan(0);

    const scene = storyboard.scenes[0];
    expect(scene.type).toBe('setup');
    expect(scene.durationSec).toBeGreaterThanOrEqual(0.5);
  });
});
