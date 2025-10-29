import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { z } from 'zod';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = Number(process.env.PORT || 5001);
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const validateJson = (schema) => (req, res, next) => {
  try {
    if (schema) {
      req.validatedBody = schema.parse(req.body ?? {});
    }
    next();
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message, issues: error.errors });
  }
};

const forwardRequest = async (res, path, init = {}) => {
  const url = new URL(path, FASTAPI_URL).toString();
  try {
    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    const body = Buffer.from(buffer);
    const text = body.toString();

    if (contentType.includes('application/json')) {
      if (!text) {
        res.status(response.status).send();
        return;
      }

      try {
        const json = JSON.parse(text);
        res.status(response.status).json(json);
      } catch {
        res.status(response.status).send(text);
      }
    } else if (body.length === 0) {
      res.status(response.status).send();
    } else {
      res
        .status(response.status)
        .set('content-type', contentType || 'application/octet-stream')
        .send(body);
    }
  } catch (error) {
    res.status(502).json({ ok: false, error: 'Failed to reach FastAPI service', details: error.message });
  }
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/ingest/pdf', upload.single('file'), async (req, res) => {
  const schema = z.object({
    projectId: z.string().optional(),
  }).passthrough();

  try {
    const safeBody = schema.parse(req.body ?? {});
    const formData = new FormData();

    if (req.file) {
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname || 'upload.pdf',
        contentType: req.file.mimetype,
      });
    }

    for (const [key, value] of Object.entries(safeBody)) {
      formData.append(key, value);
    }

    const query = new URLSearchParams(req.query).toString();
    const targetPath = query ? `/ingest/pdf?${query}` : '/ingest/pdf';

    await forwardRequest(res, targetPath, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders?.() ?? {},
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

const jsonEndpoints = [
  ['/ingest/bgg', 'POST'],
  ['/script/generate', 'POST'],
  ['/tts/generate', 'POST'],
  ['/render/compose', 'POST'],
  ['/project/save', 'POST'],
  ['/project/load', 'POST'],
  ['/project/export', 'POST'],
  ['/audio/duck', 'POST'],
];

jsonEndpoints.forEach(([path, method]) => {
  const routerMethod = method.toLowerCase();
  app[routerMethod](path, validateJson(z.any()), async (req, res) => {
    const query = new URLSearchParams(req.query).toString();
    const targetPath = query ? `${path}?${query}` : path;

    await forwardRequest(res, targetPath, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.validatedBody ?? req.body ?? {}),
    });
  });
});

app.get('/project/load', async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  const path = query ? `/project/load?${query}` : '/project/load';
  await forwardRequest(res, path, { method: 'GET' });
});

app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
