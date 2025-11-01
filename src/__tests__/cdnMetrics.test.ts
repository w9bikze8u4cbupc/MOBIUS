// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCdnMetricsSnapshot, onCdnMetric, recordCdnMetric } = require('../observability/cdnMetrics.js');

describe('cdnMetrics', () => {
  it('aggregates hit and miss counters', () => {
    const unsubscribe = onCdnMetric(() => undefined);
    recordCdnMetric({ cdn: 'cloudflare', cacheStatus: 'HIT', url: '/preview' });
    recordCdnMetric({ cdn: 'cloudflare', cacheStatus: 'MISS', url: '/preview' });
    recordCdnMetric({ cdn: 'akamai', cacheStatus: 'BYPASS', url: '/preview' });
    unsubscribe();

    const snapshot = getCdnMetricsSnapshot();
    expect(snapshot.hits).toBeGreaterThanOrEqual(1);
    expect(snapshot.misses).toBeGreaterThanOrEqual(1);
    expect(snapshot.bypass).toBeGreaterThanOrEqual(1);
    expect(snapshot.samples.length).toBeGreaterThanOrEqual(3);
  });
});
