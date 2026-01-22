// src/api/index.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import healthRouter from './health.js';
import previewRouter from './preview.js';
import { getDirs, resolveDataPath } from '../config/paths.js';
import { requestLoggerMiddleware } from '../logging/logger.js';
import { Metrics } from '../metrics/metrics.js';
import { createIngestQueue } from '../utils/ingestQueue.js';
import { performIngestion } from './handlers/performIngestion.js';
import { runJanitor } from '../jobs/janitor.js';
import { previewChapterHandler } from './handlers/previewChapter.js';

// Import the API routers
import ingestApiRouter from './ingest.js';
import projectsApiRouter from './projects.js';
import assetsApiRouter from './assets.js';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;

// API version header
app.use((req, res, next) => {
  res.setHeader('x-api-version', process.env.API_VERSION || 'v1');
  next();
});

// Core middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));
app.use(requestLoggerMiddleware);

app.use((req, _res, next) => { Metrics.inc('requests_total'); next(); });

// Data dirs and static serving
const { uploads } = getDirs();
app.use('/uploads', express.static(uploads, { fallthrough: true }));
app.use('/previews', express.static(resolveDataPath('previews'), { fallthrough: true }));

// Multer storage targeting canonical uploads with file filter
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true });
    cb(null, uploads);
  },
  filename: function (_req, file, cb) {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    const stamp = Date.now();
    cb(null, `${stamp}_${safe}`);
  },
});

// File filter to allow only PDFs in production, and text files in dev/test
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 25);
const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isProd = process.env.NODE_ENV === 'production';
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const mime = file.mimetype || '';
    const isPdf = mime === 'application/pdf' || ext === 'pdf';
    const isTxt = mime === 'text/plain' || ext === 'txt';
    if (isProd) {
      if (!isPdf) return cb(new Error('invalid_file_type_pdf_only'));
      return cb(null, true);
    } else {
      if (!(isPdf || isTxt)) return cb(new Error('invalid_file_type'));
      return cb(null, true);
    }
  },
});

const ingestQueue = createIngestQueue();

// Health & metrics
app.use('/health', healthRouter);
app.use('/preview', previewRouter);
app.use('/summarize', (await import('./summarize.js')).default);
app.use('/tts', (await import('./tts.js')).default);

// Mount the API routers
app.use('/api/ingest', ingestApiRouter);
app.use('/api/projects', projectsApiRouter);
app.use('/api/assets', assetsApiRouter);

// Preview endpoint
app.post(
  '/api/preview',
  express.json({ limit: '2mb' }),
  previewChapterHandler
);

// Export endpoint
app.post('/api/export', (req, res) => {
  try {
    const { chapters, srt, meta } = req.body;
    
    if (!chapters || !srt || !meta) {
      return res.status(400).json({ error: 'Missing required export data' });
    }
    
    // Create export directory if it doesn't exist
    const exportDir = resolveDataPath('exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    // Generate export ID and paths
    const exportId = Date.now().toString(36);
    const chaptersPath = resolveDataPath('exports', `${exportId}_chapters.json`);
    const srtPath = resolveDataPath('exports', `${exportId}_script.srt`);
    const metaPath = resolveDataPath('exports', `${exportId}_meta.json`);
    
    // Write export files
    fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2));
    fs.writeFileSync(srtPath, srt);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    
    Metrics.inc('exports_generated_total');
    
    // Return export information
    res.json({
      ok: true,
      exportId,
      files: {
        chapters: chaptersPath.replace(getDirs().root + path.sep, ''),
        srt: srtPath.replace(getDirs().root + path.sep, ''),
        meta: metaPath.replace(getDirs().root + path.sep, '')
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    Metrics.inc('export_errors_total');
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  Metrics.inc('errors_total');
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled_error', error: String(err?.stack || err) }));
  res.status(500).json({ error: 'Internal Server Error' });
});

export const server = app.listen(PORT, () => {
  // Startup log in JSON
  console.log(JSON.stringify({
    level: 'info',
    msg: 'api_listening',
    port: PORT,
    dataDir: getDirs().root,
  }));
});

// simple daily timer
setInterval(runJanitor, 24 * 60 * 60 * 1000);
setTimeout(runJanitor, 10 * 1000); // first run shortly after boot