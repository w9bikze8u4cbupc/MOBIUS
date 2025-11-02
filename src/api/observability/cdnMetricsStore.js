const HISTORY_LIMIT = 200;

let totals = {
  requests: 0,
  hits: 0,
  misses: 0,
  errors: 0,
};

let recentEvents = [];
let lastUpdated = null;
let redisClient;

export function setMetricsRedisClient(client) {
  redisClient = client;
}

function normaliseMetricPayload(payload = {}) {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid payload: expected object');
  }

  const statusCodeRaw = payload.statusCode ?? payload.status_code;
  const statusCode = Number.isFinite(Number(statusCodeRaw))
    ? Number(statusCodeRaw)
    : undefined;

  const cacheStatusRaw = payload.cacheStatus ?? payload.cache_status;
  const cacheStatus = typeof cacheStatusRaw === 'string' ? cacheStatusRaw.toUpperCase() : undefined;

  const hitFlag = typeof payload.hit === 'boolean' ? payload.hit : cacheStatus === 'HIT';
  const missFlag = typeof payload.miss === 'boolean' ? payload.miss : cacheStatus === 'MISS';
  const errorFlag = typeof payload.error === 'boolean' ? payload.error : false;

  const url = typeof payload.url === 'string' ? payload.url : undefined;
  const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : undefined;
  const edge = typeof payload.edge === 'string' ? payload.edge : undefined;

  return {
    cacheStatus,
    error: errorFlag || (typeof statusCode === 'number' && statusCode >= 500),
    hit: hitFlag,
    miss: missFlag,
    statusCode,
    url,
    method,
    edge
  };
}

async function mirrorEventToRedis(event) {
  if (!redisClient || typeof redisClient.multi !== 'function') return;
  try {
    const multi = redisClient.multi();
    multi.hset('cdnMetrics:totals', {
      requests: String(totals.requests),
      hits: String(totals.hits),
      misses: String(totals.misses),
      errors: String(totals.errors),
    });
    multi.lpush('cdnMetrics:recentEvents', JSON.stringify(event));
    multi.ltrim('cdnMetrics:recentEvents', 0, HISTORY_LIMIT - 1);
    if (lastUpdated) {
      multi.set('cdnMetrics:lastUpdated', lastUpdated);
    }
    await multi.exec();
  } catch (error) {
    console.warn('Failed to mirror CDN metrics to Redis:', error);
  }
}

export function recordCdnMetric(payload) {
  const timestamp = new Date().toISOString();
  const normalised = normaliseMetricPayload(payload);

  const entry = { ...normalised, timestamp };

  totals = {
    requests: totals.requests + 1,
    hits: totals.hits + (entry.hit ? 1 : 0),
    misses: totals.misses + (entry.miss ? 1 : 0),
    errors: totals.errors + (entry.error ? 1 : 0),
  };

  lastUpdated = timestamp;
  recentEvents = [{ ...entry }, ...recentEvents].slice(0, HISTORY_LIMIT);

  // Fire and forget; never fail ingestion due to Redis
  Promise.resolve(mirrorEventToRedis(entry)).catch(() => {});

  return entry;
}

export function getCdnMetricsSnapshot() {
  return {
    totals: { ...totals },
    recentEvents: recentEvents.map((event) => ({ ...event })),
    lastUpdated,
  };
}

export function resetCdnMetricsStore() {
  totals = {
    requests: 0,
    hits: 0,
    misses: 0,
    errors: 0,
  };
  recentEvents = [];
  lastUpdated = null;
}

export const __testing = {
  get redisClient() {
    return redisClient;
  },
  set redisClient(client) {
    redisClient = client;
  },
  get totals() {
    return totals;
  },
  get recentEvents() {
    return recentEvents;
  },
  get lastUpdated() {
    return lastUpdated;
  },
};

