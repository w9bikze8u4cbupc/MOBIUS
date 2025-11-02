const MAX_EVENTS = 200;

const initialTotals = () => ({
  requests: 0,
  hits: 0,
  misses: 0,
  errors: 0,
});

let totals = initialTotals();
let events = [];
let lastUpdated = null;

function normaliseString(value, fallback = 'unknown') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normaliseNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : fallback;
}

function recordCdnMetric(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Metric payload must be an object');
  }

  const timestamp = new Date().toISOString();
  const cacheStatus = normaliseString(payload.cacheStatus, 'UNKNOWN').toUpperCase();
  const statusCode = normaliseNumber(payload.statusCode, 0);

  const entry = {
    cacheStatus,
    statusCode,
    service: normaliseString(payload.service),
    host: normaliseString(payload.host),
    path: normaliseString(payload.path, '/'),
    latencyMs: normaliseNumber(payload.latencyMs, 0),
    edgeLocation: normaliseString(payload.edgeLocation),
    timestamp,
  };

  totals.requests += 1;
  if (entry.cacheStatus === 'HIT') {
    totals.hits += 1;
  } else if (entry.cacheStatus === 'MISS') {
    totals.misses += 1;
  }
  if (entry.statusCode >= 500) {
    totals.errors += 1;
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

function resetCdnMetrics() {
  totals = initialTotals();
  events = [];
  lastUpdated = null;
}

function getRecentCdnEvents() {
  return events.map((event) => ({ ...event }));
}

module.exports = {
  recordCdnMetric,
  getCdnMetricsSnapshot,
  resetCdnMetrics,
  getRecentCdnEvents,
  __TESTING__: {
    MAX_EVENTS,
  },
};
