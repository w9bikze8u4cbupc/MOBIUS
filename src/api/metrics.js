// Simple metrics implementation
import client from 'prom-client';

// Create build info metric
const buildInfo = new client.Gauge({
  name: 'build_info',
  help: 'Static 1 with build labels',
  labelNames: ['version', 'commit', 'env'],
});

// Set build info with default values
buildInfo.set(
  {
    version: process.env.APP_VERSION || 'dev',
    commit: process.env.GIT_COMMIT || 'local',
    env: process.env.NODE_ENV || 'development',
  },
  1,
);

const metrics = {
  ttsRequestsTotal: 0,
  ttsCacheHitsTotal: 0,
  extractPdfSeconds: [],
  renderSeconds: [],
  httpRequestDurationSeconds: [],
};

// Function to record TTS request
function recordTtsRequest() {
  metrics.ttsRequestsTotal++;
}

// Function to record TTS cache hit
function recordTtsCacheHit() {
  metrics.ttsCacheHitsTotal++;
}

// Function to record PDF extraction duration
function recordExtractPdfDuration(durationSeconds) {
  metrics.extractPdfSeconds.push({
    duration: durationSeconds,
    timestamp: Date.now(),
  });
}

// Function to record render duration
function recordRenderDuration(durationSeconds) {
  metrics.renderSeconds.push({
    duration: durationSeconds,
    timestamp: Date.now(),
  });
}

// Function to record HTTP request duration
function recordHttpRequestDuration(durationSeconds) {
  metrics.httpRequestDurationSeconds.push({
    duration: durationSeconds,
    timestamp: Date.now(),
  });
}

// Function to get metrics in Prometheus format
function getMetrics() {
  let result = '';

  // Build info
  result += '# HELP build_info Static 1 with build labels\n';
  result += '# TYPE build_info gauge\n';
  result += `build_info{version="${process.env.APP_VERSION || 'dev'}",commit="${process.env.GIT_COMMIT || 'local'}",env="${process.env.NODE_ENV || 'development'}"} 1\n\n`;

  // TTS requests total
  result += '# HELP tts_requests_total Total number of TTS requests\n';
  result += '# TYPE tts_requests_total counter\n';
  result += `tts_requests_total ${metrics.ttsRequestsTotal}\n\n`;

  // TTS cache hits total
  result += '# HELP tts_cache_hits_total Total number of TTS cache hits\n';
  result += '# TYPE tts_cache_hits_total counter\n';
  result += `tts_cache_hits_total ${metrics.ttsCacheHitsTotal}\n\n`;

  // PDF extraction duration histogram
  result += '# HELP extract_pdf_seconds PDF extraction duration in seconds\n';
  result += '# TYPE extract_pdf_seconds histogram\n';
  for (const entry of metrics.extractPdfSeconds) {
    result += `extract_pdf_seconds_bucket{le="${entry.duration}"} 1\n`;
  }
  if (metrics.extractPdfSeconds.length > 0) {
    const sum = metrics.extractPdfSeconds.reduce((acc, entry) => acc + entry.duration, 0);
    result += `extract_pdf_seconds_sum ${sum}\n`;
    result += `extract_pdf_seconds_count ${metrics.extractPdfSeconds.length}\n\n`;
  }

  // Render duration histogram
  result += '# HELP render_seconds Render duration in seconds\n';
  result += '# TYPE render_seconds histogram\n';
  for (const entry of metrics.renderSeconds) {
    result += `render_seconds_bucket{le="${entry.duration}"} 1\n`;
  }
  if (metrics.renderSeconds.length > 0) {
    const sum = metrics.renderSeconds.reduce((acc, entry) => acc + entry.duration, 0);
    result += `render_seconds_sum ${sum}\n`;
    result += `render_seconds_count ${metrics.renderSeconds.length}\n\n`;
  }

  // HTTP request duration histogram
  result += '# HELP http_request_duration_seconds HTTP request duration in seconds\n';
  result += '# TYPE http_request_duration_seconds histogram\n';
  for (const entry of metrics.httpRequestDurationSeconds) {
    result += `http_request_duration_seconds_bucket{le="${entry.duration}"} 1\n`;
  }
  if (metrics.httpRequestDurationSeconds.length > 0) {
    const sum = metrics.httpRequestDurationSeconds.reduce((acc, entry) => acc + entry.duration, 0);
    result += `http_request_duration_seconds_sum ${sum}\n`;
    result += `http_request_duration_seconds_count ${metrics.httpRequestDurationSeconds.length}\n\n`;
  }

  return result;
}

export {
  recordTtsRequest,
  recordTtsCacheHit,
  recordExtractPdfDuration,
  recordRenderDuration,
  recordHttpRequestDuration,
  getMetrics,
};
