const inMemoryMetrics = new Map();
let metricsRedisClient = null;

export const setMetricsRedisClient = client => {
  metricsRedisClient = client ?? null;
};

const serializeMetricKey = (metric, labels = {}) => {
  const sortedKeys = Object.keys(labels).sort();
  const parts = sortedKeys.map(key => `${key}:${labels[key]}`);
  return parts.length > 0 ? `${metric}|${parts.join('|')}` : metric;
};

export const recordCdnMetric = async (metric, value = 1, labels = {}) => {
  const key = serializeMetricKey(metric, labels);
  if (metricsRedisClient && typeof metricsRedisClient.hincrby === 'function') {
    await metricsRedisClient.hincrby('cdn_metrics', key, value);
    return;
  }

  const current = inMemoryMetrics.get(key) ?? 0;
  inMemoryMetrics.set(key, current + value);
};

export const getCdnMetricsSnapshot = async () => {
  if (metricsRedisClient && typeof metricsRedisClient.hgetall === 'function') {
    const snapshot = await metricsRedisClient.hgetall('cdn_metrics');
    if (!snapshot) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(snapshot).map(([key, val]) => [key, Number(val)])
    );
  }

  return Object.fromEntries(inMemoryMetrics.entries());
};

export const resetCdnMetricsStore = async () => {
  inMemoryMetrics.clear();
  if (metricsRedisClient && typeof metricsRedisClient.del === 'function') {
    await metricsRedisClient.del('cdn_metrics');
  }
};

export const __testing = {
  inMemoryMetrics,
  serializeMetricKey
};

try {
  if (typeof module !== 'undefined') {
    module.exports = {
      setMetricsRedisClient,
      recordCdnMetric,
      getCdnMetricsSnapshot,
      resetCdnMetricsStore,
      __testing
    };
  }
} catch {
  // no-op
}
