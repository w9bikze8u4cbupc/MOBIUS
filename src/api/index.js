import { spawn, spawnSync } from 'child_process';
import fs, { promises as fsPromises, existsSync } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { XMLParser } from 'fast-xml-parser';
import { ensureDir } from 'fs-extra';
import helmet from 'helmet';
import sizeOf from 'image-size';
// Add security and operational hardening imports
// Add pdfjs legacy mitigation polyfill
if (process.env.USE_PDFJS_LEGACY === '1') {
  import('./polyfills.js').catch((err) => {
    console.warn('Failed to load polyfills:', err);
  });
}
// Delay import of pdf modules until needed
let pdfToImg, sharp;
// Import * as pdfToImg from 'pdf-to-img';
// Import sharp from 'sharp';
import multer from 'multer';
import OpenAI from 'openai';
import xml2js from 'xml2js';

// Import alpha-safe utilities
import LoggingService from '../utils/logging/LoggingService.js';
import { validateUrl, isAllowedUrl } from '../utils/urlValidator.js';

import { explainChunkWithAI, extractComponentsWithAI } from './aiUtils.js';
import { AlphaOps, generatePreviewImageAlphaSafe } from './alphaOps.js';
// Import component extractor
import db from './db.js';
import { mountExtractComponentsRoute, mountPopplerHealthRoute } from './extractComponents.js';
// Project modules (keep as you already use them later)
import {
  recordTtsRequest,
  recordTtsCacheHit,
  recordExtractPdfDuration,
  recordRenderDuration,
  recordHttpRequestDuration,
} from './metrics.js';
import { getMetrics } from './metrics.js';
import { extractTextFromPDF, validatePDFFile, extractImagesFromPDF } from './pdfUtils.js';
import { extractComponentsFromText } from './utils.js';
// Import metrics and URL validation

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Ensure uploads/tmp exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
function ensureUploadsTmp() {
  try {
    const tmpDir = path.join(UPLOADS_DIR, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  } catch (e) {
    console.error('Failed to ensure /uploads/tmp exists:', e);
    return null;
  }
}
// Add event loop delay monitoring
import { monitorEventLoopDelay } from 'perf_hooks';
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
globalThis.__eventLoopDelayMs = () => eventLoopDelay.mean / 1e6;
dotenv.config();
const app = express();
const port = process.env.PORT || 5001;

// Add temporary file lifecycle management

const TMP_DIR = path.join(process.cwd(), 'tmp');
const TMP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function sweepTmp() {
  try {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      return;
    }

    const now = Date.now();
    const files = fs.readdirSync(TMP_DIR);
    let cleanedCount = 0;

    for (const f of files) {
      const fp = path.join(TMP_DIR, f);
      try {
        const st = fs.statSync(fp);
        if (now - st.mtimeMs > TMP_TTL_MS) {
          fs.unlinkSync(fp);
          cleanedCount++;
        }
      } catch (err) {
        // Ignore errors for individual files
        console.warn('Failed to process temp file:', fp, err.message);
      }
    }

    // Log counts of files cleaned per sweep
    if (cleanedCount > 0) {
      console.log(`Temporary file cleanup: ${cleanedCount} files removed`);
    }
  } catch (err) {
    console.warn('Temporary directory sweep failed:', err.message);
  }
}

// Run cleanup every hour
setInterval(sweepTmp, 60 * 60 * 1000).unref();

// Add configurable timeouts (already declared above)
// const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000;
// const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS) || 5000;
// const BGG_FETCH_TIMEOUT_MS = parseInt(process.env.BGG_FETCH_TIMEOUT_MS) || 10000;

// Apply timeout middleware
app.use((req, res, next) => {
  // Set request timeout
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    console.warn(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`);
    res.status(408).json({ error: 'Request timeout' });
  });

  // Set socket timeout
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    console.warn(`Response timeout after ${REQUEST_TIMEOUT_MS}ms`);
    res.status(408).json({ error: 'Response timeout' });
  });

  next();
});

// Add security and operational hardening middleware
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false })); // disable CSP for API-only server
// CORS configuration
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }),
);
// Rate limiting
const ttsRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: parseInt(process.env.TTS_RATE_LIMIT || '60'), // 60 req/min/IP by default
  message: { error: 'Too many TTS requests, please try again later' },
});
const apiRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: parseInt(process.env.API_RATE_LIMIT || '600'), // 600 req/min/IP by default
  message: { error: 'Too many API requests, please try again later' },
});
app.use('/tts', ttsRateLimit);
app.use('/api/', apiRateLimit);
// Body parsing with limits
app.use(
  express.json({
    limit: process.env.REQUEST_BODY_LIMIT || '10mb',
    // Request timeout
    timeout: parseInt(process.env.REQUEST_TIMEOUT_MS || '60000'),
    // Custom verify function to handle pdfjs-dist interference
    verify: (req, res, buf, encoding) => {
      // Store the raw buffer for manual parsing if needed
      req.rawBody = buf;
    },
  }),
);

// Custom JSON parsing middleware to handle pdfjs-dist interference (fallback)
function customJsonParser(req, res, next) {
  // Only handle JSON requests when express.json failed
  if (req.headers['content-type'] !== 'application/json') {
    return next();
  }

  // If body is already parsed and valid, continue
  if (req.body && typeof req.body === 'object') {
    return next();
  }

  // Only try custom parsing if we have rawBody from express.json verify function
  if (!req.rawBody) {
    return next();
  }

  const data = req.rawBody.toString();

  if (!data) {
    return next();
  }

  try {
    req.body = JSON.parse(data);
    next();
  } catch (error) {
    console.warn('Custom JSON parsing failed:', error.message);
    console.warn('Raw data:', data);
    // Try to fix common pdfjs-dist interference issues
    try {
      // Remove any characters that might have been added by pdfjs-dist
      const cleanedData = data.replace(/[\x00-\x1F\x7F]/g, '');
      req.body = JSON.parse(cleanedData);
      next();
    } catch (cleanError) {
      console.warn('Cleaned JSON parsing also failed:', cleanError.message);
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
  }
}

// Apply the custom JSON parser after the express.json middleware as fallback
app.use(customJsonParser);

ensureUploadsTmp();
app.use('/static', express.static(UPLOADS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
// Serve extracted images if not already configured
app.use('/output', express.static(path.join(process.cwd(), 'output')));
// Ensure output directories exist
const outputActionsDir = path.join(process.cwd(), 'output', 'actions');
if (!fs.existsSync(outputActionsDir)) {
  fs.mkdirSync(outputActionsDir, { recursive: true });
}
// Serve demo page
app.get('/demo', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'demo.html'));
});

// Enhanced health check with timeout configuration
app.get('/healthz', (req, res) => {
  // Set a shorter timeout for health checks
  req.setTimeout(HEALTH_CHECK_TIMEOUT_MS, () => {
    res.status(408).send('Health check timeout');
  });

  res.send('ok');
});

// Config

const BACKEND_URL = (process.env.BACKEND_URL || `http://localhost:${port}`).trim(); // server-side var (no REACT_APP_ prefix)
const IMAGE_EXTRACTOR_API_KEY = process.env.IMAGE_EXTRACTOR_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(UPLOADS_DIR, 'MobiusGames');
if (!OUTPUT_DIR || typeof OUTPUT_DIR !== 'string') {
  console.error('Invalid OUTPUT_DIR configuration');
  process.exit(1);
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
// BGG metadata cache
const bggMetadataCache = new Map();
// Configure multer for different upload needs
const uploadPdfImages = multer({ dest: path.join(process.cwd(), 'uploads') });
// Quiet a noisy warn (optional)
const originalWarn = console.warn;
console.warn = function (...args) {
  if (typeof args[0] === 'string' && args[0].includes('getPathGenerator - ignoring character')) {
    return;
  }
  originalWarn.apply(console, args);
};
// Request ID middleware for correlation
function requestIdMiddleware(req, res, next) {
  // Check for existing X-Request-ID header
  const requestId =
    req.headers['x-request-id'] ||
    req.headers['X-Request-ID'] ||
    `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Attach to request object
  req.requestId = requestId;

  // Add to response headers for tracing
  res.setHeader('X-Request-ID', requestId);

  // Enhanced logging with request ID
  console.log(
    JSON.stringify({
      level: 'info',
      requestId: requestId,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString(),
      message: 'Request started',
    }),
  );

  // Record start time for metrics
  const startTime = Date.now();

  // Override res.end to capture request duration
  const originalEnd = res.end;
  res.end = function () {
    const duration = (Date.now() - startTime) / 1000;
    recordHttpRequestDuration(duration);

    // Log request completion
    console.log(
      JSON.stringify({
        level: 'info',
        requestId: requestId,
        method: req.method,
        path: req.path,
        durationMs: Math.round(duration * 1000),
        timestamp: new Date().toISOString(),
        message: 'Request completed',
      }),
    );

    originalEnd.apply(this, arguments);
  };

  next();
}
app.use(requestIdMiddleware);
// Lazy load pdf modules when needed
async function loadPdfModules() {
  if (!pdfToImg) {
    pdfToImg = await import('pdf-to-img');
  }
  if (!sharp) {
    sharp = await import('sharp');
  }
}

// Helper functions you already had can remain below (getDateString, estimateTargetDurationSec, retimeStoryboard, your routes, etc.)
function getDateString() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function estimateTargetDurationSec(wordCount = 0, opts = {}) {
  const wpm = opts.wpm || 110;
  const visualFactor = opts.visualFactor || 1.35;
  const base = Math.round((Math.max(0, wordCount) / wpm) * 60 * visualFactor);
  const min = opts.min || 540;
  const max = opts.max || 900;
  return Math.max(min, Math.min(max, base || 600));
}

function retimeStoryboard(scenes, targetTotalSec) {
  const segs = scenes.flatMap((s) => s.segments || []);
  const currentTotal = segs.reduce((sum, seg) => sum + (seg.durationSec || 0), 0);
  if (!currentTotal || !targetTotalSec) return;
  const bias = segs.map((seg) => {
    let b = 1;
    const name = (seg.image?.type || seg.image?.name || '').toLowerCase();
    if (name.includes('component') || name.includes('board') || name.includes('setup')) b += 0.4;
    return b;
  });
  const biasSum = bias.reduce((a, b) => a + b, 0);
  let assigned = 0;
  const minPerSeg = 4;
  segs.forEach((seg, i) => {
    const share = bias[i] / biasSum;
    const raw = Math.round(targetTotalSec * share);
    seg.durationSec = Math.max(minPerSeg, raw);
    assigned += seg.durationSec;
  });
  let delta = assigned - targetTotalSec;
  if (delta !== 0) {
    const order = [...segs.keys()].sort((a, b) => segs[b].durationSec - segs[a].durationSec);
    let idx = 0;
    while (delta !== 0 && idx < order.length * 3) {
      const k = order[idx % order.length];
      if (delta > 0 && segs[k].durationSec > minPerSeg) {
        segs[k].durationSec -= 1;
        delta--;
      } else if (delta < 0) {
        segs[k].durationSec += 1;
        delta++;
      }
      idx++;
    }
  }
}
function splitIntoSections(text) {
  const regex = /(^|\n)(##? |[A-Z][A-Z\s\d\-\(\)\.]{3,}$|^\d+\.\s)/gm;
  const parts = text.split(regex);
  let sections = [];
  for (let i = 1; i < parts.length; i += 3) {
    const delimiter = parts[i];
    const sectionContent = parts[i + 2];
    if (sectionContent) sections.push((delimiter ? delimiter + '\n' : '') + sectionContent.trim());
  }
  if (parts[0]) sections.unshift(parts[0].trim());
  return sections.filter(Boolean);
}
function extractGameIdFromBGGUrl(url) {
  const match = url.match(/\/boardgame\/(\d+)/);
  return match ? match[1] : null;
}
function _toArrayish(val) {
  if (!val) return [];
  if (Array.isArray(val))
    return val
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter(Boolean);
  return String(val)
    .split(/,|\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function _unique(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}
function _enList(arr) {
  const a = _unique(_toArrayish(arr));
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
}
function _frList(arr) {
  const a = _unique(_toArrayish(arr));
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} et ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, et ${a[a.length - 1]}`;
}
function _pickCoverImage(images = []) {
  const arr = Array.isArray(images) ? images : [];
  const byName = arr.find((img) => /cover|box|thumbnail/i.test(img?.name || ''));
  const byType = arr.find((img) => /cover/i.test(img?.type || ''));
  return byName || byType || arr[0] || null;
}
function _pickComponentImages(images = [], max = 3) {
  const arr = Array.isArray(images) ? images : [];
  const comps = arr.filter(
    (img) => /component/i.test(img?.type || '') || /token|card|board|tile/i.test(img?.name || ''),
  );
  const rest = arr.filter((img) => !comps.includes(img));
  return _unique([...comps, ...rest]).slice(0, max);
}
function _uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function resolveImageByKey(images, key) {
  return images.find((i) => (i.id || i.path) === key);
}
function buildStoryboard(opts = {}) {
  const metadata = opts.metadata || {};
  const images = Array.isArray(opts.images) ? opts.images : [];
  const components = Array.isArray(opts.components) ? opts.components : [];
  const langDefault = opts.language || 'en';
  const title = metadata.title || 'this game';
  const playerCount = metadata.player_count || '';
  const playTime = metadata.play_time || '';
  const minAge = metadata.min_age || '';
  const themes = _toArrayish(metadata.theme);
  const mechanics = _toArrayish(metadata.mechanics);
  const designers = _toArrayish(metadata.designers);
  const publishers = _toArrayish(metadata.publisher);
  const cover = _pickCoverImage(images);
  const compImgs = _pickComponentImages(images, 3);
  const scenes = [];
  scenes.push({
    id: _uid('scene'),
    key: 'intro',
    title: 'Introduction',
    titleFr: 'Introduction',
    segments: [
      {
        id: _uid('seg'),
        durationSec: 6,
        image: cover,
        textEn: `Welcome to ${title}! This quick guide will help you learn the basics in just a few minutes.`,
        textFr: `Bienvenue à ${title} ! Ce guide rapide vous aidera à apprendre les bases en quelques minutes.`,
      },
      {
        id: _uid('seg'),
        durationSec: 5,
        image: cover,
        textEn: `Players: ${playerCount || 'see box'}. Play time: ${playTime || 'varies'}. Recommended age: ${minAge || 'see box'}.`,
        textFr: `Joueurs : ${playerCount || 'voir la boîte'}. Durée : ${playTime || 'variable'}. Âge recommandé : ${minAge || 'voir la boîte'}.`,
      },
    ],
  });
  if (themes.length || mechanics.length) {
    scenes.push({
      id: _uid('scene'),
      key: 'theme_mechanics',
      title: 'Theme and Mechanics',
      titleFr: 'Thème et Mécaniques',
      segments: [
        themes.length
          ? {
              id: _uid('seg'),
              durationSec: 6,
              image: cover,
              textEn: `Theme: ${_enList(themes)}.`,
              textFr: `Thème : ${_frList(themes)}.`,
            }
          : null,
        mechanics.length
          ? {
              id: _uid('seg'),
              durationSec: 6,
              image: cover,
              textEn: `Core mechanics include ${_enList(mechanics)}.`,
              textFr: `Les mécaniques principales incluent ${_frList(mechanics)}.`,
            }
          : null,
      ].filter(Boolean),
    });
  }
  const goalTextEn =
    (metadata && metadata.goal && metadata.goal.en) ||
    (opts && opts.goalTextEn) ||
    `In ${title}, your goal is to achieve the victory condition described in the rulebook — often by earning the most points or claiming key objectives.`;
  const goalTextFr =
    (metadata && metadata.goal && metadata.goal.fr) ||
    (opts && opts.goalTextFr) ||
    `Dans ${title}, votre objectif est d’atteindre la condition de victoire du livret — souvent en marquant le plus de points ou en remplissant des objectifs clés.`;
  scenes.push({
    id: _uid('scene'),
    key: 'goal',
    title: 'How to Win',
    titleFr: 'Comment gagner',
    segments: [
      {
        id: _uid('seg'),
        durationSec: 8,
        image: cover,
        textEn: goalTextEn,
        textFr: goalTextFr,
      },
    ],
  });
  if (compImgs.length > 0) {
    scenes.push({
      id: _uid('scene'),
      key: 'components',
      title: 'Components',
      titleFr: 'Composants',
      segments: compImgs.map((img) => ({
        id: _uid('seg'),
        durationSec: 4,
        image: img,
        textEn: 'Here’s one of the components you’ll use during the game.',
        textFr: 'Voici l’un des composants que vous utiliserez pendant la partie.',
      })),
    });
    const compImageMulti = (opts && opts.compImageMulti) || {};
    const componentsScene = scenes.find((s) => s.key === 'components');
    if (componentsScene && Object.keys(compImageMulti).length) {
      const extraSegments = [];
      components.forEach((comp, idx) => {
        const extraKeys = compImageMulti[idx] || [];
        extraKeys.forEach((k) => {
          const img = resolveImageByKey(images, k);
          if (!img) return;
          extraSegments.push({
            id: _uid('seg'),
            durationSec: 3,
            image: img,
            textEn: `${comp?.name || 'Component'} (additional view)`,
            textFr: `${comp?.nameFr || comp?.name || 'Élément'} (vue supplémentaire)`,
          });
        });
      });
      const seen = new Set(
        (componentsScene.segments || []).map(
          (seg) => seg.image?.id || seg.image?.path || seg.image?.url,
        ),
      );
      extraSegments.forEach((seg) => {
        const key = seg.image?.id || seg.image?.path || seg.image?.url;
        if (!seen.has(key)) {
          componentsScene.segments.push(seg);
          seen.add(key);
        }
      });
    }
  }
  scenes.push({
    id: _uid('scene'),
    key: 'setup',
    title: 'Setup',
    titleFr: 'Mise en place',
    segments: [
      {
        id: _uid('seg'),
        durationSec: 7,
        image: compImgs[0] || cover,
        textEn:
          'For setup, follow the rulebook. As a quick start: place the main board, give each player their starting pieces, and keep common tokens within reach.',
        textFr:
          'Pour la mise en place, suivez le livret de règles. En bref : placez le plateau principal, donnez à chaque joueur ses éléments de départ, et gardez les jetons communs à portée.',
      },
    ],
  });
  scenes.push({
    id: _uid('scene'),
    key: 'how_to_play',
    title: 'How to Play',
    titleFr: 'Comment jouer',
    segments: [
      {
        id: _uid('seg'),
        durationSec: 7,
        image: compImgs[1] || cover,
        textEn:
          'On your turn, you’ll usually perform one main action, resolve any effects, then refresh or draw as the game instructs.',
        textFr:
          'À votre tour, vous effectuez généralement une action principale, résolvez les effets, puis piochez ou rafraîchissez selon les règles.',
      },
      {
        id: _uid('seg'),
        durationSec: 6,
        image: compImgs[2] || cover,
        textEn:
          'Aim to earn the most points or reach the victory condition by using the game’s core mechanics effectively.',
        textFr:
          'Visez à marquer le plus de points ou à atteindre la condition de victoire en utilisant efficacement les mécaniques du jeu.',
      },
    ],
  });
  scenes.push({
    id: _uid('scene'),
    key: 'tips_outro',
    title: 'Tips and Next Steps',
    titleFr: 'Conseils et Suite',
    segments: [
      {
        id: _uid('seg'),
        durationSec: 5,
        image: cover,
        textEn:
          'Beginner tip: focus on learning the flow first—perfect strategies come with practice.',
        textFr:
          'Conseil débutant : apprenez d’abord le déroulement—les stratégies viennent avec la pratique.',
      },
      {
        id: _uid('seg'),
        durationSec: 5,
        image: cover,
        textEn: `You’re ready to play ${title}! For specifics, consult the rulebook and player aids.`,
        textFr: `Vous êtes prêt à jouer à ${title} ! Pour les détails, consultez le livret de règles et les aides de jeu.`,
      },
    ],
  });
  const baseTotal = scenes
    .flatMap((s) => s.segments || [])
    .reduce((sum, seg) => sum + (seg.durationSec || 0), 0);
  const targetTotalSec = estimateTargetDurationSec(opts.wordCount || 0, {
    wpm: 110,
    visualFactor: 1.35,
    min: 540,
    max: 900,
  });
  retimeStoryboard(scenes, targetTotalSec);
  const totalDurationSec = scenes
    .flatMap((s) => s.segments || [])
    .reduce((sum, seg) => sum + (seg.durationSec || 0), 0);
  return {
    id: _uid('sb'),
    languageDefault: langDefault,
    voice: opts.voice || null,
    title,
    publishers,
    designers,
    scenes,
    totalDurationSec,
    timingMeta: {
      baseTotalSec: baseTotal,
      targetTotalSec,
      wordCount: opts.wordCount || 0,
      wpm: 110,
      visualFactor: 1.35,
    },
  };
}
function extractBGGId(url) {
  const patterns = [/boardgame\/(\d+)/, /thing\/(\d+)/, /\/(\d+)\//, /id=(\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
function extractComponentsFromDescription(description) {
  if (!description) return [];
  const cleanText = description.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ');
  const patterns = [
    new RegExp(
      'components?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)',
      'i',
    ),
    new RegExp('contents?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)', 'i'),
    new RegExp('includes?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)', 'i'),
    new RegExp(
      'game contains?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)',
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return match[1]
        .split(/\n|•||–|-|\*/)
        .map((line) => line.trim())
        .filter((line) => line.length > 3 && !line.match(/^\d+$/))
        .map((line) => line.replace(/^\d+\s*x?\s*/i, '').trim())
        .filter((line) => line.length > 0)
        .slice(0, 50);
    }
  }
  return [];
}
function extractTheme(description) {
  if (!description) return 'Theme information not available';
  const cleanText = description.replace(/<[^>]*>/g, '').trim();
  const sentences = cleanText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 2) return sentences.slice(0, 2).join('. ').trim() + '.';
  if (sentences.length === 1) return sentences[0].trim() + '.';
  return cleanText.substring(0, 200) + '...';
}
function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}
async function generatePreviewImage(filePath, outputPath = 'uploads/tmp', quality = 75) {
  try {
    // Use alpha-safe preview generation
    const result = await generatePreviewImageAlphaSafe(filePath, outputPath, quality);
    return result;
  } catch (err) {
    console.error('Error generating preview:', err);
    return null;
  }
}
async function extractImagesFromUrl(url, apiKey, mode = 'basic') {
  console.log('extractImagesFromUrl called for:', url);
  const startRes = await axios.post(
    'https://api.extract.pics/v0/extractions',
    { url, mode },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );
  const extractionId = startRes.data.data.id;
  let status = startRes.data.data.status;
  let images = [];
  let attempts = 0;
  while (status !== 'done' && status !== 'failed' && attempts < 20) {
    await new Promise((res) => setTimeout(res, 2000));
    const pollRes = await axios.get(`https://api.extract.pics/v0/extractions/${extractionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    status = pollRes.data.data.status;
    images = pollRes.data.data.images || [];
    attempts++;
  }
  if (status === 'done') return images.map((img) => img.url);
  throw new Error(`Extraction failed or timed out for ${url}`);
}
async function extractAndStoreImagesSafe(
  filePathOrUrl,
  outputDir = path.join(__dirname, 'uploads', 'extracted-images'),
) {
  await ensureDir(outputDir);
  let results = [];
  try {
    if (isHttpUrl(filePathOrUrl)) {
      if (!IMAGE_EXTRACTOR_API_KEY) {
        throw new Error('IMAGE_EXTRACTOR_API_KEY is not set');
      }
      const urls = await extractImagesFromUrl(filePathOrUrl, IMAGE_EXTRACTOR_API_KEY, 'basic');
      results = urls.map((u) => {
        let base;
        try {
          base = path.basename(new URL(u).pathname);
        } catch {
          base = path.basename(u);
        }
        return {
          id: `url-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: base || `image_${Date.now()}`,
          path: u,
          preview: null,
          source: 'url',
          type: 'other',
        };
      });
    } else {
      await ensureDir(outputDir);
      const paths = await extractImagesFromPDF(filePathOrUrl, outputDir);
      ensureUploadsTmp();
      results = [];
      for (const p of paths) {
        const base = path.basename(p);
        let preview = null;
        try {
          const prevPath = await generatePreviewImage(p, 'uploads/tmp');
          if (prevPath) preview = `/uploads/tmp/${path.basename(prevPath)}`;
        } catch (e) {
          console.warn('Preview generation failed for', p, e.message);
        }
        let rel = path.relative(path.join(__dirname, 'uploads'), p).replace(/\\/g, '/');
        if (!rel.startsWith('/')) rel = `/${rel}`;
        const servedPath = `/uploads${rel}`;
        results.push({
          id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: base,
          path: servedPath,
          preview,
          source: 'pdf',
          type: 'page',
        });
      }
    }
  } catch (e) {
    console.error('extractAndStoreImagesSafe failed:', e);
    throw e;
  }
  return results;
}

app.post('/api/explain-chunk', async (req, res) => {
  try {
    const { chunk, language } = req.body;
    if (!chunk) return res.status(400).json({ error: 'No text chunk provided.' });
    const lang = language === 'fr' ? 'fr' : 'en';
    const explanation = await explainChunkWithAI(chunk, lang);
    res.json({ explanation });
  } catch (err) {
    console.error('Error in /api/explain-chunk:', err);
    res.status(500).json({ error: 'Failed to generate explanation.' });
  }
});
app.post('/save-project', (req, res) => {
  const { name, metadata, components, images, script, audio } = req.body;
  db.run(
    `INSERT INTO projects (name, metadata, components, images, script, audio)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name,
      JSON.stringify(metadata),
      JSON.stringify(components),
      JSON.stringify(images),
      script,
      audio,
    ],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to save project. Please try again later.' });
      }
      res.json({ status: 'success', projectId: this.lastID });
    },
  );
});
app.get('/api/bgg-components', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'BGG URL is required' });
    const gameId = extractBGGId(url);
    if (!gameId) return res.status(400).json({ error: 'Invalid BGG URL format' });
    const apiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}`;
    const response = await axios.get(apiUrl, { timeout: 8000 });
    const parsed = await xml2js.parseStringPromise(response.data, {
      explicitArray: false,
    });
    const item = parsed.items.item;
    const description = item.description || '';
    let components = extractComponentsFromDescription(description);
    const cleaned = components
      .map((c) => c.trim())
      .filter((c) => c.length > 2)
      .map((c) => c.replace(/^\d+\s*x?\s*/i, '').trim())
      .filter(Boolean);
    const normalizedComponents = cleaned.map((name) => ({
      name,
      quantity: null,
      selected: true,
    }));
    res.json({
      success: true,
      gameId,
      components: normalizedComponents.slice(0, 30),
      extractedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('BGG components extraction error:', error.message);
    res.status(500).json({ error: 'Failed to extract components', details: error.message });
  }
});
app.post('/api/extract-components', async (req, res) => {
  try {
    const pdfPath = req.body.pdfPath;
    if (!pdfPath) return res.status(400).json({ error: 'No PDF path provided' });

    // Get request ID for tracing
    const requestId = req.headers['x-request-id'] || null;

    const extractedText = await extractTextFromPDF(pdfPath, requestId);

    // Check if OCR is not available
    if (extractedText === 'PDF_NO_TEXT_CONTENT') {
      return res.status(400).json({
        success: false,
        code: 'pdf_no_text_content',
        message: 'PDF appears scanned; enable OCR or upload a text-based PDF.',
        suggestion:
          'This PDF appears to be a scanned image without selectable text. Enable OCR or upload a text-based PDF.',
        requestId: requestId,
      });
    }

    // Check if text is effectively empty
    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        code: 'pdf_no_text_content',
        message: 'PDF appears scanned; enable OCR or upload a text-based PDF.',
        suggestion:
          'This PDF appears to be a scanned image without selectable text. Enable OCR or upload a text-based PDF.',
        requestId: requestId,
      });
    }

    // Log text extraction diagnostics
    LoggingService.info('ComponentExtraction', 'Text extraction completed', {
      pdfPath,
      requestId,
      textLength: extractedText.length,
      firstPagePreview:
        extractedText.substring(0, 200).replace(/\s+/g, ' ') +
        (extractedText.length > 200 ? '...' : ''),
    });

    let componentList = await extractComponentsWithAI(extractedText);
    let isAISuccessful = Array.isArray(componentList) && componentList.length > 0;
    if (!isAISuccessful) {
      componentList = extractComponentsFromText(extractedText);

      // If still no components found, try lenient mode
      if (!componentList || componentList.length === 0) {
        LoggingService.info('ComponentExtraction', 'Trying lenient mode parsing', {
          pdfPath,
          requestId,
        });
        componentList = extractComponentsFromText(extractedText, false, true);
      }
    }

    // If no components found but text exists, return a specific error
    if ((!componentList || componentList.length === 0) && extractedText.trim().length > 100) {
      LoggingService.warn('ComponentExtraction', 'No components found in text', {
        pdfPath,
        requestId,
        textLength: extractedText.length,
      });

      return res.status(400).json({
        success: false,
        code: 'components_not_found',
        message: 'No components recognized. Try providing a clearer components section.',
        suggestion:
          'No game components were found in the PDF. Make sure the PDF contains a clear "Components" or "Contents" section.',
        requestId: requestId,
      });
    }

    LoggingService.info('ComponentExtraction', 'Component extraction completed', {
      pdfPath,
      requestId,
      componentCount: componentList ? componentList.length : 0,
    });

    res.json({
      success: true,
      components: (componentList || []).map((c) => ({ ...c, selected: true })),
      extractionMethod: isAISuccessful ? 'ai' : 'regex',
      extractionStats: null,
      requestId: requestId,
    });
  } catch (err) {
    const requestId = req.headers['x-request-id'] || null;
    LoggingService.error('ComponentExtraction', 'Component extraction error', {
      pdfPath: req.body.pdfPath,
      requestId,
      error: err.message,
    });

    console.error('Component extraction error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      extractionMethod: 'error',
      extractionStats: null,
      requestId: requestId,
    });
  }
});
// POST /api/extract-images - extract embedded images from a PDF rulebook
// Form-data: pdf (file)
app.post('/api/extract-images', uploadPdfImages.single('pdf'), async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF uploaded (field name "pdf")',
      });
    }
    const pdfPath = req.file.path;
    const outRoot = path.join(process.cwd(), 'output', 'pdf-images');
    const jobDir = path.join(outRoot, String(Date.now()));
    fs.mkdirSync(jobDir, { recursive: true });
    // pdfimages will emit files like: <prefix>-000.png
    const prefix = path.join(jobDir, 'img');
    const args = ['-all', '-png', pdfPath, prefix];

    // Use full path to pdfimages on Windows for compatibility
    const pdfimagesPath =
      process.platform === 'win32'
        ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdfimages.exe'
        : 'pdfimages';

    const proc = spawn(pdfimagesPath, args);
    let stderrBuf = '';
    proc.stderr.on('data', (d) => (stderrBuf += d.toString()));
    proc.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({
          success: false,
          error: `pdfimages failed (code ${code})`,
          details: stderrBuf.trim() || 'Install Poppler (pdfimages) and ensure it is in PATH.',
        });
      }
      // Collect emitted images
      const files = fs
        .readdirSync(jobDir)
        .filter((f) => /\.(png|jpg|jpeg|jpx|ppm)$/i.test(f))
        .map((f) => ({
          filename: f,
          // Public URL if /output is served
          url: `/output/pdf-images/${path.basename(jobDir)}/${f}`,
        }));
      if (files.length === 0) {
        return res.status(204).json({ success: true, images: [] });
      }

      // Record PDF extraction duration metric
      const duration = (Date.now() - startTime) / 1000;
      recordExtractPdfDuration(duration);

      return res.json({
        success: true,
        images: files,
        outputDir: `/output/pdf-images/${path.basename(jobDir)}`,
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Unexpected server error.' });
  }
});
// POST /api/extract-pdf-images - extract embedded images from a PDF URL
// JSON body: { pdfUrl }
app.post('/api/extract-pdf-images', async (req, res) => {
  const startTime = Date.now();
  try {
    const { pdfUrl } = req.body;
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'No PDF URL provided (field name "pdfUrl")',
      });
    }
    // Validate URL
    const urlValidation = await validateUrl(pdfUrl, {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });

    if (!urlValidation.valid) {
      console.warn(`URL validation failed for ${pdfUrl}: ${urlValidation.reason}`);
      return res.status(400).json({
        success: false,
        code: 'url_disallowed',
        message: 'URL not allowed by policy',
        requestId: req.headers['x-request-id'] || undefined,
      });
    }
    // Download PDF to temporary location
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const fileName = `temp_${Date.now()}.pdf`;
    const tempPdfPath = path.join(tempDir, fileName);

    // Download the PDF
    const response = await axios({
      method: 'get',
      url: pdfUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(tempPdfPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    const outRoot = path.join(process.cwd(), 'output', 'pdf-images');
    const jobDir = path.join(outRoot, String(Date.now()));
    fs.mkdirSync(jobDir, { recursive: true });
    // pdfimages will emit files like: <prefix>-000.png
    const prefix = path.join(jobDir, 'img');
    const args = ['-all', '-png', tempPdfPath, prefix];

    // Use full path to pdfimages on Windows for compatibility
    const pdfimagesPath =
      process.platform === 'win32'
        ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdfimages.exe'
        : 'pdfimages';

    const proc = spawn(pdfimagesPath, args);
    let stderrBuf = '';
    proc.stderr.on('data', (d) => (stderrBuf += d.toString()));
    proc.on('close', (code) => {
      // Clean up temp file
      fs.unlink(tempPdfPath, (err) => {
        if (err) console.warn('Failed to delete temp PDF:', err);
      });
      if (code !== 0) {
        return res.status(500).json({
          success: false,
          error: `pdfimages failed (code ${code})`,
          details: stderrBuf.trim() || 'Install Poppler (pdfimages) and ensure it is in PATH.',
        });
      }

      // Collect emitted images with rich metadata
      const files = fs.readdirSync(jobDir).filter((f) => /\.(png|jpg|jpeg|jpx|ppm|webp)$/i.test(f));
      const images = files.map((filename) => {
        const fullPath = path.join(jobDir, filename);
        let width = null,
          height = null,
          type = null,
          sizeBytes = null;

        try {
          const dims = sizeOf(fullPath); // { width, height, type }
          width = dims?.width || null;
          height = dims?.height || null;
          type = (dims?.type || '').toLowerCase(); // 'png', 'jpg', etc.
        } catch (_) {}

        try {
          const st = fs.statSync(fullPath);
          sizeBytes = st.size;
        } catch (_) {}
        return {
          name: filename,
          filename: filename,
          url: `/output/pdf-images/${path.basename(jobDir)}/${filename}`,
          width,
          height,
          type,
          sizeBytes,
        };
      });
      if (images.length === 0) {
        return res.status(204).json({ success: true, images: [] });
      }

      const jobId = path.basename(jobDir);

      // Record PDF extraction duration metric
      const duration = (Date.now() - startTime) / 1000;
      recordExtractPdfDuration(duration);

      return res.json({
        success: true,
        images,
        outputDir: `/output/pdf-images/${jobId}`,
        jobId,
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: 'Unexpected server error: ' + err.message,
    });
  }
});
// GET /api/extract-actions - extract images from "Actions" pages in PDF
// Query param: pdfUrl
app.get('/api/extract-actions', async (req, res) => {
  const startTime = Date.now();
  try {
    const pdfUrl = req.query.pdfUrl;
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      return res.status(400).json({ error: 'pdfUrl query parameter required' });
    }
    // Validate URL
    const urlValidation = await validateUrl(pdfUrl, {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });

    if (!urlValidation.valid) {
      console.warn(`URL validation failed for ${pdfUrl}: ${urlValidation.reason}`);
      return res.status(400).json({
        success: false,
        code: 'url_disallowed',
        message: 'URL not allowed by policy',
        requestId: req.headers['x-request-id'] || undefined,
      });
    }
    // Download PDF to temporary location
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const fileName = `temp_actions_${Date.now()}.pdf`;
    const tempPdfPath = path.join(tempDir, fileName);

    // Download the PDF
    const response = await axios({
      method: 'get',
      url: pdfUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(tempPdfPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    // Detect action pages using localized pdftotext with caching
    const pdfKey = String(req.query.pdfUrl || '').trim();
    const langsParam = req.query.langs || req.query.lang || 'en';
    const extraKeywords = req.query.extraKeywords || '';

    const cacheKey = buildDetectCacheKey(pdfKey, langsParam, extraKeywords);
    let actionPages = detectCacheGet(cacheKey);
    let cacheStatus = 'MISS';

    if (!actionPages) {
      // Use existing localized detector
      actionPages = await detectActionPagesLocalized(tempPdfPath, {
        langs: langsParam,
        extraKeywords,
      });
      detectCacheSet(cacheKey, actionPages);
      cacheStatus = 'STORE';
    } else {
      cacheStatus = 'HIT';
    }

    if (actionPages.length === 0) {
      // Clean up temp file
      fs.unlink(tempPdfPath, (err) => {
        if (err) console.warn('Failed to delete temp PDF:', err);
      });
      return res.json([]); // No actions pages detected
    }
    // Create job directory
    const jobTs = new Date().toISOString().replace(/[:.]/g, '-');
    const jobDir = path.join(process.cwd(), 'output', 'actions', jobTs);
    fs.mkdirSync(jobDir, { recursive: true });
    // Extract images for detected action pages
    const images = await extractForActionPages(tempPdfPath, actionPages, jobDir);

    // Clean up temp file
    fs.unlink(tempPdfPath, (err) => {
      if (err) console.warn('Failed to delete temp PDF:', err);
    });

    // Filter out small images (< 12000 pixels area)
    const filteredImages = images.filter((img) => {
      const area = (img.width || 0) * (img.height || 0);
      return area >= 12000;
    });

    // Optional debug headers
    res.set('X-Actions-Cache', cacheStatus);
    if (Array.isArray(actionPages) && actionPages.length) {
      res.set('X-Actions-Pages', actionPages.join(','));
    }

    // Record PDF extraction duration metric
    const duration = (Date.now() - startTime) / 1000;
    recordExtractPdfDuration(duration);

    res.json(filteredImages);
  } catch (err) {
    console.error('extract-actions error:', err);
    return res.status(500).json({ error: 'Failed to extract actions images: ' + err.message });
  }
});
// Heuristics utilities
function inferSource(fileName) {
  // Match your naming: pN_img-001.png => "embedded", pN_snap.png => "snapshot"
  return /_snap(?:\.|$)/i.test(fileName) ? 'snapshot' : 'embedded';
}
function aspectPenalty(w, h) {
  const aspect = w / Math.max(1, h);
  // Mild penalty for odd shapes, stronger penalty for extreme shapes
  let p = 0;
  if (aspect < 0.3 || aspect > 3.5) p -= 0.75;
  if (aspect < 0.2 || aspect > 5.0) p -= 0.5;
  return p;
}
function computeScore(meta) {
  const { width: w = 0, height: h = 0, format = 'png', source = 'embedded', fileSize = 0 } = meta;
  const area = w * h;
  // Base score grows with area (log to dampen huge images)
  let s = Math.log10(1 + area); // ~0..6 range for typical sizes
  // Prefer PNG slightly (often used for assets with transparency)
  if (String(format).toLowerCase() === 'png') s += 0.3;
  // Prefer embedded slightly over snapshots (if both exist)
  if (source === 'embedded') s += 0.2;
  else if (source === 'snapshot') s -= 0.05;
  // Penalize odd/extreme aspect ratios
  s += aspectPenalty(w, h);
  // Tiny artifacts are already filtered by your 12,000 px rule; add a soft nudge for very small file sizes
  if (fileSize > 0 && fileSize < 8_000) s -= 0.25;
  // Keep stable decimals
  return Number(s.toFixed(3));
}
// In-memory cache for pdftotext page detection (no deps)
const ACTIONS_DETECT_CACHE = new Map();
// Defaults: 10 minutes TTL, max 50 entries
const ACTIONS_DETECT_TTL_MS = Number(process.env.ACTIONS_DETECT_TTL_MS || 10 * 60 * 1000);
const ACTIONS_DETECT_MAX = Number(process.env.ACTIONS_DETECT_MAX || 50);
function nowMs() {
  return Date.now();
}
function normalizeLangsKey(langsParam) {
  if (!langsParam) return 'en';
  const raw = Array.isArray(langsParam)
    ? langsParam
    : String(langsParam)
      .split(/[,\s]+/)
      .filter(Boolean);
  if (raw.length === 1 && /^(multi|all|auto)$/i.test(raw[0])) return 'all';
  const uniq = Array.from(new Set(raw.map((s) => s.toLowerCase()))).sort();
  return uniq.join(',');
}
function normalizeExtraKey(extra) {
  return String(extra || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function buildDetectCacheKey(pdfKey, langsParam, extraKeywords) {
  const lk = normalizeLangsKey(langsParam);
  const ek = normalizeExtraKey(extraKeywords);
  return `${pdfKey}||langs=${lk}||extra=${ek}`;
}
function detectCacheGet(key) {
  const entry = ACTIONS_DETECT_CACHE.get(key);
  if (!entry) return null;
  if (nowMs() - entry.ts > ACTIONS_DETECT_TTL_MS) {
    ACTIONS_DETECT_CACHE.delete(key);
    return null;
  }
  return entry.pages;
}
function detectCacheSet(key, pages) {
  // Naive LRU-ish eviction: drop oldest when over capacity
  if (ACTIONS_DETECT_CACHE.size >= ACTIONS_DETECT_MAX) {
    const oldestKey = ACTIONS_DETECT_CACHE.keys().next().value;
    if (oldestKey) ACTIONS_DETECT_CACHE.delete(oldestKey);
  }
  ACTIONS_DETECT_CACHE.set(key, { ts: nowMs(), pages });
}
// [NEW] Language keyword sets and matching helpers
const KEYWORDS_BY_LANG = {
  en: [
    'actions',
    'action',
    'on your turn',
    'turn actions',
    'action phase',
    'available actions',
    'actions available',
  ],
  fr: [
    'actions',
    'action',
    'vos actions',
    'à votre tour',
    'a votre tour',
    'pendant votre tour',
    'phase d\'actions',
    'phase d\'actions',
    'actions disponibles',
  ],
  es: [
    'acciones',
    'accion',
    'en tu turno',
    'acciones disponibles',
    'fase de acciones',
    'acciones posibles',
  ],
  de: [
    'aktionen',
    'aktion',
    'in deinem zug',
    'aktionsphase',
    'verfügbare aktionen',
    'verfugbare aktionen',
  ],
  it: [
    'azioni',
    'azione',
    'nel tuo turno',
    'fase azioni',
    'fase delle azioni',
    'azioni disponibili',
  ],
};
function normalizeBasic(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[''`´]/g, "'"); // unify apostrophes
}
function canonicalizePageText(s) {
  // Join hyphenated line-breaks and collapse whitespace after normalization
  const joined = String(s || '').replace(/-\s*[\r\n]+\s*/g, '');
  const norm = normalizeBasic(joined);
  return norm
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function toBoundaryPattern(keyword) {
  // Allow flexible whitespace between tokens; require non-[a-z0-9] boundaries
  const kn = normalizeBasic(keyword).trim().replace(/\s+/g, ' ');
  if (!kn) return null;
  const tokens = kn.split(' ').map(escapeRegex);
  const core = tokens.join('\\s+');
  return new RegExp(`(^|[^a-z0-9])${core}([^a-z0-9]|$)`);
}
function parseLangsParam(langsParam) {
  if (!langsParam) return ['en'];
  let raw = Array.isArray(langsParam) ? langsParam : String(langsParam).split(/[,\s]+/);
  raw = raw.filter(Boolean).map((s) => s.toLowerCase());
  if (raw.length === 1 && /^(multi|all|auto)$/.test(raw[0])) {
    return Object.keys(KEYWORDS_BY_LANG);
  }
  return raw.filter((code) => KEYWORDS_BY_LANG[code]);
}
function buildKeywords(langsParam, extraKeywords) {
  const langs = parseLangsParam(langsParam);
  const set = new Set();
  langs.forEach((code) => KEYWORDS_BY_LANG[code].forEach((k) => set.add(k)));
  if (extraKeywords) {
    String(extraKeywords)
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((k) => set.add(k));
  }
  return Array.from(set);
}
// [REPLACE] Localized detection
function detectActionPagesLocalized(pdfPath, { langs = 'en', extraKeywords = '' } = {}) {
  // Use full path to pdftotext on Windows for compatibility
  const pdftotextPath =
    process.platform === 'win32'
      ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdftotext.exe'
      : 'pdftotext';

  const res = spawnSync(pdftotextPath, ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.warn('pdftotext failed:', res.stderr);
    return []; // Return empty array instead of throwing
  }
  const text = res.stdout || '';
  // Compile keyword regexes once
  const keywords = buildKeywords(langs, extraKeywords);
  const patterns = keywords.map(toBoundaryPattern).filter(Boolean);
  const pages = [];
  let p = 1,
    buf = '';
  for (const ch of text) {
    if (ch === '\f') {
      const canon = canonicalizePageText(buf);
      if (patterns.some((rx) => rx.test(canon))) pages.push(p);
      p += 1;
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length) {
    const canon = canonicalizePageText(buf);
    if (patterns.some((rx) => rx.test(canon))) pages.push(p);
  }
  return pages;
}
// Legacy function for backward compatibility
function detectActionPages(pdfPath) {
  return detectActionPagesLocalized(pdfPath, {
    langs: 'en',
    extraKeywords: '',
  });
}
// Helper function to extract images from specific pages
async function extractForActionPages(pdfPath, pages, jobDir) {
  const images = [];

  // Use full paths to Poppler tools on Windows
  const pdfimagesPath =
    process.platform === 'win32'
      ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdfimages.exe'
      : 'pdfimages';
  const pdftocairoPath =
    process.platform === 'win32'
      ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdftocairo.exe'
      : 'pdftocairo';

  for (const page of pages) {
    try {
      // Try to extract embedded images from this specific page
      const imgPrefix = path.join(jobDir, `p${page}_img`);
      const pdfimagesArgs = ['-png', '-f', String(page), '-l', String(page), pdfPath, imgPrefix];

      const pdfimagesResult = spawn(pdfimagesPath, pdfimagesArgs, {
        stdio: 'ignore',
      });

      await new Promise((resolve) => {
        pdfimagesResult.on('close', resolve);
      });

      // Check for extracted embedded images
      const embeddedFiles = fs
        .readdirSync(jobDir)
        .filter((f) => f.startsWith(`p${page}_img-`) && f.endsWith('.png'));

      if (embeddedFiles.length > 0) {
        // Found embedded images, process them
        for (const filename of embeddedFiles) {
          const fullPath = path.join(jobDir, filename);
          const imageData = await getImageMetadata(fullPath, page);
          if (imageData) {
            // Optional: filter extreme tiny artifacts in addition to 12,000 px rule
            const area = (imageData.width || 0) * (imageData.height || 0);
            if (area >= 48 * 48) {
              // Drop ultra-tiny items
              images.push(imageData);
            }
          }
        }
      } else {
        // No embedded images, create a page snapshot
        const snapPrefix = path.join(jobDir, `p${page}_snap`);
        const pdftocairoArgs = [
          '-png',
          '-singlefile',
          '-r',
          '200',
          '-f',
          String(page),
          '-l',
          String(page),
          pdfPath,
          snapPrefix,
        ];

        const pdftocairoResult = spawn(pdftocairoPath, pdftocairoArgs, {
          stdio: 'ignore',
        });

        await new Promise((resolve) => {
          pdftocairoResult.on('close', resolve);
        });

        const snapFile = `${snapPrefix}.png`;
        if (fs.existsSync(snapFile)) {
          const imageData = await getImageMetadata(snapFile, page);
          if (imageData) {
            // Optional: filter extreme tiny artifacts in addition to 12,000 px rule
            const area = (imageData.width || 0) * (imageData.height || 0);
            if (area >= 48 * 48) {
              // Drop ultra-tiny items
              images.push(imageData);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to process page ${page}:`, error);
    }
  }

  return images;
}
// Helper function to get image metadata
async function getImageMetadata(fullPath, page) {
  try {
    const stats = fs.statSync(fullPath);
    const dims = sizeOf(fullPath);
    const filename = path.basename(fullPath);

    // Create relative path for serving
    const relativePath = path
      .relative(path.join(process.cwd(), 'output'), fullPath)
      .replace(/\\/g, '/');

    const m = {
      url: `/output/${relativePath}`,
      path: fullPath,
      fileName: filename,
      name: filename,
      format: path.extname(fullPath).slice(1).toLowerCase(),
      width: dims?.width || null,
      height: dims?.height || null,
      fileSize: stats.size,
      sizeBytes: stats.size,
      type: (dims?.type || '').toLowerCase(),
      page,
      // New: source detection
      source: inferSource(filename),
    };

    // New: attach score
    m.score = computeScore(m);

    return m;
  } catch (error) {
    console.warn('Failed to get image metadata:', error);
    return null;
  }
}

app.post('/api/extract-bgg-html', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url)
      return res.status(400).json({
        success: false,
        code: 'url_disallowed',
        message: 'URL not allowed by policy',
        requestId: req.headers['x-request-id'] || undefined,
      });

    // Check cache first
    const cachedEntry = bggMetadataCache.get(url);
    if (cachedEntry) {
      return res.json({
        success: true,
        metadata: cachedEntry.metadata,
        source: cachedEntry.source || 'cache',
      });
    }

    // Add strong headers to avoid Cloudflare/bot detection
    let response;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
          },
          maxRedirects: 5,
        });

        // After fetch with redirect: re-validate final URL host
        const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
        if (finalUrl !== url) {
          const finalUrlValidation = await validateUrl(finalUrl, {
            allowHttpsOnly: true,
            allowPrivateIps: false,
          });

          if (!finalUrlValidation.valid) {
            console.warn(
              `Final URL validation failed for ${finalUrl}: ${finalUrlValidation.reason}`,
            );
            return res.status(400).json({
              success: false,
              code: 'url_disallowed',
              message: 'URL not allowed by policy',
              requestId: req.headers['x-request-id'] || undefined,
            });
          }
        }

        break; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        if (retryCount > maxRetries) {
          throw error; // Re-throw if max retries exceeded
        }
        // Calculate jitter: 250ms for first retry, 750ms for second
        const jitter = retryCount === 0 ? 250 : 750;
        console.warn(
          `BGG fetch attempt ${retryCount + 1} failed with ${error.response?.status || error.code || 'network error'}, retrying in ${jitter}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, jitter)); // Jittered backoff
      }
    }

    // Check if we got a Cloudflare/blocked page
    const responseBody = response.data;
    const contentType = response.headers['content-type'] || '';
    const contentLength = typeof responseBody === 'string' ? responseBody.length : 0;

    // Cache HTML responses for 30-60 seconds to avoid dev-time rate spikes
    if (
      process.env.NODE_ENV !== 'production' &&
      response.status === 200 &&
      contentType.includes('text/html')
    ) {
      const htmlCacheKey = `html_${url}`;
      bggMetadataCache.set(htmlCacheKey, {
        data: responseBody,
        timestamp: Date.now(),
        headers: response.headers,
      });
    }
    const isBlocked =
      responseBody.includes('Checking your browser') ||
      responseBody.includes('captcha') ||
      responseBody.includes('Cloudflare') ||
      responseBody.includes('Access denied') ||
      responseBody.includes('blocked') ||
      responseBody.includes('security check') ||
      (response.headers['server'] && response.headers['server'].includes('cloudflare')) ||
      response.status === 403 ||
      response.status === 401;

    // Also trigger fallback if content-type is not HTML or if we have very little content
    const shouldUseFallback =
      isBlocked || !contentType.includes('text/html') || contentLength < 100;

    if (shouldUseFallback) {
      console.error(
        'Blocked by Cloudflare or anti-bot protection, or non-HTML content. Using XML API fallback. Content-Type:',
        contentType,
        'Content-Length:',
        contentLength,
      );
      // Log response preview for debugging
      if (typeof responseBody === 'string') {
        const preview = responseBody.substring(0, 2000);
        console.warn('Response preview (first 2000 chars):', preview);
      }

      // Try fallback to XML API
      try {
        const gameId = extractGameIdFromBGGUrl(url);
        if (gameId) {
          const xmlApiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;

          // Check cache first for XML fallback (2-5 minutes)
          const cacheKey = `xml_fallback_${gameId}`;
          const cachedXml = bggMetadataCache.get(cacheKey);
          if (cachedXml && Date.now() - cachedXml.timestamp < 5 * 60 * 1000) {
            // 5 minutes cache
            console.log('Using cached XML fallback for game ID:', gameId);
            // Add cache control headers
            res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
            return res.json({
              success: true,
              metadata: cachedXml.metadata,
              source: 'xml_cached',
            });
          }

          const xmlResponse = await axios.get(xmlApiUrl, {
            timeout: 15000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
            },
          });

          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const data = parser.parse(xmlResponse.data);
          const game = data.items?.item;

          if (game) {
            const extractValue = (field) => {
              if (!field) return '';
              if (Array.isArray(field))
                return field.map((item) => item['@_value'] || item).join(', ');
              return field['@_value'] || field;
            };

            const fallbackMetadata = {
              title: extractValue(game.name),
              publisher: [],
              player_count: `${extractValue(game.minplayers)}-${extractValue(game.maxplayers)}`,
              play_time: `${extractValue(game.minplaytime)}-${extractValue(game.maxplaytime)}`,
              min_age: extractValue(game.minage),
              theme: [],
              mechanics: [],
              designers: [],
              artists: [],
              description: game.description || '',
              average_rating: game.statistics?.ratings?.average
                ? extractValue(game.statistics.ratings.average)
                : '',
              bgg_rank: '',
              bgg_id: gameId || '',
              year: extractValue(game.yearpublished),
              cover_image: game.image || '',
              thumbnail: game.thumbnail || '',
            };

            // Cache XML fallback for 2-5 minutes
            bggMetadataCache.set(cacheKey, {
              metadata: fallbackMetadata,
              timestamp: Date.now(),
            });

            bggMetadataCache.set(url, {
              metadata: fallbackMetadata,
              source: 'xml',
            });
            // Add cache control headers
            res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
            return res.json({
              success: true,
              metadata: fallbackMetadata,
              source: 'xml',
            });
          }
        }
      } catch (xmlError) {
        console.error('XML API fallback also failed:', xmlError.message);
        // Log error response if available
        if (xmlError.response) {
          console.error('XML API error response status:', xmlError.response.status);
          if (xmlError.response.data) {
            console.error(
              'XML API error response data:',
              xmlError.response.data.toString().substring(0, 1000),
            );
          }
        }
      }

      return res.status(500).json({
        error: 'Blocked by Cloudflare or anti-bot protection. Try again later.',
        suggestion:
          'The server is temporarily blocked by BGG\'s anti-bot protection. Please try again in a few minutes or use a different URL.',
        source: 'html',
      });
    }

    // Load cheerio for HTML parsing
    const cheerio = await import('cheerio');
    const $ = cheerio.load ? cheerio.load(responseBody) : require('cheerio').load(responseBody);

    // Try to extract OpenGraph data first
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    // If we have basic OpenGraph data, return a quick metadata object
    if (ogTitle && ogDescription) {
      const gameId = extractGameIdFromBGGUrl(url);
      const quickMetadata = {
        title: ogTitle,
        publisher: [],
        player_count: '',
        play_time: '',
        min_age: '',
        theme: [],
        mechanics: [],
        designers: [],
        artists: [],
        description: ogDescription,
        average_rating: '',
        bgg_rank: '',
        bgg_id: gameId || '',
        year: '',
        cover_image: ogImage,
        thumbnail: ogImage,
      };
      bggMetadataCache.set(url, { metadata: quickMetadata, source: 'html' });
      return res.json({
        success: true,
        metadata: quickMetadata,
        source: 'html',
      });
    }

    let mainContentText = $('#mainbody').text().trim() || $('body').text().trim();
    if (!mainContentText || mainContentText.length < 30) {
      // Log the HTML content for debugging
      console.warn(
        'BGG HTML content for debugging (first 2000 chars):',
        responseBody.substring(0, 2000),
      );
      return res.status(400).json({ error: 'No extractable content found on the page.' });
    }

    const prompt = `
You are an expert boardgame data extractor specializing in gathering information for creating high-quality YouTube tutorial videos. Extract the following metadata from the text below:
Required fields (return empty string if not found):
- name
- publisher
- player_count
- play_time
- minimum_age
- category
- mechanics
- designers
- artists
- description
- complexity_rating
- year_published
Tutorial-specific:
- components_list
- setup_complexity
- teaching_difficulty
- common_rules_mistakes
- notable_mechanics
- target_audience
- similar_games
Optional:
- image_urls
- average_rating
- bgg_rank
- expansions
Return clean JSON only.
Text:
"""${mainContentText.slice(0, 8000)}"""`;
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert boardgame metadata analyst.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 800,
    });
    const content = openaiResponse.choices[0].message.content;
    let rawMetadata;
    try {
      rawMetadata = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse JSON from OpenAI response:', content);
      return res.status(500).json({
        error: 'Failed to parse metadata JSON from OpenAI response',
        rawResponse: content,
      });
    }
    const mappedMetadata = {
      title: rawMetadata.name || '',
      publisher: Array.isArray(rawMetadata.publisher)
        ? rawMetadata.publisher
        : rawMetadata.publisher
          ? [rawMetadata.publisher]
          : [],
      player_count: rawMetadata.player_count || rawMetadata['player count'] || '',
      play_time: rawMetadata.play_time || rawMetadata['play time'] || '',
      min_age: rawMetadata.minimum_age || rawMetadata['minimum age'] || '',
      theme: Array.isArray(rawMetadata.category)
        ? rawMetadata.category
        : rawMetadata.category
          ? [rawMetadata.category]
          : [],
      mechanics: Array.isArray(rawMetadata.mechanics)
        ? rawMetadata.mechanics
        : rawMetadata.mechanics
          ? [rawMetadata.mechanics]
          : [],
      designers: Array.isArray(rawMetadata.designers)
        ? rawMetadata.designers
        : rawMetadata.designers
          ? [rawMetadata.designers]
          : [],
      artists: Array.isArray(rawMetadata.artists)
        ? rawMetadata.artists
        : rawMetadata.artists
          ? [rawMetadata.artists]
          : [],
      description: rawMetadata.description || '',
      average_rating: rawMetadata.average_rating || rawMetadata['average rating'] || '',
      bgg_rank: rawMetadata.bgg_rank || rawMetadata['BGG rank'] || '',
      bgg_id: gameId || '',
      year: rawMetadata.year_published || rawMetadata['year published'] || rawMetadata.year || '',
      cover_image:
        (rawMetadata.image_urls && rawMetadata.image_urls[0]) ||
        (rawMetadata['image URLs'] && rawMetadata['image URLs'][0]) ||
        '',
      thumbnail:
        (rawMetadata.image_urls && rawMetadata.image_urls[0]) ||
        (rawMetadata['image URLs'] && rawMetadata['image URLs'][0]) ||
        '',
    };
    bggMetadataCache.set(url, { metadata: mappedMetadata, source: 'html' });
    res.json({ success: true, metadata: mappedMetadata, source: 'html' });
  } catch (error) {
    console.error('Error in /api/extract-bgg-html:', error.message);
    res.status(500).json({
      error: 'Failed to extract BGG metadata from HTML',
      details: error.message,
      suggestion: 'Try again later or use the XML API fallback by providing a direct BGG URL.',
    });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});
// Enhanced PDF upload endpoint with better error messages
const uploadPdf = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('DEBUG: Multer fileFilter called');
    console.log('DEBUG: file.originalname:', file.originalname);
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    console.log('DEBUG: File extension:', ext);
    if (ext !== '.pdf') {
      return cb(new Error('Only PDF files are allowed. File must have .pdf extension.'));
    }

    // Check MIME type
    console.log('DEBUG: file.mimetype:', file.mimetype);
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Invalid file type. File must be a valid PDF document.'));
    }

    cb(null, true);
  },
});

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        code: 'pdf_oversize',
        message: 'File too large. Maximum size allowed is 50MB.',
        suggestion: 'Please upload a smaller PDF file (under 50MB).',
      });
    }
  }

  // Handle other multer errors
  if (error.message && error.message.includes('PDF')) {
    return res.status(400).json({
      success: false,
      code: 'pdf_bad_mime',
      message: error.message,
      suggestion: 'Please ensure you\'re uploading a valid PDF file with .pdf extension.',
    });
  }

  // Pass through other errors
  next(error);
});

// Add PDF signature checking function
function looksLikePdf(buf) {
  // PDF header starts with "%PDF-"
  return buf && buf.length > 4 && buf.slice(0, 5).toString('ascii') === '%PDF-';
}

app.post('/upload-pdf', uploadPdf.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 'pdf_no_file',
        message: 'No file uploaded. Please select a PDF file to upload.',
      });
    }

    // Validate PDF file with detailed error messages
    const validation = await validatePDFFile(req.file.path);
    if (!validation.valid) {
      // Clean up uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('Failed to clean up uploaded file:', unlinkError.message);
      }

      // Return structured error code
      return res.status(400).json({
        success: false,
        code: 'pdf_parse_failed',
        message: validation.error,
        suggestion: 'Please ensure your PDF file is valid and under 50MB in size.',
        validationDetails: {
          fileSize: req.file.size,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
        },
      });
    }

    // Additional safety check: verify PDF signature
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      if (!looksLikePdf(fileBuffer)) {
        // Clean up uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.warn('Failed to clean up uploaded file:', unlinkError.message);
        }

        return res.status(400).json({
          success: false,
          code: 'pdf_bad_signature',
          message: 'Invalid PDF file - missing PDF signature',
          suggestion:
            'The uploaded file does not appear to be a valid PDF document. Please check the file and try again.',
          validationDetails: {
            fileSize: req.file.size,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            hasPdfSignature: false,
          },
        });
      }
    } catch (readError) {
      // Clean up uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('Failed to clean up uploaded file:', unlinkError.message);
      }

      return res.status(500).json({
        success: false,
        code: 'pdf_parse_failed',
        message: 'Failed to read uploaded file for validation',
        suggestion: 'There was an error reading the uploaded file. Please try again.',
        validationDetails: {
          fileSize: req.file.size,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
        },
      });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      pdfPath: req.file.path,
      filename: req.file.originalname,
      size: req.file.size,
      validationDetails: {
        fileSize: req.file.size,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        hasPdfSignature: true,
      },
    });
  } catch (error) {
    // Clean up uploaded file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('Failed to clean up uploaded file:', unlinkError.message);
      }
    }

    console.error('PDF upload error:', error);
    res.status(500).json({
      success: false,
      code: 'pdf_upload_failed',
      message: 'Failed to upload PDF: ' + error.message,
      suggestion: 'Please try uploading a smaller PDF file (< 50MB) or check file permissions.',
      validationDetails: req.file
        ? {
          fileSize: req.file.size,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
        }
        : null,
    });
  }
});
app.post('/api/fetch-bgg-images', async (req, res) => {
  try {
    const { gameName } = req.body;
    if (!gameName) return res.status(400).json({ error: 'Game name is required' });
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(gameName)}&type=boardgame`;
    const searchResponse = await axios.get(searchUrl);
    const searchData = searchResponse.data;
    const gameMatch = searchData.match(/<item[^>]*id="(\d+)"[^>]*>/);
    if (!gameMatch) return res.status(404).json({ error: 'Game not found on BGG' });
    const gameId = gameMatch[1];
    const gameUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}`;
    const gameResponse = await axios.get(gameUrl);
    const gameData = gameResponse.data;
    const imageUrls = [];
    const imageMatches = gameData.match(/<image[^>]*>([^<]+)<\/image>/g);
    const thumbnailMatches = gameData.match(/<thumbnail[^>]*>([^<]+)<\/thumbnail>/g);
    if (imageMatches) {
      imageMatches.forEach((match) => {
        const url = match.replace(/<\/?image[^>]*>/g, '');
        if (url && url.startsWith('http')) imageUrls.push({ url, type: 'image' });
      });
    }
    if (thumbnailMatches) {
      thumbnailMatches.forEach((match) => {
        const url = match.replace(/<\/?thumbnail[^>]*>/g, '');
        if (url && url.startsWith('http')) imageUrls.push({ url, type: 'thumbnail' });
      });
    }
    if (imageUrls.length === 0)
      return res.status(404).json({ error: 'No images found for this game' });
    const outDir = path.join(__dirname, 'uploads', 'images');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const images = [];
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const { url, type } = imageUrls[i];
        const resp = await axios.get(url, { responseType: 'stream' });
        const filename = `bgg_${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${type}_${i + 1}.jpg`;
        const filepath = path.join(outDir, filename);
        const writer = fs.createWriteStream(filepath);
        resp.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        let servedPath = `/uploads/images/${filename}`;
        images.push({
          id: `bgg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          filename,
          name: filename,
          path: servedPath,
          type,
          source: 'BGG',
        });
      } catch (e) {
        console.error(`Failed to download image ${i + 1}:`, e.message);
      }
    }
    const validImages = images.filter(
      (img) => img && img.path && existsSync(path.join(__dirname, img.path.replace(/^\/+/, ''))),
    );
    res.json({ success: true, images: validImages });
  } catch (error) {
    console.error('BGG fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch BGG images: ' + error.message });
  }
});
// Add this under your other routes (e.g., below /api/fetch-bgg-images)
app.post('/api/search-images', async (req, res) => {
  try {
    const { gameName, bggId, pageLimit = 2, max = 60 } = req.body || {};
    let id = bggId;
    if (!id) {
      if (!gameName || !gameName.trim()) {
        return res.status(400).json({ error: 'Provide gameName or bggId' });
      }
      // Find BGG ID by gameName (same approach as /api/fetch-bgg-images)
      const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(gameName)}&type=boardgame`;
      const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
      const match = searchResponse.data.match(/<item[^>]*id="(\d+)"[^>]*>/);
      if (!match) return res.status(404).json({ error: 'Game not found on BGG for image search' });
      id = match[1];
    }
    const pages = Math.min(Math.max(1, Number(pageLimit) || 1), 5);
    const galleryUrls = Array.from(
      { length: pages },
      (_, i) => `https://boardgamegeek.com/boardgame/${id}/images?pageid=${i + 1}`,
    );
    const images = [];
    for (const url of galleryUrls) {
      try {
        const imgUrls = await extractImagesFromUrl(url, IMAGE_EXTRACTOR_API_KEY, 'basic');
        for (const imgUrl of imgUrls) {
          if (!/^https?:\/\//i.test(imgUrl)) continue;
          let name;
          try {
            name = path.basename(new URL(imgUrl).pathname);
          } catch {
            name = path.basename(imgUrl);
          }
          images.push({
            id: `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            path: imgUrl,
            source: 'web',
            type: 'other',
            name: name || 'web_image',
            preview: null,
          });
        }
      } catch (e) {
        console.warn('search-images extract failed for', url, e.message);
      }
    }
    // Dedupe by exact path and clamp to max
    const seen = new Set();
    const deduped = [];
    for (const img of images) {
      if (seen.has(img.path)) continue;
      seen.add(img.path);
      deduped.push(img);
      if (deduped.length >= max) break;
    }
    res.json({ success: true, images: deduped, bggId: id });
  } catch (err) {
    console.error('search-images error:', err);
    res.status(500).json({ error: 'Search images failed', details: err.message });
  }
});
app.post('/api/extract-extra-images', async (req, res) => {
  try {
    const raw = req.body.extraImageUrls || req.body.urls;
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      return res.status(400).json({ error: 'No extra image URLs provided' });
    }
    let urls = Array.isArray(raw) ? raw : String(raw).split(/,|\n|;/);
    urls = urls.map((u) => u.trim()).filter(Boolean);
    urls = Array.from(new Set(urls));
    const validUrls = urls.filter((u) => /^https?:\/\//i.test(u));
    const invalidUrls = urls.filter((u) => !/^https?:\/\//i.test(u));
    const extraImages = [];
    for (const url of validUrls) {
      try {
        if (!IMAGE_EXTRACTOR_API_KEY) {
          console.error('IMAGE_EXTRACTOR_API_KEY is not set');
          continue;
        }
        const imageUrls = await extractImagesFromUrl(url, IMAGE_EXTRACTOR_API_KEY, 'basic');
        for (const imgUrl of imageUrls) {
          let name;
          try {
            name = path.basename(new URL(imgUrl).pathname);
          } catch {
            name = path.basename(imgUrl);
          }
          extraImages.push({
            id: `ext-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            path: imgUrl,
            source: 'image_extractor',
            type: 'other',
            description: '',
            name: name || `Image from ${url}`,
            preview: null,
            originalUrl: url,
          });
        }
      } catch (err) {
        console.error(`Failed to extract from ${url}:`, err);
      }
    }
    return res.json({
      success: true,
      extraImages,
      totalFound: extraImages.length,
      invalidUrls,
    });
  } catch (err) {
    console.error('Extra image extraction error:', err);
    return res.status(500).json({ error: 'Failed to extract extra images', details: err.message });
  }
});
app.post('/extract-images', async (req, res) => {
  try {
    const { sources } = req.body;
    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: 'No image sources provided' });
    }
    const results = [];
    for (const source of sources) {
      const extracted = await extractAndStoreImagesSafe(
        source,
        path.join(__dirname, 'uploads', 'extracted-images'),
      );
      results.push(...extracted);
    }
    return res.json({
      success: true,
      images: results,
      totalFound: results.length,
    });
  } catch (err) {
    console.error('Error extracting images:', err);
    res.status(500).json({ error: 'Failed to extract images', details: err.message });
  }
});
app.post('/crop-component', async (req, res) => {
  console.log('--- Component cropping started ---');
  try {
    const { imagePath, x, y, width, height, name, gameName } = req.body;
    if (!imagePath || !width || !height || !name || !gameName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    let absoluteSourcePath = null;
    if (isHttpUrl(imagePath)) {
      return res.status(400).json({
        error: 'Cropping remote URLs is not supported. Download the image first.',
      });
    } else if (path.isAbsolute(imagePath)) {
      absoluteSourcePath = imagePath;
    } else if (imagePath.startsWith('/uploads/')) {
      absoluteSourcePath = path.join(__dirname, imagePath.replace(/^\//, ''));
    } else {
      absoluteSourcePath = path.join(__dirname, imagePath);
    }
    const gameDir = path.join(
      OUTPUT_DIR,
      `${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${getDateString()}`,
    );
    const componentsDir = path.join(gameDir, 'components');
    await ensureDir(componentsDir);
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || `component_${Date.now()}`;
    const outPath = path.join(componentsDir, `${safeName}.png`);

    // Use alpha-safe cropping to preserve transparency
    const success = await AlphaOps.cropWithAlpha(absoluteSourcePath, outPath, {
      x,
      y,
      width,
      height,
    });
    if (!success) {
      throw new Error('Failed to crop component with alpha preservation');
    }
    res.json({
      name: safeName,
      path: path.relative(OUTPUT_DIR, outPath).replace(/\\/g, '/'),
      fullPath: outPath,
    });
  } catch (err) {
    console.error('Component cropping error:', err);
    res.status(500).json({ error: 'Failed to crop component', details: err.message });
  }
});
async function extractMetadata(rulebookText) {
  const prompt = `You are an expert boardgame analyst. Extract the following JSON:
{
  "title": "",
  "designer": "",
  "artist": "",
  "publisher": "",
  "year_published": "",
  "player_count": "",
  "recommended_age": "",
  "play_time": "",
  "components": [],
  "short_description": "",
  "mechanics": [],
  "categories": [],
  "setup_summary": "",
  "win_condition": "",
  "notable_rules": []
}
Use only the text.
Rulebook text:
${rulebookText.slice(0, 2000)}`;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a precise metadata extractor.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.5,
    });
    const metadata = JSON.parse(response.choices[0].message.content.trim());
    return metadata;
  } catch (err) {
    console.error('Error parsing metadata JSON:', err);
    return {
      publisher: 'Not found',
      playerCount: 'Not found',
      gameLength: 'Not found',
      minimumAge: 'Not found',
      theme: 'Not found',
      edition: 'Not found',
    };
  }
}
async function summarizeChunkEnglish(chunk) {
  const prompt = `You are an expert boardgame explainer. Write a concise summary with structure:
1. Game overview
2. Components
3. Setup
4. Turn structure and main actions
5. How the game ends and how to win
6. Notable rules
${chunk}`;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a professional boardgame educator and scriptwriter.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('English chunk summarization error:', error);
    return 'Error summarizing chunk.';
  }
}
app.post('/summarize', async (req, res) => {
  console.log('--- Summarization started ---');
  const startTime = Date.now();

  try {
    const {
      rulebookText,
      language = 'english',
      gameName,
      metadata,
      detailPercentage = 35,
      resummarize = false,
      baseWordCount = 0,
      previousSummary = '',
      components = [],
      targetWordCount = 0,
      rulebookWordCount = 0,
    } = req.body;
    console.log(
      `Processing for game: ${gameName}, language: ${language}, detail: ${detailPercentage}%, rulebook words: ${rulebookWordCount}`,
    );

    if (!rulebookText) {
      console.log('Error: No rulebook text provided');
      return res.status(400).json({ error: 'No rulebook text provided' });
    }
    if (!gameName) {
      console.log('Error: No game name provided');
      return res.status(400).json({ error: 'No game name provided' });
    }
    const extractedMetadata = await extractMetadata(rulebookText);
    let tempMetadata = {
      publisher: metadata?.publisher || extractedMetadata.publisher,
      playerCount: metadata?.playerCount || extractedMetadata.playerCount,
      gameLength: metadata?.gameLength || extractedMetadata.gameLength,
      minimumAge: metadata?.minimumAge || extractedMetadata.minimumAge,
      theme: metadata?.theme || extractedMetadata.theme,
      edition: metadata?.edition || extractedMetadata.edition,
    };
    const metadataForPrompt = {};
    const fieldsToCustomize = {
      publisher: 'Publisher',
      playerCount: 'Player Count',
      gameLength: 'Game Length',
      minimumAge: 'Minimum Age',
      theme: 'Theme',
      edition: 'Edition',
    };
    for (const key in fieldsToCustomize) {
      metadataForPrompt[key] =
        tempMetadata[key] && tempMetadata[key] !== 'Not found' ? tempMetadata[key] : 'Not found';
    }
    if (metadataForPrompt.theme === 'Not found') {
      return res.status(200).json({ needsTheme: true, metadata: metadataForPrompt });
    }
    const chunks = splitIntoSections(rulebookText);
    const chunkSummaries = [];
    const maxChunks = 15;
    const chunksToProcess = Math.min(chunks.length, maxChunks);
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < chunksToProcess; i++) {
      const summary = await summarizeChunkEnglish(chunks[i]);
      chunkSummaries.push(summary);
      await delay(500);
    }
    let calculatedTargetWordCount = targetWordCount;

    // Enhanced target length calculation based on rulebook complexity
    if (!resummarize) {
      if (rulebookWordCount > 0) {
        // Base calculation: 12-18% of rulebook length depending on complexity
        const complexityFactor =
          rulebookWordCount > 5000 ? 0.12 : rulebookWordCount > 2000 ? 0.15 : 0.18;
        const baseWords = Math.round(rulebookWordCount * complexityFactor);
        // Adjust by detail percentage (35% is the baseline)
        calculatedTargetWordCount = Math.round(baseWords * (detailPercentage / 35));
      } else {
        // Fallback for when we don't have rulebook word count
        calculatedTargetWordCount = detailPercentage < 25 ? 400 : detailPercentage > 50 ? 800 : 600;
      }
    }

    let finalTargetWordCount = 0;
    if (resummarize && baseWordCount > 0 && typeof detailPercentage === 'number') {
      finalTargetWordCount = Math.round(baseWordCount * (1 + detailPercentage / 100));
    } else if (calculatedTargetWordCount > 0) {
      finalTargetWordCount = calculatedTargetWordCount;
    }

    const targetLengthLine =
      finalTargetWordCount > 0
        ? `Target length: approximately ${finalTargetWordCount} words (${Math.round(finalTargetWordCount / 150)}-${Math.round(finalTargetWordCount / 120)} minutes when spoken).`
        : 'Target length: aim for 5–15 minutes (20–30 for complex games).';
    function safeStringify(obj) {
      try {
        return JSON.stringify(obj ?? null, null, 2);
      } catch (e) {
        return String(obj);
      }
    }
    const componentsJson = safeStringify(components);
    const metadataJson = safeStringify(metadata);
    const previousSummaryBlock =
      resummarize && previousSummary ? `\nPrevious Summary:\n${previousSummary}\n` : '';
    const englishBasePrompt = `
    You are an expert boardgame educator. Write a complete, engaging, tutorial script for the game using ONLY the provided rulebook text and data blocks.
    ${targetLengthLine}
    Include sections: Introduction, Component Overview, Setup, Objective, Gameplay Flow, Key Rules & Special Cases, Example Turn, End Game & Scoring, Tips/Strategy/Common Mistakes, Variants & Expansions (if any), and Recap & CTA.
    Use conversational, friendly language and include visual cues in brackets (e.g., [Show close-up of cards]).
    `.trim();
    const contextHeader =
      resummarize && previousSummary
        ? 'Here is the rulebook text and additional context:'
        : 'Here is the rulebook text and data:';
    const contextBlock = [
      contextHeader,
      '',
      'Components List (JSON):',
      componentsJson,
      '',
      'Game Metadata (JSON):',
      metadataJson,
      previousSummaryBlock,
      'Rulebook Text:',
      typeof rulebookText === 'string' ? rulebookText : '',
    ].join('\n');
    const finalPrompt = `${englishBasePrompt}\n\n${contextBlock}`;
    const englishSummaryResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a master boardgame educator and scriptwriter.',
        },
        { role: 'user', content: finalPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      timeout: 120000, // 2 minutes timeout
    });
    const englishSummary = englishSummaryResponse.choices[0].message.content.trim();
    console.log(
      `AI summary generated in ${Date.now() - startTime}ms, length: ${englishSummary.length} chars`,
    );

    let finalOutputSummary = englishSummary;
    if (language === 'french') {
      try {
        const translationResponse = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content:
                'You are a professional English-to-French translator specializing in boardgame content.',
            },
            {
              role: 'user',
              content: `Translate to French, preserving formatting:\n\n${englishSummary}`,
            },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        });
        finalOutputSummary = translationResponse.choices[0].message.content.trim();
      } catch (translateError) {
        console.error('Translation error:', translateError);
        return res.status(500).json({
          error: 'Translation failed',
          summary: englishSummary,
          metadata: metadataForPrompt,
          warning: 'Translation failed. Showing English version instead.',
        });
      }
    }
    const gameDir = path.join(
      OUTPUT_DIR,
      `${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${getDateString()}`,
    );
    await ensureDir(gameDir);
    const summaryContent =
      `# ${gameName} Tutorial Script\n` +
      `**Generated on**: ${new Date().toISOString()}\n` +
      `**Language**: ${language}\n` +
      `**Publisher**: ${metadataForPrompt.publisher}\n` +
      `**Player Count**: ${metadataForPrompt.playerCount}\n` +
      `**Game Length**: ${metadataForPrompt.gameLength}\n` +
      `**Minimum Age**: ${metadataForPrompt.minimumAge}\n` +
      `**Theme**: ${metadataForPrompt.theme}\n` +
      `**Edition**: ${metadataForPrompt.edition}\n` +
      finalOutputSummary;
    const summaryPath = path.join(gameDir, `summary_${language}.md`);
    await fsPromises.writeFile(summaryPath, summaryContent);

    const totalTime = Date.now() - startTime;
    console.log(`--- Summarization completed in ${totalTime}ms ---`);
    res.json({
      summary: finalOutputSummary,
      metadata: metadataForPrompt,
      components,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`Summarization failed after ${totalTime}ms:`, error);

    // Enhanced error handling for different types of errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(408).json({
        error:
          'Request timeout - AI processing took too long. Try reducing the rulebook text length or detail percentage.',
        timeout: true,
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'AI service rate limit exceeded. Please wait a moment and try again.',
        rateLimited: true,
      });
    }

    res.status(500).json({ error: 'Failed to generate summary', details: error.message });
  }
});
app.post('/api/generate-storyboard', async (req, res) => {
  try {
    const {
      metadata,
      images = [],
      components = [],
      language,
      voice,
      compImageOverrides = {},
      compImageMulti = {},
    } = req.body || {};
    const storyboard = await buildStoryboard({
      metadata,
      images,
      components,
      language,
      voice,
      compImageOverrides,
      compImageMulti,
    });
    res.json({ success: true, storyboard });
  } catch (err) {
    console.error('generate-storyboard failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// Simple in-memory cache for TTS audio
const ttsCache = new Map();
const MAX_CACHE_SIZE = 100;
// Function to generate cache key
async function generateTtsCacheKey(text, voice, language) {
  // Create a hash of the input parameters using dynamic import
  const { createHash } = await import('crypto');
  const hash = createHash('md5');
  hash.update(`${text}-${voice}-${language}`);
  return hash.digest('hex');
}
// Function to chunk long text into smaller segments
function chunkText(text, maxChunkSize = 2000) {
  // Split text into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    // If adding this sentence would exceed the chunk size, save the current chunk
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      // Otherwise, add the sentence to the current chunk
      currentChunk += sentence;
    }
  }

  // Add the last chunk if it exists
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
// Function to generate 0.2s silence in MP3 format
function generateSilence() {
  // Return a small buffer with MP3 silence (0.2s of silence)
  // This is a simplified approach - in practice, you might want to generate actual silence
  return Buffer.from([0xff, 0xfb, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}
app.post('/tts', async (req, res) => {
  const startTime = Date.now();
  const { text, voice, language, gameName } = req.body;

  console.log(
    `TTS request for game: ${gameName}, voice: ${voice}, text length: ${text?.length || 0}`,
  );

  // Record TTS request metric
  recordTtsRequest();

  if (!text) return res.status(400).json({ error: 'No text provided for TTS' });
  if (!gameName) return res.status(400).json({ error: 'No game name provided' });

  // Auto-select a default voice when none is provided
  let selectedVoice = voice;
  if (!selectedVoice) {
    // Default voices for different languages
    const defaultVoices = {
      en: '21m00Tcm4TlvDq8ikWAM', // Rachel
      fr: '21m00Tcm4TlvDq8ikWAM', // Rachel (multilingual)
      es: '21m00Tcm4TlvDq8ikWAM', // Rachel (multilingual)
      de: '21m00Tcm4TlvDq8ikWAM', // Rachel (multilingual)
      it: '21m00Tcm4TlvDq8ikWAM', // Rachel (multilingual)
    };

    // Select based on language, fallback to English
    selectedVoice = defaultVoices[language] || defaultVoices['en'];
    console.log(`No voice provided, auto-selected voice: ${selectedVoice}`);
  }

  // Check cache first
  const cacheKey = await generateTtsCacheKey(text, selectedVoice, language);
  if (ttsCache.has(cacheKey)) {
    console.log(`TTS cache hit for key: ${cacheKey}`);
    // Record cache hit metric
    recordTtsCacheHit();
    const cachedAudio = ttsCache.get(cacheKey);
    const totalTime = Date.now() - startTime;
    console.log(`TTS completed (cached) in ${totalTime}ms for ${text.length} characters`);
    return res.type('audio/mpeg').send(cachedAudio);
  }

  try {
    let audioBuffer;

    // If text is too long, chunk it and synthesize per chunk
    if (text.length > 3000) {
      console.log(`Text too long (${text.length} chars), chunking...`);
      const chunks = chunkText(text, 2000);
      const audioChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Synthesizing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`,
          { text: chunk, model_id: 'eleven_multilingual_v2' },
          {
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
            timeout: 45000, // 45 seconds timeout for TTS
          },
        );

        audioChunks.push(response.data);

        // Add 0.2s silence between chunks (except for the last chunk)
        if (i < chunks.length - 1) {
          audioChunks.push(generateSilence());
        }

        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Concatenate all audio chunks
      audioBuffer = Buffer.concat(audioChunks);
    } else {
      // For shorter text, synthesize directly
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`,
        { text, model_id: 'eleven_multilingual_v2' },
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 45000, // 45 seconds timeout for TTS
        },
      );
      audioBuffer = response.data;
    }

    // Cache the result
    if (ttsCache.size >= MAX_CACHE_SIZE) {
      // Remove the oldest entry
      const firstKey = ttsCache.keys().next().value;
      if (firstKey) ttsCache.delete(firstKey);
    }
    ttsCache.set(cacheKey, audioBuffer);
  } catch (error) {
    console.error('TTS generation error:', error);
    return res.status(500).json({ error: 'Failed to generate TTS audio' });
  }
  const totalTime = Date.now() - startTime;
  console.log(`TTS completed in ${totalTime}ms for ${text.length} characters`);
  return res.type('audio/mpeg').send(audioBuffer);
});
app.get('/load-project/:id', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  const projectId = req.params.id;
  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to load project' });
    }
    if (!row) return res.status(404).json({ error: 'Project not found' });
    try {
      res.json({
        id: row.id,
        name: row.name,
        metadata: JSON.parse(row.metadata),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load project' });
    }
  });
});

// Add configurable timeouts
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000;
const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS) || 5000;
const BGG_FETCH_TIMEOUT_MS = parseInt(process.env.BGG_FETCH_TIMEOUT_MS) || 10000;

// Apply timeout middleware
app.use((req, res, next) => {
  // Set request timeout
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    console.warn(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`);
    res.status(408).json({ error: 'Request timeout' });
  });

  // Set socket timeout
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    console.warn(`Response timeout after ${REQUEST_TIMEOUT_MS}ms`);
    res.status(408).json({ error: 'Response timeout' });
  });

  next();
});

// Enhanced health check with timeout configuration
app.get('/healthz', (req, res) => {
  // Set a shorter timeout for health checks
  req.setTimeout(HEALTH_CHECK_TIMEOUT_MS, () => {
    res.status(408).send('Health check timeout');
  });

  res.send('ok');
});

// Enhanced BGG fetching with timeout and retry logic
async function fetchBGGWithTimeout(url, timeout = BGG_FETCH_TIMEOUT_MS, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await axios.get(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
        timeout: timeout,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;

      // Calculate jitter: 250ms for first retry, 750ms for second
      const jitter = i === 0 ? 250 : 750;
      console.warn(
        `BGG fetch attempt ${i + 1} failed with ${error.response?.status || error.code || 'network error'}, retrying in ${jitter}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }
}

// BGG URL whitelist function for SSRF protection (using shared validator)
function isAllowedBGGUrl(raw) {
  return isAllowedUrl(raw);
}

// Enhanced start-extraction endpoint with better error handling and BGG URL validation
app.post('/start-extraction', async (req, res) => {
  try {
    const { bggUrl, extraImageUrls } = req.body;

    // Validate BGG URL if provided
    if (bggUrl && !isAllowedBGGUrl(bggUrl)) {
      return res.status(400).json({
        success: false,
        code: 'url_disallowed',
        message: 'URL not allowed by policy',
        requestId: req.headers['x-request-id'] || undefined,
      });
    }

    if (!bggUrl && !extraImageUrls) {
      return res.status(400).json({ error: 'Provide at least a BGG URL or Extra Image URLs.' });
    }

    let gameInfo = {};
    let components = [];

    if (bggUrl) {
      const bggIdMatch = bggUrl.match(/boardgame\/(\d+)/);
      if (!bggIdMatch) return res.status(400).json({ error: 'Invalid BGG URL format' });
      const gameId = bggIdMatch[1];
      const detailUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&type=boardgame&stats=1`;

      try {
        const response = await fetchBGGWithTimeout(detailUrl, BGG_FETCH_TIMEOUT_MS);
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const data = parser.parse(response.data);
        const game = data.items?.item;
        if (!game) throw new Error('Game not found on BGG');

        const extractValue = (field) => {
          if (!field) return '';
          if (Array.isArray(field)) return field.map((item) => item['@_value'] || item).join(', ');
          return field['@_value'] || field;
        };

        gameInfo = {
          success: true,
          bggId: gameId,
          gameName: extractValue(game.name),
          imageUrl: game.image || '',
          thumbnailUrl: game.thumbnail || '',
          description: game.description || '',
          yearPublished: extractValue(game.yearpublished) || '',
          minPlayers: game.minplayers ? game.minplayers['@_value'] : '',
          maxPlayers: game.maxplayers ? game.maxplayers['@_value'] : '',
          minPlayTime: game.minplaytime ? game.minplaytime['@_value'] : '',
          maxPlayTime: game.maxplaytime ? game.maxplaytime['@_value'] : '',
          playingTime: game.playingtime ? game.playingtime['@_value'] : '',
          minAge: game.minage ? game.minage['@_value'] : '',
          publishers: [],
          designers: [],
          artists: [],
          categories: [],
          mechanics: [],
          rating: '',
          rank: '',
          bggUrl: bggUrl,
        };

        if (game.link && Array.isArray(game.link)) {
          game.link.forEach((link) => {
            const type = link['@_type'];
            const value = link['@_value'];
            switch (type) {
              case 'boardgamepublisher':
              gameInfo.publishers.push(value);
              break;
              case 'boardgamedesigner':
              gameInfo.designers.push(value);
              break;
              case 'boardgameartist':
              gameInfo.artists.push(value);
              break;
              case 'boardgamecategory':
              gameInfo.categories.push(value);
              break;
              case 'boardgamemechanic':
              gameInfo.mechanics.push(value);
              break;
            }
          });
        }

        if (game.statistics?.ratings) {
          const ratings = game.statistics.ratings;
          gameInfo.rating = ratings.average ? ratings.average['@_value'] : '';
          if (ratings.ranks?.rank) {
            const ranks = Array.isArray(ratings.ranks.rank)
              ? ratings.ranks.rank
              : [ratings.ranks.rank];
            const overallRank = ranks.find((r) => r['@_name'] === 'boardgame');
            gameInfo.rank = overallRank ? overallRank['@_value'] : '';
          }
        }

        try {
          const bggExtractionResponse = await axios.get(
            `http://localhost:${port}/api/bgg-components?url=${encodeURIComponent(bggUrl)}`,
          );
          const extractedComponents = bggExtractionResponse.data.components || [];
          components = extractedComponents.map((c) => ({
            name: typeof c === 'string' ? c : c.name,
            quantity: typeof c === 'object' && c.quantity ? c.quantity : null,
            selected: true,
            source: 'BGG_robust_extraction',
          }));
        } catch (e) {
          console.error('BGG robust component extraction failed:', e.message);
          if (game.description) {
            const desc = game.description.toLowerCase();
            const extracted = extractComponentsFromText(desc);
            extracted.forEach((comp) => {
              if (!components.some((c) => c.name.toLowerCase() === comp.name.toLowerCase())) {
                components.push({
                  ...comp,
                  selected: true,
                  source: 'BGG_description_fallback',
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('BGG fetch error:', error);
        return res.status(500).json({
          error: 'Failed to fetch BGG data: ' + error.message,
          suggestion:
            'Please check your internet connection or try again later. If the problem persists, the BGG API might be temporarily unavailable.',
        });
      }
    }

    if (extraImageUrls) {
      if (Array.isArray(extraImageUrls)) {
        for (const url of extraImageUrls) {
          // Validate extra image URLs
          if (!isAllowedBGGUrl(url)) {
            return res.status(400).json({
              success: false,
              code: 'url_disallowed',
              message: 'URL not allowed by policy',
              requestId: req.headers['x-request-id'] || undefined,
            });
          }

          try {
            const extracted = await extractAndStoreImagesSafe(
              url,
              path.join(__dirname, 'uploads', 'images'),
            );
            components.push(...extracted);
          } catch (error) {
            console.error('Failed to extract image:', error);
            return res.status(500).json({
              error: 'Failed to extract image: ' + error.message,
              suggestion:
                'Please check the URL and try again. If the problem persists, the image might be invalid or inaccessible.',
            });
          }
        }
      } else {
        return res.status(400).json({ error: 'extraImageUrls should be an array' });
      }
    }

    res.json({
      success: true,
      gameInfo,
      components,
    });
  } catch (error) {
    console.error('Start extraction error:', error);
    res.status(500).json({
      error: 'Failed to start extraction: ' + error.message,
      suggestion:
        'Please check the server logs for more details or try again with a smaller PDF file.',
    });
  }
});

// Use the enhanced PDF upload endpoint defined earlier

// Projects endpoint
app.get('/api/projects', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM projects').all();
    const projects = rows
      .map((row) => {
        try {
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            components: JSON.parse(row.components),
            images: JSON.parse(row.images),
            script: row.script,
            audio: row.audio,
            created_at: row.created_at,
          };
        } catch (parseErr) {
          console.error('Failed to parse project data:', parseErr);
          return null;
        }
      })
      .filter(Boolean);

    res.json(projects);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Enhanced health details endpoint
app.get('/api/health/details', async (req, res) => {
  try {
    // Import event loop metrics
    const { getEventLoopDelayMs, getResourceUsage, getMemoryUsage } = await import(
      './eventLoopMetrics.js'
    );

    // Get git info
    let gitSha = 'unknown';
    let gitBranch = 'unknown';
    try {
      const { execSync } = await import('child_process');
      gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
      }).trim();
    } catch (e) {
      // Git not available
    }
    // Get poppler version
    let popplerVersion = 'unknown';
    try {
      const { spawnSync } = await import('child_process');
      const pdfimagesPath =
        process.platform === 'win32'
          ? 'C:\\Release-24.08.0-0\\poppler-24.08.0\\Library\\bin\\pdfimages.exe'
          : 'pdfimages';
      const result = spawnSync(pdfimagesPath, ['-v'], { encoding: 'utf8' });
      if (result.stderr) {
        const match = result.stderr.match(/poppler version (\d+\.\d+\.\d+)/i);
        if (match) {
          popplerVersion = match[1];
        }
      }
    } catch (e) {
      // Poppler not available
    }
    // Check if OUTPUT_DIR is writable using dynamic import
    let outputDirWritable = false;
    try {
      const { writeFileSync, unlinkSync } = await import('fs');
      const testFile = `${OUTPUT_DIR}/.write_test`;
      writeFileSync(testFile, 'test');
      unlinkSync(testFile);
      outputDirWritable = true;
    } catch (e) {
      // Not writable
    }
    // Get event loop and resource metrics
    const eventLoopDelayMs = getEventLoopDelayMs();
    const resourceUsage = getResourceUsage();
    const memoryUsage = getMemoryUsage();
    res.json({
      ok: true,
      service: 'mobius-games-tutorial-generator',
      version: '1.0.0',
      time: new Date().toISOString(),
      git: {
        sha: gitSha,
        branch: gitBranch,
      },
      node: process.version,
      poppler: {
        version: popplerVersion,
      },
      paths: {
        uploadsDir: UPLOADS_DIR,
        outputDir: OUTPUT_DIR,
        staticMounts: ['/static', '/uploads', '/output'],
      },
      permissions: {
        outputDirWritable: outputDirWritable,
        elevenLabsApiKeyPresent: !!process.env.ELEVENLABS_API_KEY,
      },
      env: {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
        IMAGE_EXTRACTOR_API_KEY: !!process.env.IMAGE_EXTRACTOR_API_KEY,
      },
      // New metrics
      eventLoopDelayMs: Math.round(eventLoopDelayMs * 100) / 100,
      rssMB: memoryUsage.rssMB,
      heapUsedMB: memoryUsage.heapUsedMB,
      cpuUser: Math.round(resourceUsage.userCpuTime),
      cpuSystem: Math.round(resourceUsage.systemCpuTime),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Liveness and readiness endpoints
app.get('/livez', (_, r) => r.status(200).send('OK'));

// Test route for retry-with-jitter validation (only in development)
if (process.env.NODE_ENV !== 'production') {
  let hits = 0;
  app.get('/test-flaky', (req, res) => {
    hits++;
    console.log(`Test-flaky attempt ${hits}`);
    if (hits <= 2) return res.status(429).set('Retry-After', '1').send('Too Many Requests');
    hits = 0; // Reset for next test
    res.send('OK');
  });
}

app.get('/readyz', async (req, res) => {
  const issues = [];
  const timings = {};

  // Check if required API keys are present
  if (!process.env.ELEVENLABS_API_KEY) issues.push('tts_key');

  // Check event loop delay
  const loopMs = Math.round(globalThis.__eventLoopDelayMs?.() || 0);
  if (loopMs > 250) issues.push('event_loop_delay');

  // Check memory usage
  const rssMB = Math.round(process.memoryUsage().rss / 1e6);
  if (rssMB > 1000) issues.push('high_memory');

  // Check outbound HTTP connectivity (BGG fetch to a known small ID with HEAD)
  try {
    const startTime = Date.now();
    const controller = new AbortController();
    // Reduced timeout for readiness check
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://boardgamegeek.com/xmlapi2/thing?id=1', {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'MobiusGamesTutorialGenerator/1.0 (https://github.com/mobius-games/tutorial-generator)',
      },
    });

    clearTimeout(timeoutId);
    timings.bgg_dns_resolve = Date.now() - startTime;

    if (!response.ok) {
      issues.push('bgg_connectivity');
    }
  } catch (error) {
    issues.push('bgg_connectivity');
  }

  // Check temp dir writeability for thumbnails
  try {
    const tempDir = path.join(UPLOADS_DIR, 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const testFile = path.join(tempDir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (error) {
    issues.push('temp_dir_writeability');
  }

  // Check cache directory read/write
  try {
    const cacheDir = path.join(process.cwd(), 'cache', 'bgg');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const testFile = path.join(cacheDir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (error) {
    issues.push('cache_dir_access');
  }

  // Check worker pool ping
  try {
    const startTime = Date.now();
    // Simple check - import and verify pdfWorkerManager is available
    if (typeof pdfWorkerManager === 'undefined') {
      issues.push('worker_pool_unavailable');
    } else {
      // Try to ping the worker manager
      try {
        await pdfWorkerManager.ping();
        timings.worker_pool_ping = Date.now() - startTime;
      } catch (error) {
        issues.push('worker_pool_ping_failed');
      }
    }
  } catch (error) {
    issues.push('worker_pool_check_failed');
  }

  // Return readiness status
  if (issues.length) {
    return res.status(503).json({
      status: 'not_ready',
      reasons: issues,
      timings,
      rssMB,
      loopMs,
      time: new Date().toISOString(),
    });
  }

  res.json({
    status: 'ready',
    timings,
    rssMB,
    loopMs,
    time: new Date().toISOString(),
  });
});

// Ignore favicon requests on API origin (prevents Firefox ORB warning)
app.get('/favicon.ico', (req, res) => res.sendStatus(204));
// Mount component extractor route
mountExtractComponentsRoute(app);
// Mount Poppler health route
mountPopplerHealthRoute(app);
// Add development vs production URL separation
function isDevMode() {
  return process.env.NODE_ENV !== 'production';
}
// Add metrics endpoint
// Add metrics endpoint security
const METRICS_ALLOW_CIDR = (process.env.METRICS_ALLOW_CIDR || '127.0.0.1/32,::1/128').split(',');
const METRICS_TOKEN = process.env.METRICS_TOKEN;
// Metrics security middleware
function metricsSecurity(req, res, next) {
  // If token is set, require it
  if (METRICS_TOKEN) {
    if (!METRICS_TOKEN) return res.status(503).send('Metrics token not set');
    const hdr = req.headers.authorization || '';
    return hdr === `Bearer ${METRICS_TOKEN}` ? next() : res.status(403).send('Forbidden');
  }

  // Otherwise, use IP allowlist
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString();

  // Simple check for localhost IPs (in production, you'd want a proper CIDR check)
  const isLocalhost = ip.includes('127.0.0.1') || ip === '::1' || ip.includes('localhost');

  // In dev mode, allow localhost
  if (isDevMode() && isLocalhost) {
    return next();
  }

  // In production, check against allowlist
  if (!isDevMode() && isLocalhost) {
    return next();
  }

  // For now, we'll allow localhost in both modes for simplicity
  // In a real production environment, you'd implement proper CIDR checking
  if (isLocalhost) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden' });
}
app.get('/metrics', metricsSecurity, async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain');
    res.end(getMetrics());
  } catch (ex) {
    res.status(500).end(ex.message);
  }
});

// Enhanced URL whitelist that separates dev and prod
function isUrlWhitelistedSecure(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // In production, only allow specific domains
    if (!isDevMode()) {
      const PROD_WHITELIST = ['boardgamegeek.com', 'cf.geekdo-images.com', 'geekdo-static.com'];
      return PROD_WHITELIST.some(
        (allowedHost) => hostname === allowedHost || hostname.endsWith('.' + allowedHost),
      );
    }

    // In development, allow localhost/127.0.0.1 plus specific domains
    const DEV_WHITELIST = [
      'localhost',
      '127.0.0.1',
      'boardgamegeek.com',
      'cf.geekdo-images.com',
      'geekdo-static.com',
    ];
    return DEV_WHITELIST.some(
      (allowedHost) =>
        hostname === allowedHost ||
        hostname.endsWith('.' + allowedHost) ||
        // For IP addresses, check exact match
        (hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/) && DEV_WHITELIST.includes(hostname)),
    );
  } catch (e) {
    console.warn('Invalid URL format:', url);
    return false;
  }
}

const connections = new Set();
const server = app.listen(port, () => {
  console.log('API file loaded!');
  console.log(`Uploads dir: ${UPLOADS_DIR}`);
  console.log(`Starting server on ${BACKEND_URL}`);
});

server.on('connection', (conn) => {
  connections.add(conn);
  conn.on('close', () => connections.delete(conn));
});

function shutdown(signal) {
  console.log(`[${signal}] shutting down...`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  // Force close lingering sockets after 10s
  setTimeout(() => {
    for (const c of connections) c.destroy();
    process.exit(1);
  }, 10_000).unref();
}
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
