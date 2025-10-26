/**
 * Lightweight metrics counters for the ingestion pipeline
 */

// Simple in-memory metrics storage
const metrics = {
  ingestAttempts: 0,
  ingestFailures: 0,
  ingestSuccesses: 0,
  llmCalls: 0,
  llmTokens: 0,
  pdfParseSuccesses: 0,
  pdfParseFailures: 0,
  ocrAttempts: 0,
  ocrSuccesses: 0,
  bggFetches: 0,
  bggFailures: 0
};

// Metrics counter functions
export function incrementIngestAttempts() {
  metrics.ingestAttempts++;
}

export function incrementIngestFailures() {
  metrics.ingestFailures++;
}

export function incrementIngestSuccesses() {
  metrics.ingestSuccesses++;
}

export function incrementLlmCalls() {
  metrics.llmCalls++;
}

export function addLlmTokens(tokens) {
  metrics.llmTokens += tokens;
}

export function incrementPdfParseSuccesses() {
  metrics.pdfParseSuccesses++;
}

export function incrementPdfParseFailures() {
  metrics.pdfParseFailures++;
}

export function incrementOcrAttempts() {
  metrics.ocrAttempts++;
}

export function incrementOcrSuccesses() {
  metrics.ocrSuccesses++;
}

export function incrementBggFetches() {
  metrics.bggFetches++;
}

export function incrementBggFailures() {
  metrics.bggFailures++;
}

// Get current metrics
export function getMetrics() {
  return { ...metrics };
}

// Reset metrics (useful for testing)
export function resetMetrics() {
  Object.keys(metrics).forEach(key => {
    metrics[key] = 0;
  });
}

export default {
  incrementIngestAttempts,
  incrementIngestFailures,
  incrementIngestSuccesses,
  incrementLlmCalls,
  addLlmTokens,
  incrementPdfParseSuccesses,
  incrementPdfParseFailures,
  incrementOcrAttempts,
  incrementOcrSuccesses,
  incrementBggFetches,
  incrementBggFailures,
  getMetrics,
  resetMetrics
};