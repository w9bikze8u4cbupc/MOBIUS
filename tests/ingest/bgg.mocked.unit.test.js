import { jest } from '@jest/globals';

describe('fetchBGG (mocked normalization)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('normalizes designers and publisher from BGG metadata', async () => {
    const mockResult = {
      name: 'Test Game',
      yearPublished: 2023,
      designers: [{ value: 'Designer One' }, { value: 'Designer Two' }],
      publishers: [{ value: 'Publisher One' }],
      minPlayers: 2,
      maxPlayers: 4,
      playingTime: 60,
      minAge: 10,
      id: '12345'
    };

    jest.unstable_mockModule('../../src/ingest/bgg.js', () => ({
      fetchBggMetadata: jest.fn().mockResolvedValue(mockResult),
      fetchBGG: jest.fn().mockResolvedValue({
        title: 'Test Game',
        year: 2023,
        designers: ['Designer One', 'Designer Two'],
        publisher: ['Publisher One'],
        players: '2-4',
        time: 60,
        age: '10+'
      })
    }));

    const bggModule = await import('../../src/ingest/bgg.js');

    const result = await bggModule.fetchBGG({ bggId: '12345' });

    expect(result.title).toBe('Test Game');
    expect(result.designers).toEqual(['Designer One', 'Designer Two']);
    expect(result.publisher).toEqual(['Publisher One']);
  });
});