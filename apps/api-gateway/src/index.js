/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');

const PORT = Number(process.env.PORT || 5001);
const INGEST_SERVICE_URL = process.env.INGEST_SERVICE_URL || 'http://127.0.0.1:8000';

async function ensureFormDataSupport() {
  const hasFormData = typeof globalThis.FormData !== 'undefined';
  const hasBlob = typeof globalThis.Blob !== 'undefined';
  const hasFetch = typeof globalThis.fetch === 'function';
  if (hasFormData && hasBlob) {
    if (hasFetch) {
      return;
    }
  }

  try {
    const undici = await import('undici');
    if (!hasFormData) {
      globalThis.FormData = undici.FormData;
    }
    if (!hasBlob) {
      globalThis.Blob = undici.Blob;
    }
    if (!hasFetch && typeof undici.fetch === 'function') {
      globalThis.fetch = undici.fetch;
    }
  } catch (error) {
    console.warn('Unable to load FormData/Blob polyfill from undici:', error);
  }
}

function buildTargetUrl(path, query) {
  const url = new URL(path, INGEST_SERVICE_URL);
  for (const [key, value] of Object.entries(query || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

async function forwardJson(path, req, res, method = 'POST') {
  try {
    const targetUrl = buildTargetUrl(path, req.query);
    const response = await fetch(targetUrl, {
      method,
      headers: {
        'content-type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify(req.body ?? {}),
    });
    const text = await response.text();
    const type = response.headers.get('content-type') || 'application/json';
    res.status(response.status).set('content-type', type).send(text);
  } catch (error) {
    console.error(`Error proxying ${method} ${path}:`, error);
    res.status(502).json({ ok: false, error: 'Upstream request failed' });
  }
}

async function forwardGet(path, req, res) {
  return forwardJson(path, req, res, 'GET');
}

async function forwardFormData(path, req, res) {
  try {
    const upload = multer().single('file');
    upload(req, res, async (err) => {
      if (err) {
        console.error('Failed to parse multipart body:', err);
        res.status(400).json({ ok: false, error: 'Invalid multipart request' });
        return;
      }
      try {
        const formData = new FormData();
        const { body, file } = req;
        Object.entries(body || {}).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach((item) => formData.append(key, item));
          } else if (value !== undefined) {
            formData.append(key, value);
          }
        });
        if (file) {
          const blob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
          formData.append(file.fieldname || 'file', blob, file.originalname || 'upload.bin');
        }

        const targetUrl = buildTargetUrl(path, req.query);
        const response = await fetch(targetUrl, {
          method: 'POST',
          body: formData,
        });
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const type = response.headers.get('content-type') || 'application/json';
        res.status(response.status).set('content-type', type).send(buffer);
      } catch (innerError) {
        console.error(`Error forwarding multipart request to ${path}:`, innerError);
        res.status(502).json({ ok: false, error: 'Upstream multipart request failed' });
      }
    });
  } catch (error) {
    console.error('Unexpected error during multipart forwarding:', error);
    res.status(500).json({ ok: false, error: 'Unexpected gateway error' });
  }
}

async function bootstrap() {
  await ensureFormDataSupport();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'Mobius API Gateway' });
  });

  app.post('/ingest/pdf', (req, res) => {
    forwardFormData('/ingest/pdf', req, res);
  });

  app.post('/ingest/bgg', (req, res) => forwardJson('/ingest/bgg', req, res));
  app.post('/script/generate', (req, res) => forwardJson('/script/generate', req, res));
  app.post('/tts/generate', (req, res) => forwardJson('/tts/generate', req, res));
  app.post('/render/compose', (req, res) => forwardJson('/render/compose', req, res));

  app.post('/project/save', (req, res) => forwardJson('/project/save', req, res));
  app.post('/project/load', (req, res) => forwardJson('/project/load', req, res));
  app.get('/project/load', (req, res) => forwardGet('/project/load', req, res));
  app.get('/project/manifest', (req, res) => forwardGet('/project/manifest', req, res));

  app.post('/project/export', (req, res) => forwardJson('/project/export', req, res));
  app.get('/project/export/status', (req, res) => forwardGet('/project/export/status', req, res));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Route not found' });
  });

  app.listen(PORT, () => {
    console.log(`API gateway listening on http://127.0.0.1:${PORT}`);
    console.log(`Forwarding requests to ${INGEST_SERVICE_URL}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start API gateway:', error);
  process.exitCode = 1;
});
