const MAX_EVENTS = 500;

let promRedis = null;
let RedisClient = null;
(async () => {
  if (!process.env.REDIS_URL) return;
  try {
    const mod = await import('ioredis');
    RedisClient = mod.default ?? mod;
    promRedis = new RedisClient(process.env.REDIS_URL);
    promRedis.on('error', (err) => {
      console.error('Redis (observability) error:', err);
    });
  } catch (err) {
    console.warn('Observability Redis disabled:', err?.message ?? err);
  }
})();

let totals = {
  requests: 0,
  hits: 0,
  misses: 0,
  errors: 0,
};
let events = [];
let lastUpdated = null;

function recordCdnMetric(payload) {
  const timestamp = new Date().toISOString();
  const entry = { ...payload, timestamp };
  totals.requests += 1;
  if (payload?.hit) totals.hits += 1;
  if (payload?.miss) totals.misses += 1;
  if (payload?.error) totals.errors += 1;

  if (promRedis) {
    promRedis.lpush('cdn:events', JSON.stringify(entry));
    promRedis.ltrim('cdn:events', 0, MAX_EVENTS - 1);
  } else {
    events.push(entry);
    if (events.length > MAX_EVENTS) {
      events = events.slice(events.length - MAX_EVENTS);
    }
  }

  lastUpdated = timestamp;
  return entry;
}

function getCdnMetricsSnapshot() {
  if (!promRedis) {
    return {
      totals: { ...totals },
      lastUpdated,
      recentEvents: events.map((event) => ({ ...event })),
    };
  }

  return promRedis
    .lrange('cdn:events', 0, MAX_EVENTS - 1)
    .then((raw) => ({
      totals: { ...totals },
      lastUpdated: new Date().toISOString(),
      recentEvents: raw.map((item) => {
        try {
          return JSON.parse(item);
        } catch (err) {
          console.warn('Failed to parse CDN metric from Redis:', err);
          return null;
        }
      }).filter(Boolean),
    }));
}

export { recordCdnMetric, getCdnMetricsSnapshot };

