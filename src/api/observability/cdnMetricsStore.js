const MAX_EVENTS = 500;

let totals = {
  requests: 0,
  hits: 0,
  misses: 0,
  errors: 0,
};
let events = [];
let lastUpdated = null;
let promRedis = null;

function setMetricsRedisClient(client) {
  promRedis = client || null;
}

function recordCdnMetric(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Metric payload must be an object');
  }

  const timestamp = new Date().toISOString();
  const normalised = { ...payload };
  const rawStatus = (payload.cacheStatus || payload.cache_status || '')
    .toString()
    .trim()
    .toUpperCase();

  if (rawStatus) {
    if (normalised.hit === undefined) {
      normalised.hit = rawStatus === 'HIT';
    }
    if (normalised.miss === undefined) {
      normalised.miss = rawStatus === 'MISS';
    }
  }

  if (typeof payload.statusCode === 'number' && payload.statusCode >= 500) {
    normalised.error = true;
  }

  const entry = { ...normalised, timestamp };

  totals.requests += 1;
  if (entry.hit) totals.hits += 1;
  if (entry.miss) totals.misses += 1;
  if (entry.error) totals.errors += 1;

  if (promRedis && typeof promRedis.lpush === 'function') {
    try {
      promRedis.lpush('cdn:events', JSON.stringify(entry));
      promRedis.ltrim('cdn:events', 0, MAX_EVENTS - 1);
    } catch (err) {
      console.warn('Failed to push CDN metric to Redis, falling back to in-memory store:', err);
    }
  }

  events.push(entry);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }

  lastUpdated = timestamp;
  return entry;
}

function getCdnMetricsSnapshot() {
  return {
    totals: { ...totals },
    lastUpdated,
    recentEvents: events.map((event) => ({ ...event })),
  };
}

module.exports = {
  recordCdnMetric,
  getCdnMetricsSnapshot,
  setMetricsRedisClient,
};
