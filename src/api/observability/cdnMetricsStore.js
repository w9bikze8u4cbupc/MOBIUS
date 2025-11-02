const HISTORY_LIMIT = Number.parseInt(process.env.CDN_METRICS_HISTORY_LIMIT ?? '', 10) || 50;

let redisClient = null;

const totals = {
  requests: 0,
  hits: 0,
  misses: 0,
  errors: 0,
};

let recentEvents = [];
let lastUpdated = null;

const CACHE_HIT_VALUES = new Set(['HIT', 'TCP_HIT', 'UDP_HIT']);
const CACHE_MISS_VALUES = new Set(['MISS', 'TCP_MISS', 'UDP_MISS']);

function coerceStatusCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeCacheStatus(payload) {
  const candidates = [
    payload.cacheStatus,
    payload.cache_status,
    payload.cache_status_name,
    payload.status,
    payload.cache,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim().toUpperCase();
    }
  }

  if (typeof payload.hit === 'boolean') {
    return payload.hit ? 'HIT' : 'MISS';
  }

  if (typeof payload.cached === 'boolean') {
    return payload.cached ? 'HIT' : 'MISS';
  }

  return null;
}

function determineHitStatus(normalizedStatus, payload) {
  if (typeof payload.hit === 'boolean') {
    return payload.hit;
  }

  if (CACHE_HIT_VALUES.has(normalizedStatus)) {
    return true;
  }

  if (CACHE_MISS_VALUES.has(normalizedStatus)) {
    return false;
  }

  return null;
}

function isErrorStatusCode(statusCode) {
  if (typeof statusCode !== 'number') {
    return false;
  }

  return statusCode >= 500 && statusCode < 600;
}

function cloneEvent(event) {
  return Object.freeze({ ...event });
}

function mirrorEventToRedis(event) {
  if (!redisClient || typeof redisClient.multi !== 'function') {
    return Promise.resolve();
  }

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
    return multi.exec();
  } catch (error) {
    console.warn('Failed to mirror CDN metrics to Redis:', error);
    return Promise.resolve();
  }
}

export function setMetricsRedisClient(client) {
  redisClient = client ?? null;
}

export function resetCdnMetricsStore() {
  totals.requests = 0;
  totals.hits = 0;
  totals.misses = 0;
  totals.errors = 0;
  recentEvents = [];
  lastUpdated = null;
}

export function getCdnMetricsSnapshot() {
  return Object.freeze({
    totals: Object.freeze({
      requests: totals.requests,
      hits: totals.hits,
      misses: totals.misses,
      errors: totals.errors,
    }),
    recentEvents: Object.freeze(recentEvents.map(cloneEvent)),
    lastUpdated,
  });
}

export async function recordCdnEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('CDN observability payload must be an object');
  }

  const statusCode = coerceStatusCode(payload.statusCode ?? payload.status_code);
  const cacheStatus = normalizeCacheStatus(payload);
  const hit = determineHitStatus(cacheStatus, payload);
  const error = isErrorStatusCode(statusCode);

  const event = {
    cacheStatus,
    hit,
    statusCode,
    error,
    metadata: payload.metadata ?? null,
    timestamp: new Date().toISOString(),
  };

  if (payload.edgeLocation) {
    event.edgeLocation = payload.edgeLocation;
  }

  if (payload.region) {
    event.region = payload.region;
  }

  if (typeof payload.url === 'string') {
    event.url = payload.url;
  }

  totals.requests += 1;
  if (hit === true) {
    totals.hits += 1;
  } else if (hit === false) {
    totals.misses += 1;
  }

  if (error) {
    totals.errors += 1;
  }

  recentEvents = [event, ...recentEvents].slice(0, HISTORY_LIMIT);
  lastUpdated = event.timestamp;

  await mirrorEventToRedis(event);

  return getCdnMetricsSnapshot();
}
