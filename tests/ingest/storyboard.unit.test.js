import { buildStoryboard } from '../../src/ingest/storyboard.js';

describe('buildStoryboard', () => {
  it('builds chapters/steps with sane limits and non-empty output', async () => {
    // Create mock data
    const chunks = [
      { pageNumber: 1, text: 'First chunk of text content' },
      { pageNumber: 2, text: 'Second chunk of text content' },
      { pageNumber: 3, text: 'Third chunk of text content' }
    ];
    
    const toc = null;
    const bgg = null;
    const opts = { maxChapterLen: 2 }; // Limit chapters to 2 chunks each
    
    const result = await buildStoryboard({ chunks, toc, bgg, opts });
    
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.generatedAt).toBeDefined();
    expect(result.chapters).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
    
    // Check that chapters are created with the right structure
    const firstChapter = result.chapters[0];
    expect(firstChapter.id).toBeDefined();
    expect(firstChapter.title).toBeDefined();
    expect(firstChapter.chunks).toBeDefined();
    expect(firstChapter.steps).toBeDefined();
    expect(firstChapter.meta).toBeDefined();
    
    // Check that the meta information is correct
    expect(result.meta.totalChapters).toBe(result.chapters.length);
    expect(result.meta.totalChunks).toBe(chunks.length);
    expect(result.meta.tocDetected).toBe(!!toc);
  });
});