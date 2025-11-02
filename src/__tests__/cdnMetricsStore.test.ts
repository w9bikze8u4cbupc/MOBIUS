const {
  recordCdnMetric,
  getCdnMetricsSnapshot,
} = require('../api/observability/cdnMetricsStore.js');

describe('cdnMetricsStore', () => {
  test('records metrics and updates totals', () => {
    recordCdnMetric({ cacheStatus: 'hit', statusCode: 200, service: 'cloudflare', host: 'example.com', path: '/foo', latencyMs: 12 });
    recordCdnMetric({ miss: true, statusCode: 504, service: 'akamai', host: 'example.com', path: '/foo', latencyMs: 120 });

    const snapshot = getCdnMetricsSnapshot();
    expect(snapshot.totals.requests).toBe(2);
    expect(snapshot.totals.hits).toBe(1);
    expect(snapshot.totals.misses).toBe(1);
    expect(snapshot.totals.errors).toBe(1);
    expect(snapshot.recentEvents).toHaveLength(2);
    expect(typeof snapshot.recentEvents[0].timestamp).toBe('string');

    const originalCacheStatus = snapshot.recentEvents[0].cacheStatus;
    snapshot.recentEvents[0].cacheStatus = 'MUTATED';
    const postMutationSnapshot = getCdnMetricsSnapshot();
    expect(postMutationSnapshot.recentEvents[0].cacheStatus).toBe(originalCacheStatus);
  });

  test('throws on invalid payloads', () => {
    expect(() => recordCdnMetric(null as any)).toThrow('Metric payload must be an object');
  });
});
