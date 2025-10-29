import crypto from 'node:crypto';
import express from 'express';
import morgan from 'morgan';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = Number(process.env.PORT || 5001);
const INGEST_SERVICE_URL = process.env.INGEST_SERVICE_URL || 'http://127.0.0.1:8001';

const RATE_CAPACITY = Number(process.env.RATE_CAPACITY || 60);
const RATE_REFILL_PER_SEC = Number(process.env.RATE_REFILL_PER_SEC || 15);
const buckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

app.use((req, res, next) => {
  const now = Date.now();
  const bucketKey = req.ip || req.headers['x-forwarded-for'] || 'anonymous';
  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = { tokens: RATE_CAPACITY, lastRefill: now };
    buckets.set(bucketKey, bucket);
  }
  const elapsed = (now - bucket.lastRefill) / 1000;
  if (elapsed > 0) {
    const refill = elapsed * RATE_REFILL_PER_SEC;
    bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + refill);
    bucket.lastRefill = now;
  }
  if (bucket.tokens < 1) {
    return res.status(429).json({ ok: false, error: 'rate_limit_exceeded', details: { retryAfter: 1 } });
  }
  bucket.tokens -= 1;
  return next();
});

app.use((req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim() ? incomingId : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

function logUpstream(route, ms, status) {
  console.info(`[gateway] ${route} -> ${status} (${ms.toFixed(2)}ms)`);
}

async function forwardJson(req, res, path, method = 'POST') {
  try {
    const url = new URL(path, INGEST_SERVICE_URL);
    const start = process.hrtime.bigint();
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-request-id': req.requestId,
      },
      body: method === 'GET' ? undefined : JSON.stringify(req.body ?? {}),
    });
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    logUpstream(path, elapsed, response.status);
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: 'upstream_error', details: payload });
    }
    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('[gateway] forwardJson error', error);
    return res.status(502).json({ ok: false, error: 'gateway_failure', details: String(error) });
  }
}

async function forwardGetWithRetry(req, res, path) {
  const url = new URL(path, INGEST_SERVICE_URL);
  const search = req.query ?? {};
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;
    try {
      const start = process.hrtime.bigint();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-request-id': req.requestId,
        },
      });
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      logUpstream(path, elapsed, response.status);
      if ((response.status === 502 || response.status === 503) && attempt === 1) {
        continue;
      }
      const text = await response.text();
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          payload = { raw: text };
        }
      }
      if (!response.ok) {
        return res.status(response.status).json({ ok: false, error: 'upstream_error', details: payload });
      }
      return res.status(response.status).json(payload);
    } catch (error) {
      if (attempt >= 2) {
        console.error('[gateway] forwardGet error', error);
        return res.status(502).json({ ok: false, error: 'gateway_failure', details: String(error) });
      }
    }
  }
  return res.status(502).json({ ok: false, error: 'gateway_failure', details: 'retry_exhausted' });
}

app.get('/health', async (req, res) => {
  try {
    const response = await fetch(new URL('/health', INGEST_SERVICE_URL));
    const data = await response.json();
    return res.status(200).json({ ok: true, upstream: data });
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'upstream_unreachable', details: String(error) });
  }
});

app.get('/version', (req, res) => {
  return res.json({
    ok: true,
    commit: process.env.GIT_COMMIT || null,
    node: process.version,
    ingestServiceUrl: INGEST_SERVICE_URL,
  });
});

app.post('/ingest/bgg', (req, res) => forwardJson(req, res, '/ingest/bgg'));

app.post('/ingest/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'missing_file' });
  }
  const projectId = req.body?.projectId;
  if (!projectId) {
    return res.status(400).json({ ok: false, error: 'missing_project_id' });
  }
  const heuristics = req.query?.heuristics === 'true';
  try {
    const url = new URL('/ingest/pdf', INGEST_SERVICE_URL);
    url.searchParams.set('heuristics', heuristics ? 'true' : 'false');
    const formData = new FormData();
    formData.set('projectId', projectId);
    const blob = new Blob([req.file.buffer]);
    formData.set('file', blob, req.file.originalname);
    const start = process.hrtime.bigint();
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'x-request-id': req.requestId,
      },
    });
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    logUpstream('/ingest/pdf', elapsed, response.status);
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: 'upstream_error', details: payload });
    }
    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('[gateway] ingest/pdf error', error);
    return res.status(502).json({ ok: false, error: 'gateway_failure', details: String(error) });
  }
});

app.post('/script/generate', (req, res) => forwardJson(req, res, '/script/generate'));
app.post('/tts/generate', (req, res) => forwardJson(req, res, '/tts/generate'));
app.post('/render/compose', (req, res) => forwardJson(req, res, '/render/compose'));
app.post('/project/save', (req, res) => forwardJson(req, res, '/project/save'));
app.post('/project/export', (req, res) => forwardJson(req, res, '/project/export'));
app.post('/project/load', (req, res) => forwardJson(req, res, '/project/load'));
app.get('/project/load', (req, res) => forwardGetWithRetry(req, res, '/project/load'));
app.get('/project/export/status', (req, res) => forwardGetWithRetry(req, res, '/project/export/status'));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'payload_too_large' });
  }
  console.error('[gateway] unhandled error', err);
  return res.status(500).json({ ok: false, error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`API Gateway listening on ${PORT}, proxying to ${INGEST_SERVICE_URL}`);
});
