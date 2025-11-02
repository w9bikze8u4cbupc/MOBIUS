// @ts-nocheck

const {
  recordCdnMetric,
  getCdnMetricsSnapshot,
  resetCdnMetrics,
  getRecentCdnEvents,
} = require('../api/observability/cdnMetricsStore.js');

describe('cdnMetricsStore', () => {
  beforeEach(() => {
    resetCdnMetrics();
  });

  test('records metrics and updates totals', () => {
    recordCdnMetric({ cacheStatus: 'hit', statusCode: 200, service: 'cloudflare', host: 'example.com', path: '/foo', latencyMs: 12 });
    recordCdnMetric({ cacheStatus: 'MISS', statusCode: 504, service: 'akamai', host: 'example.com', path: '/foo', latencyMs: 120 });

    const snapshot = getCdnMetricsSnapshot();
    expect(snapshot.totals.requests).toBe(2);
    expect(snapshot.totals.hits).toBe(1);
    expect(snapshot.totals.misses).toBe(1);
    expect(snapshot.totals.errors).toBe(1);
    expect(snapshot.recentEvents).toHaveLength(2);
    expect(snapshot.recentEvents[0].cacheStatus).toBe('HIT');
  });

  test('throws on invalid payloads', () => {
    expect(() => recordCdnMetric(null)).toThrow('Metric payload must be an object');
  });

  test('returns copies of stored events', () => {
    const event = recordCdnMetric({ cacheStatus: 'HIT', statusCode: 200, service: 'cloudflare' });
    const events = getRecentCdnEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).not.toBe(event);
    events[0].cacheStatus = 'MUTATED';
    const snapshot = getCdnMetricsSnapshot();
    expect(snapshot.recentEvents[0].cacheStatus).toBe('HIT');
  });
});
