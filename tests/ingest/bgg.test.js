import { fetchBggMetadata } from '../../src/ingest/bgg.js';

describe('fetchBggMetadata', () => {
  it('returns raw for invalid id', async () => {
    const res = await fetchBggMetadata('0');
    expect(res).toBeDefined();
  });
});