import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import morgan from 'morgan';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;
const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://127.0.0.1:8000';

app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

function buildUrl(pathname, query = undefined) {
  const url = new URL(pathname, FASTAPI_URL);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
  }
  return url.toString();
}

async function forwardJson(pathname, req, res, method = 'POST') {
  try {
    const response = await fetch(buildUrl(pathname), {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(req.body ?? {}),
    });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    console.error(`Failed to forward ${pathname}:`, error);
    res.status(502).json({ error: 'upstream_error', message: String(error) });
  }
}

app.get('/health', async (_req, res) => {
  try {
    const response = await fetch(buildUrl('/health'));
    const payload = await response.json();
    res.json({ status: 'ok', upstream: payload });
  } catch (error) {
    res.status(503).json({ status: 'error', message: String(error) });
  }
});

app.post('/ingest/bgg', (req, res) => forwardJson('/ingest/bgg', req, res));
app.post('/script/generate', (req, res) => forwardJson('/script/generate', req, res));
app.post('/tts/generate', (req, res) => forwardJson('/tts/generate', req, res));
app.post('/render/compose', (req, res) => forwardJson('/render/compose', req, res));
app.post('/project/export', (req, res) => forwardJson('/project/export', req, res));
app.get('/project/export/status', (req, res) => {
  const query = new URLSearchParams(req.query);
  const queryString = query.toString();
  const url = queryString
    ? `${buildUrl('/project/export/status')}?${queryString}`
    : buildUrl('/project/export/status');
  fetch(url)
    .then(async (response) => {
      const payload = await response.json();
      res.status(response.status).json(payload);
    })
    .catch((error) => {
      console.error('Failed to get export status:', error);
      res.status(502).json({ error: 'upstream_error', message: String(error) });
    });
});

app.post('/ingest/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'validation_error', message: 'file is required' });
  }
  if (!req.body?.projectId) {
    return res.status(400).json({ error: 'validation_error', message: 'projectId is required' });
  }

  try {
    const formData = new FormData();
    formData.append('projectId', req.body.projectId);
    formData.append('file', new Blob([req.file.buffer]), req.file.originalname);

    const heuristics = req.query?.heuristics;
    const query = {};
    if (heuristics !== undefined) {
      query.heuristics = heuristics;
    }

    const response = await fetch(buildUrl('/ingest/pdf', query), {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Failed to proxy PDF ingest:', error);
    res.status(502).json({ error: 'upstream_error', message: String(error) });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

app.listen(PORT, () => {
  console.log(`API Gateway listening on http://127.0.0.1:${PORT}`);
});
