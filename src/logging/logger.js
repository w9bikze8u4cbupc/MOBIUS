// src/logging/logger.js
import { performance } from 'perf_hooks';

function timeNow() {
  return new Date().toISOString();
}

export function createLogger(context = {}) {
  const base = { ts: timeNow(), ...context };
  return {
    info: (msg, extra = {}) => console.log(JSON.stringify({ level: 'info', msg, ...base, ...extra })),
    warn: (msg, extra = {}) => console.warn(JSON.stringify({ level: 'warn', msg, ...base, ...extra })),
    error: (msg, extra = {}) => console.error(JSON.stringify({ level: 'error', msg, ...base, ...extra })),
  };
}

export function requestLoggerMiddleware(req, res, next) {
  const start = performance.now();
  const requestId = (req.headers['x-request-id']?.toString()) || cryptoRandom();
  req.requestId = requestId;
  req.logger = createLogger({ requestId, path: req.path, method: req.method });

  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - start);
    req.logger.info('request_complete', { status: res.statusCode, durationMs });
  });

  next();
}

function cryptoRandom() {
  // lightweight unique-ish id without adding a dep
  return 'req_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}