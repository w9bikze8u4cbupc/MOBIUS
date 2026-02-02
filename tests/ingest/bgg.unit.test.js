import { jest } from '@jest/globals';

describe('fetchBGG (validation)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('rejects invalid inputs', async () => {
    const bggModule = await import('../../src/ingest/bgg.js');

    await expect(bggModule.fetchBGG({ bggId: 'invalid' }))
      .rejects
      .toThrow('Invalid BGG ID');

    await expect(bggModule.fetchBGG({}))
      .rejects
      .toThrow('requires at least one of');
  });
});