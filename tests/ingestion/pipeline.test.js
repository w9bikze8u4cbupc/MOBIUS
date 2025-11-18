const fs = require('fs');
const path = require('path');
const { runIngestionPipeline } = require('../../src/ingestion/pipeline');
const { hydrateFromFixture } = require('../../src/ingestion/bgg');
const { validateIngestionManifest } = require('../../src/validators/ingestionValidator');
const { generateStoryboardFromIngestion } = require('../../src/ingest/storyboard');
const { validateStoryboard } = require('../../src/validators/storyboardValidator');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../fixtures/ingestion/${name}.json`), 'utf-8'));
}

describe('Phase E ingestion pipeline', () => {
  it('produces a deterministic manifest for the canonical rulebook', () => {
    const fixture = readFixture('rulebook-good');
    const manifest = runIngestionPipeline({
      documentId: fixture.documentId,
      metadata: fixture.metadata,
      pages: fixture.pages,
      bggMetadata: hydrateFromFixture('hanamikoji')
    });

    const { valid, errors } = validateIngestionManifest(manifest);
    expect({ valid, errors }).toEqual({ valid: true, errors: [] });
    expect(manifest.outline).toHaveLength(4);
    expect(manifest.components).toHaveLength(4);
    expect(manifest.assets.pages).toHaveLength(fixture.pages.length);
    expect(manifest.document.bgg).toEqual({
      name: 'Hanamikoji',
      minPlayers: 2,
      maxPlayers: 2,
      playTime: 20,
      mechanics: ['Hand Management', 'Set Collection']
    });
  });

  it('records deterministic OCR fallbacks', () => {
    const fixture = readFixture('rulebook-scanned');
    const manifest = runIngestionPipeline({
      documentId: fixture.documentId,
      metadata: fixture.metadata,
      pages: fixture.pages,
      ocr: fixture.ocr,
      bggMetadata: hydrateFromFixture('hanamikoji')
    });

    expect(manifest.ocrUsage).toEqual([
      { page: 1, reason: 'EMPTY_PAGE', count: 2 }
    ]);
    const { valid } = validateIngestionManifest(manifest);
    expect(valid).toBe(true);
  });
});

describe('Phase E storyboard governance', () => {
  it('generates a governed storyboard manifest from ingestion output', () => {
    const fixture = readFixture('rulebook-good');
    const ingestionManifest = runIngestionPipeline({
      documentId: fixture.documentId,
      metadata: fixture.metadata,
      pages: fixture.pages,
      bggMetadata: hydrateFromFixture('hanamikoji')
    });

    const ingestionForStoryboard = {
      game: {
        slug: ingestionManifest.document.gameId || ingestionManifest.document.id || 'unknown-game',
        name: ingestionManifest.document.title || 'Unknown Game'
      },
      structure: {
        setupSteps: ingestionManifest.outline.map((heading, index) => ({
          id: heading.slug || `outline-${index}`,
          order: index,
          text: heading.title,
          componentRefs: []
        }))
      }
    };

    const storyboard = generateStoryboardFromIngestion(ingestionForStoryboard);
    const { valid, errors } = validateStoryboard(storyboard, { contractVersion: '1.1.0' });
    expect({ valid, errors }).toEqual({ valid: true, errors: [] });

    // Outline headings convert to setup steps, so storyboard has intro + steps + end card
    expect(storyboard.scenes.length).toBe(ingestionManifest.outline.length + 2);
    expect(storyboard.scenes[0].type).toBe('intro');
    expect(storyboard.scenes[storyboard.scenes.length - 1].type).toBe('end_card');
  });
});
