const EventEmitter = require('events');

const metrics = {
  hits: 0,
  misses: 0,
  bypass: 0,
  lastEventAt: null,
  samples: [],
};

const stream = new EventEmitter();
const MAX_SAMPLES = 50;

function normaliseStatus(status = '') {
  const normalized = String(status).toLowerCase();
  if (normalized.includes('hit')) return 'hit';
  if (normalized.includes('miss')) return 'miss';
  if (normalized.includes('bypass') || normalized.includes('expired')) return 'bypass';
  return 'unknown';
}

function recordCdnMetric(event) {
  const timestamp = event?.timestamp ? new Date(event.timestamp) : new Date();
  const status = normaliseStatus(event?.cacheStatus);
  const sample = {
    cdn: event?.cdn || 'unknown',
    status,
    edge: event?.edge || 'unknown',
    url: event?.url || 'unknown',
    timestamp: timestamp.toISOString(),
    cacheKey: event?.cacheKey || null,
  };

  switch (status) {
    case 'hit':
      metrics.hits += 1;
      break;
    case 'miss':
      metrics.misses += 1;
      break;
    case 'bypass':
      metrics.bypass += 1;
      break;
    default:
      break;
  }

  metrics.lastEventAt = sample.timestamp;
  metrics.samples.unshift(sample);
  if (metrics.samples.length > MAX_SAMPLES) {
    metrics.samples.length = MAX_SAMPLES;
  }

  stream.emit('metric', sample);
  return sample;
}

function getCdnMetricsSnapshot() {
  return {
    hits: metrics.hits,
    misses: metrics.misses,
    bypass: metrics.bypass,
    lastEventAt: metrics.lastEventAt,
    samples: metrics.samples.slice(),
  };
}

function onCdnMetric(listener) {
  stream.on('metric', listener);
  return () => stream.off('metric', listener);
}

module.exports = {
  recordCdnMetric,
  getCdnMetricsSnapshot,
  onCdnMetric,
};
