const { runIngestionPipeline } = require('../../src/ingestion/pipeline');

describe('text-only PDF ingestion fallback', () => {
  test('accepts conservative uppercase section labels when font metadata is unavailable', () => {
    const manifest = runIngestionPipeline({
      documentId: 'jaipur-zero-state',
      metadata: { title: 'Jaipur', gameId: 'jaipur-zero-state', source: 'canonical-local-project' },
      pages: [{
        number: 1,
        blocks: [
          { text: 'INTRODUCTION AND AIM OF THE GAME', fontSize: 8, x: 0, y: 0 },
          { text: 'Jaipur is a trading game.', fontSize: 8, x: 0, y: 20 },
          { text: 'SET-UP', fontSize: 8, x: 0, y: 40 },
          { text: 'Deal five cards to each player.', fontSize: 8, x: 0, y: 60 },
        ],
      }],
    });

    expect(manifest.outline.map((entry) => entry.title)).toEqual([
      'INTRODUCTION AND AIM OF THE GAME',
      'SET-UP',
    ]);
    expect(manifest.components).toHaveLength(2);
  });
});
