import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { ensureStorageLayout, upload, paths } from './storage.js';
import { listProjects, getProjectById, upsertProject } from './db.js';

import { fetchMetadataStub } from './stubs/bgg.js';
import { parseRulebookStub } from './stubs/rulebook.js';
import { generateScriptStub } from './stubs/script.js';
import { processAssetsStub } from './stubs/assets.js';
import { generateAudioStub } from './stubs/audio.js';
import { generateCaptionsStub } from './stubs/captions.js';
import { renderPreviewStub, renderFullStub } from './stubs/render.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const API_PREFIX = '/api';

app.disable('x-powered-by');
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static access to uploads/output for previewing assets in dev
app.use('/uploads', express.static(path.resolve(paths.UPLOADS_ROOT)));
app.use('/output', express.static(path.resolve(paths.OUTPUT_ROOT)));

// Health check
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Mobius backend online',
    timestamp: new Date().toISOString(),
  });
});

// Projects listing (for UI dashboard)
app.get(`${API_PREFIX}/projects`, async (_req, res, next) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

// Retrieve single project
app.get(`${API_PREFIX}/projects/:projectId`, async (req, res, next) => {
  try {
    const project = await getProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

// Create or update project baseline
app.post(`${API_PREFIX}/projects`, async (req, res, next) => {
  try {
    const {
      externalId,
      name,
      language,
      voiceId,
      detailBoost,
      metadata,
      script,
      assets,
      audio,
      captions,
      render,
      status,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await upsertProject({
      externalId,
      name,
      language,
      voiceId,
      detailBoost,
      metadata,
      script,
      assets,
      audio,
      captions,
      render,
      status,
    });

    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

// BGG ingestion stub
app.post(`${API_PREFIX}/bgg/ingest`, async (req, res, next) => {
  try {
    const { projectId, bggUrl } = req.body;
    if (!projectId || !bggUrl) {
      return res.status(400).json({ error: 'projectId and bggUrl are required' });
    }

    const metadata = await fetchMetadataStub({ bggUrl });
    res.json({ projectId, metadata });
  } catch (error) {
    next(error);
  }
});

// Rulebook upload (PDF)
app.post(`${API_PREFIX}/rulebook/upload`, upload.single('rulebook'), async (req, res, next) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!req.file) return res.status(400).json({ error: 'rulebook PDF is required' });

    res.status(201).json({
      projectId,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Rulebook parsing stub
app.post(`${API_PREFIX}/rulebook/parse`, async (req, res, next) => {
  try {
    const { projectId, pdfPath } = req.body;
    if (!projectId || !pdfPath) {
      return res.status(400).json({ error: 'projectId and pdfPath are required' });
    }

    const parsed = await parseRulebookStub({ projectId, pdfPath });
    res.json(parsed);
  } catch (error) {
    next(error);
  }
});

// Script generation stub
app.post(`${API_PREFIX}/script/generate`, async (req, res, next) => {
  try {
    const { projectId, language = 'fr-CA', detailBoost = 25 } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const script = await generateScriptStub({ language, detailBoost });
    res.json({ projectId, script });
  } catch (error) {
    next(error);
  }
});

// Asset processing stub
app.post(`${API_PREFIX}/assets/process`, async (req, res, next) => {
  try {
    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const assets = await processAssetsStub({ projectId });
    res.json(assets);
  } catch (error) {
    next(error);
  }
});

// Audio generation stub
app.post(`${API_PREFIX}/audio/generate`, async (req, res, next) => {
  try {
    const { projectId, voiceId } = req.body;
    if (!projectId || !voiceId) {
      return res.status(400).json({ error: 'projectId and voiceId are required' });
    }

    const audio = await generateAudioStub({ voiceId });
    res.json({ projectId, audio });
  } catch (error) {
    next(error);
  }
});

// Captions generation stub
app.post(`${API_PREFIX}/captions/generate`, async (req, res, next) => {
  try {
    const { projectId, language = 'fr-CA' } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const captions = await generateCaptionsStub({ language });
    res.json({ projectId, captions });
  } catch (error) {
    next(error);
  }
});

// Preview rendering stub
app.post(`${API_PREFIX}/render/preview`, async (req, res, next) => {
  try {
    const { projectId, durationSeconds = 10 } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const preview = await renderPreviewStub({ durationSeconds });
    res.json({ projectId, preview });
  } catch (error) {
    next(error);
  }
});

// Full render stub
app.post(`${API_PREFIX}/render/full`, async (req, res, next) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const render = await renderFullStub();
    res.json({ projectId, render });
  } catch (error) {
    next(error);
  }
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message ?? 'Internal Server Error',
  });
});

export async function startServer() {
  await ensureStorageLayout();

  app.listen(PORT, () => {
    console.log(`Mobius backend listening on port ${PORT}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => {
    console.error('Fatal startup error', error);
    process.exit(1);
  });
}