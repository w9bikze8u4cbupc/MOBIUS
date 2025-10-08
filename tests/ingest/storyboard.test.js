import { generateStoryboard } from '../../src/ingest/storyboard.js';

describe('generateStoryboard', () => {
  it('creates a minimal storyboard for simple parsedPages', () => {
    const out = generateStoryboard({ parsedPages: [{ pageNumber: 1, text: 'Setup: Place the board. Gameplay: Take turns.' }] });
    expect(out).toBeDefined();
    expect(out.scenes.length).toBeGreaterThan(0);
  });
});