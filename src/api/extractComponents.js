import fs from 'fs';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

// Optional trim with sharp if installed
let sharp = null;
try { 
  sharp = await import('sharp').then(m => m.default);
} catch (e) {
  console.warn('[extract-components] sharp not installed; trim disabled (npm i sharp to enable).');
}

function resolveBin(tool) {
  const dir = process.env.POPPLER_BIN_DIR;
  if (dir) {
    // Windows binaries usually have .exe, but spawn can infer it; we'll set full path.
    return path.join(dir, process.platform === 'win32' ? `${tool}.exe` : tool);
  }
  return tool; // assume on PATH
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...opts });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => {
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(Object.assign(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${err}`), { code, stdout: out, stderr: err }));
    });
    p.on('error', (err) => reject(err)); // ENOENT, etc.
  });
}

// NEW: safer download with size/time limits
async function downloadToTemp(pdfUrl, { maxBytes = 50 * 1024 * 1024, timeoutMs = 20000 } = {}) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
  const tmpFile = path.join(tmpDir, 'input.pdf');
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(pdfUrl, { signal: controller.signal });
  clearTimeout(to);

  if (!res.ok) throw new Error(`Failed to download pdfUrl (${res.status})`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes) throw new Error(`PDF too large (${len} bytes) > limit ${maxBytes}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`PDF too large after download (${buf.length} bytes) > limit ${maxBytes}`);

  await fsp.writeFile(tmpFile, buf);
  return { tmpDir, tmpFile };
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function listFiles(dir) {
  try {
    const entries = await fsp.readdir(dir);
    return entries.map(e => path.join(dir, e));
  } catch (e) {
    return [];
  }
}

function filenameStartsWith(prefix) {
  return (full) => path.basename(full).startsWith(prefix);
}

async function extractEmbeddedImages(pdfPath, outDir) {
  const prefix = 'img';
  await ensureDir(outDir);
  const pdfimages = resolveBin('pdfimages');
  // -p adds page index to filenames, -all keeps native formats when possible (png/jpg/jp2)
  await run(pdfimages, ['-p', '-all', pdfPath, path.join(outDir, prefix)]);
  const files = (await listFiles(outDir)).filter(filenameStartsWith(prefix));
  return files;
}

async function renderSnapshots(pdfPath, outDir, dpi = 300) {
  const prefix = 'page';
  await ensureDir(outDir);
  const pdftocairo = resolveBin('pdftocairo');
  await run(pdftocairo, ['-png', '-r', String(dpi), pdfPath, path.join(outDir, prefix)]);
  const files = (await listFiles(outDir)).filter(filenameStartsWith(prefix));
  return files;
}

async function basicTrimIfPossible(inPath) {
  if (!sharp) return inPath;
  const outPath = inPath.replace(/\.png$/i, '.trim.png');
  try {
    await sharp(inPath).trim(10).toFile(outPath);
    return outPath;
  } catch {
    return inPath;
  }
}

function toPublicUrl(fullPath, jobId) {
  return `/output/${jobId}/${path.basename(fullPath)}`;
}

async function fileMeta(fullPath) {
  const stat = await fsp.stat(fullPath);
  const size = stat.size;
  let width = null, height = null, hasAlpha = null, format = path.extname(fullPath).slice(1).toLowerCase();
  if (sharp) {
    try {
      const m = await sharp(fullPath).metadata();
      width = m.width ?? null;
      height = m.height ?? null;
      hasAlpha = Boolean(m.hasAlpha);
      format = m.format ?? format;
    } catch {
      console.warn('[extract-components] metadata extraction failed for', path.basename(fullPath));
    }
  }
  return { width, height, size, format, hasAlpha };
}

function passesBasicFilters(meta, opts) {
  const { minW, minH, maxAspect } = opts;
  if ((meta.width || 0) < minW) return false;
  if ((meta.height || 0) < minH) return false;
  if (meta.width && meta.height) {
    const aspect = meta.width / meta.height;
    if (aspect > maxAspect || aspect < 1 / maxAspect) return false;
  }
  return true;
}

function scoreHeuristics(meta) {
  const area = (meta.width || 0) * (meta.height || 0);
  const aspect = meta.width && meta.height ? meta.width / meta.height : 1;
  const aspectPenalty = aspect > 3 || aspect < 0.33 ? 0.7 : 1.0;
  const alphaBonus = meta.hasAlpha ? 1.05 : 1.0;
  const formatBonus = meta.format === 'png' ? 1.02 : 1.0;
  return Math.round(area * aspectPenalty * alphaBonus * formatBonus);
}

function applyBoosts(score, source, page, opts) {
  let s = score;
  if (source === 'embedded') s *= opts.embeddedBoost;
  if (page && opts.boostPages.includes(page)) s *= opts.boostFactor;
  return Math.round(s);
}

function inferPageFromName(fullPath) {
  const base = path.basename(fullPath).toLowerCase();
  // prefer pattern with explicit page position: prefix-<imgIdx>-<page> or prefix-<page>-<img>
  let m = base.match(/-(\d+)-(\d+)\./); // capture two numeric groups
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    // heuristic: page is usually the second when using -p (imgIdx-page)
    return Number.isFinite(b) ? b : (Number.isFinite(a) ? a : null);
  }
  // fallback: page-12.png or p_12.png
  m = base.match(/(?:page|p)[-_]?(\d{1,4})/);
  if (m) return Number(m[1]);
  // last resort: any digits
  const n = base.match(/(\d{1,4})/);
  return n ? Number(n[1]) : null;
}

function parseBool(v, d=true) {
  if (v === undefined) return d;
  return v === '1' || v === 'true' || v === true;
}

// Import enhanced image processor for advanced background removal
import { enhancedProcessor } from './enhancedImageProcessor.js';

// Enhanced background removal with multiple approaches and quality assessment
// Replaces basic bgRemove with intelligent multi-method processing
async function enhancedBgRemoveIfRequested(inPath, enable = false, threshold = 245, componentType = 'default') {
  if (!enable || !sharp) return inPath;
  
  try {
    console.log(`🔧 Enhanced background removal for ${path.basename(inPath)} (type: ${componentType})`);
    
    // Use the advanced processor for intelligent background removal
    const result = await enhancedProcessor.processComponentImage(inPath, componentType, {
      fallbackThreshold: threshold,
      enableQualityAssessment: true
    });
    
    if (result.success) {
      console.log(`✅ Enhanced processing: ${result.method} (quality: ${(result.quality * 100).toFixed(1)}%)`);
      return result.outputPath;
    } else {
      console.warn(`⚠️ Enhanced processing failed: ${result.error}`);
      // Fallback to basic method
      return await basicBgRemoveFallback(inPath, threshold);
    }
  } catch (error) {
    console.warn(`Enhanced background removal failed: ${error.message}`);
    // Fallback to basic method
    return await basicBgRemoveFallback(inPath, threshold);
  }
}

// Fallback to basic background removal (original method)
async function basicBgRemoveFallback(inPath, threshold = 245) {
  const outPath = inPath.replace(/\.(png|jpg|jpeg|jp2|ppm|pgm|pbm)$/i, '.bg-basic.png');
  try {
    const base = sharp(inPath).removeAlpha();
    const maskBuf = await sharp(inPath)
      .removeAlpha()
      .greyscale()
      .threshold(threshold)  // white => 255, content darker => 0
      .negate()              // content => 255, white bg => 0
      .toBuffer();
    await base
      .ensureAlpha()
      .composite([{ input: maskBuf, blend: 'dest-in' }]) // keep content, drop white bg
      .png()
      .toFile(outPath);
    return outPath;
  } catch {
    return inPath; // fail-safe
  }
}

async function coerceToWebFriendlyIfNeeded(inPath, enable=true) {
  if (!enable || !sharp) return inPath;
  const ext = path.extname(inPath).toLowerCase().slice(1);
  const unsupported = new Set(['jp2','jpx','ppm','pgm','pbm']);
  if (!unsupported.has(ext)) return inPath;
  const outPath = inPath.replace(/\.[^.]+$/, '.png');
  try {
    await sharp(inPath).png().toFile(outPath);
    return outPath;
  } catch {
    return inPath; // fallback
  }
}

/* NEW: Poppler health checks */
export async function checkPoppler() {
  const result = {
    ok: false,
    popplerBinDir: process.env.POPPLER_BIN_DIR || null,
    pdfimages: { found: false, version: null, path: resolveBin('pdfimages'), error: null },
    pdftocairo: { found: false, version: null, path: resolveBin('pdftocairo'), error: null },
  };
  // pdfimages -v
  try {
    const { stdout, stderr } = await run(result.pdfimages.path, ['-v']);
    const out = (stdout || '') + '\n' + (stderr || '');
    const vm = out.match(/pdfimages version\s+([0-9.]+)/i);
    result.pdfimages.found = true;
    result.pdfimages.version = vm ? vm[1] : null;
  } catch (e) {
    result.pdfimages.error = e.message;
  }
  // pdftocairo -v
  try {
    const { stdout, stderr } = await run(result.pdftocairo.path, ['-v']);
    const out = (stdout || '') + '\n' + (stderr || '');
    const vm = out.match(/pdftocairo version\s+([0-9.]+)/i);
    result.pdftocairo.found = true;
    result.pdftocairo.version = vm ? vm[1] : null;
  } catch (e) {
    result.pdftocairo.error = e.message;
  }
  result.ok = result.pdfimages.found && result.pdftocairo.found;
  return result;
}

/* NEW: TTL+LRU cache for extract-components */
const EXTRACT_CACHE_MAX = 32;
const EXTRACT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const extractCache = new Map(); // key -> {expiresAt, value}

function cacheGet(key) {
  const hit = extractCache.get(key);
  if (!hit) return { status: 'MISS', value: null };
  if (Date.now() > hit.expiresAt) {
    extractCache.delete(key);
    return { status: 'MISS', value: null };
  }
  // LRU bump
  extractCache.delete(key);
  extractCache.set(key, hit);
  return { status: 'HIT', value: hit.value };
}

function cacheSet(key, value) {
  // LRU prune
  if (extractCache.size >= EXTRACT_CACHE_MAX) {
    const firstKey = extractCache.keys().next().value;
    if (firstKey !== undefined) extractCache.delete(firstKey);
  }
  extractCache.set(key, { expiresAt: Date.now() + EXTRACT_CACHE_TTL_MS, value });
  return 'STORE';
}

/**
 * Main extraction
 * Returns { images: [{ url, path, page?, source, width,height,size,format,hasAlpha, score }], source, popplerMissing? }
 */
export async function extractComponentsFromPdf({ pdfPathOrUrl, jobId, outputRoot, options = {} }) {
  const dpi = Number(options.dpi) > 0 ? Number(options.dpi) : 300;
  const doTrim = options.trim !== false; // default true
  const doConvert = options.convertUnsupported !== false; // default true
  const doBgRemove = options.bgremove === true; // default off for safety
  const bgThreshold = Number.isFinite(options.bgthreshold) ? Number(options.bgthreshold) : 245;
  
  // NEW: Ensure defaults for scoring controls
  options.minW = options.minW || 160;
  options.minH = options.minH || 160;
  options.maxAspect = options.maxAspect || 6;
  options.boostPages = options.boostPages || [];
  options.boostFactor = options.boostFactor || 1.12;
  options.embeddedBoost = options.embeddedBoost || 1.02;
  let localPdf = null;
  let cleanupDir = null;
  try {
    if (/^https?:\/\//i.test(pdfPathOrUrl)) {
      const { tmpDir, tmpFile } = await downloadToTemp(pdfPathOrUrl, { maxBytes: 50 * 1024 * 1024, timeoutMs: 20000 });
      cleanupDir = tmpDir;
      localPdf = tmpFile;
    } else {
      localPdf = pdfPathOrUrl;
    }

    const jobDir = path.join(outputRoot, jobId);
    await ensureDir(jobDir);

    // Attempt embedded first
    let embedded = [];
    let embeddedError = null;
    const embeddedDir = path.join(jobDir, 'embedded');
    try {
      embedded = await extractEmbeddedImages(localPdf, embeddedDir);
    } catch (e) {
      embeddedError = e;
      console.warn('[extract-components] pdfimages failed:', e.message);
    }

    // Snapshot fallback only if no embedded
    let snapshots = [];
    let snapshotsError = null;
    const snapshotDir = path.join(jobDir, 'snapshots');
    if (embedded.length === 0) {
      try {
        snapshots = await renderSnapshots(localPdf, snapshotDir, dpi);
      } catch (e) {
        snapshotsError = e;
        console.warn('[extract-components] pdftocairo failed:', e.message);
      }
    }

    // If both failed (likely Poppler missing), return graceful signal
    if (embedded.length === 0 && snapshots.length === 0 && (embeddedError || snapshotsError)) {
      const enoent = (err) => err && (err.code === 'ENOENT' || /not found|ENOENT/i.test(err.message));
      if (enoent(embeddedError) || enoent(snapshotsError)) {
        return { images: [], source: 'none', popplerMissing: true };
      }
    }

    // Embedded: convert if needed
    const embeddedNorm = [];
    for (const f of embedded) {
      const f2 = await coerceToWebFriendlyIfNeeded(f, doConvert);
      // background removal on embedded is rare; skip by default (too aggressive). Apply only if requested.
      const f3 = doBgRemove ? await enhancedBgRemoveIfRequested(f2, true, bgThreshold, 'embedded') : f2;
      embeddedNorm.push(f3);
    }

    // Snapshots: convert first if needed (should already be png), then optional trim, then optional bg removal
    const snapshotsNorm = [];
    for (const f of snapshots) {
      const f2 = await coerceToWebFriendlyIfNeeded(f, doConvert);
      const f3 = doTrim ? await basicTrimIfPossible(f2) : f2;
      const f4 = doBgRemove ? await enhancedBgRemoveIfRequested(f3, true, bgThreshold, 'snapshot') : f3;
      snapshotsNorm.push(f4);
    }

    // Build response list with filters and boosts
    const output = [];
    for (const f of embeddedNorm) {
      const meta = await fileMeta(f);
      if (passesBasicFilters(meta, options)) {
        output.push({
          url: toPublicUrl(f, jobId),
          path: f,
          page: inferPageFromName(f),
          source: 'embedded',
          ...meta,
          score: 0, // set below
        });
      }
    }
    for (const f of snapshotsNorm) {
      const meta = await fileMeta(f);
      if (passesBasicFilters(meta, options)) {
        output.push({
          url: toPublicUrl(f, jobId),
          path: f,
          page: inferPageFromName(f),
          source: 'snapshot',
          ...meta,
          score: 0, // set below
        });
      }
    }

    // Apply scoring with boosts after page is known
    for (const img of output) {
      const baseScore = scoreHeuristics(img);
      img.score = applyBoosts(baseScore, img.source, img.page, options);
    }

    // Sort by score desc
    output.sort((a, b) => b.score - a.score);

    let source = 'embedded';
    if (embedded.length === 0 && snapshotsNorm.length > 0) source = 'snapshots';
    if (embedded.length > 0 && snapshotsNorm.length > 0) source = 'mixed';

    return { images: output, source };
  } finally {
    if (cleanupDir) {
      try { 
        await fsp.rm(cleanupDir, { recursive: true, force: true }); 
      } catch (e) {
        console.warn('[extract-components] cleanup failed:', e.message);
      }
    }
  }
}

export function mountExtractComponentsRoute(app, { outputRoot = path.resolve('output') } = {}) {
  app.get('/api/extract-components', async (req, res) => {
    const t0 = process.hrtime.bigint();
    
    // Request ID for traceability
    const requestId = crypto.randomBytes(6).toString('hex');
    res.setHeader('X-Request-Id', requestId);

    const pdfUrl = req.query.pdfUrl;
    const pdfPath = req.query.pdfPath;
    if (!pdfUrl && !pdfPath) {
      return res.status(400).json({ error: 'Provide pdfUrl or pdfPath' });
    }

    // Optional SSRF guard for pdfUrl (customize ALLOW_HOSTS as needed)
    const ALLOW_HOSTS = ['arxiv.org', 'example.com', 'boardgamegeek.com', 'drivethrurpg.com'];
    function isAllowedUrl(u) {
      try { 
        const h = new URL(u).hostname.toLowerCase(); 
        return ALLOW_HOSTS.some(a => h === a || h.endsWith(`.${a}`)); 
      } catch { 
        return false; 
      }
    }

    if (pdfUrl && !isAllowedUrl(pdfUrl)) {
      return res.status(400).json({ error: 'pdfUrl host not allowed' });
    }

    const options = {
      dpi: req.query.dpi ? Number(req.query.dpi) : 300,
      trim: parseBool(req.query.trim, true),
      convertUnsupported: parseBool(req.query.convert, true),
      bgremove: parseBool(req.query.bgremove, false),           // NEW
      bgthreshold: req.query.bgthreshold ? Number(req.query.bgthreshold) : 245, // NEW
      
      // NEW scoring controls (defaults conservative)
      minW: req.query.minW ? Number(req.query.minW) : 300,
      minH: req.query.minH ? Number(req.query.minH) : 300,
      maxAspect: req.query.maxAspect ? Number(req.query.maxAspect) : 5, // allow banners
      boostPages: (req.query.boostPages || '')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n)),
      boostFactor: req.query.boostFactor ? Number(req.query.boostFactor) : 1.2,
      embeddedBoost: req.query.embeddedBoost ? Number(req.query.embeddedBoost) : 1.04,
      
      // NEW: topN limiter to avoid huge lists
      topN: req.query.topN ? Math.max(1, Number(req.query.topN)) : 100,
    };
    const pdfPathOrUrl = pdfUrl || pdfPath;

    // Cache key
    const key = JSON.stringify({ pdfPathOrUrl, v: 'v4', options }); // bump cache version to v4
    const cached = cacheGet(key);
    if (cached.status === 'HIT') {
      res.setHeader('X-Components-Cache', 'HIT');
      res.setHeader('X-Components-Source', cached.value.source || 'none');
      res.setHeader('X-Components-Count', String(cached.value.images?.length || 0));
      res.setHeader('X-Components-Opts', `dpi=${options.dpi};trim=${options.trim};convert=${options.convertUnsupported};bgremove=${options.bgremove};bgthreshold=${options.bgthreshold};minW=${options.minW};minH=${options.minH};maxAspect=${options.maxAspect};boostPages=[${options.boostPages.join(',')}];boostFactor=${options.boostFactor};embeddedBoost=${options.embeddedBoost};topN=${options.topN}`);
      res.setHeader('X-Components-Time', '0ms (cache)');
      return res.json({ ...cached.value, cache: 'HIT' });
    }

    const jobId = crypto.randomBytes(6).toString('hex');
    try {
      const result = await extractComponentsFromPdf({
        pdfPathOrUrl,
        jobId,
        outputRoot,
        options,
      });

      // Graceful poppler-missing mode -> still return 200 so UI can continue with website images
      if (result.popplerMissing) {
        const cacheStatus = cacheSet(key, result); // Cache the popplerMissing result too
        res.setHeader('X-Components-Cache', cacheStatus);
        res.setHeader('X-Components-Source', 'none');
        res.setHeader('X-Components-Count', '0');
        res.setHeader('X-Components-Opts', `dpi=${options.dpi};trim=${options.trim};convert=${options.convertUnsupported};bgremove=${options.bgremove};bgthreshold=${options.bgthreshold};minW=${options.minW};minH=${options.minH};maxAspect=${options.maxAspect};boostPages=[${options.boostPages.join(',')}];boostFactor=${options.boostFactor};embeddedBoost=${options.embeddedBoost};topN=${options.topN}`);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        res.setHeader('X-Components-Time', `${ms.toFixed(1)}ms`);
        return res.json({
          jobId,
          source: 'none',
          images: [],
          popplerMissing: true,
          message: 'Poppler tools not available; PDF component extraction is disabled. Proceed with website images.',
        });
      }

      // Apply topN limit after scoring and sorting
      const finalImages = result.images.slice(0, options.topN);

      const cacheStatus = cacheSet(key, { ...result, images: finalImages });
      res.setHeader('X-Components-Cache', cacheStatus);
      res.setHeader('X-Components-Source', result.source || 'none');
      res.setHeader('X-Components-Count', String(finalImages.length));
      res.setHeader('X-Components-Opts', `dpi=${options.dpi};trim=${options.trim};convert=${options.convertUnsupported};bgremove=${options.bgremove};bgthreshold=${options.bgthreshold};minW=${options.minW};minH=${options.minH};maxAspect=${options.maxAspect};boostPages=[${options.boostPages.join(',')}];boostFactor=${options.boostFactor};embeddedBoost=${options.embeddedBoost};topN=${options.topN}`);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      res.setHeader('X-Components-Time', `${ms.toFixed(1)}ms`);
      return res.json({ jobId, ...result, images: finalImages, cache: cacheStatus });
    } catch (e) {
      console.error(e);
      // Preserve the nice error, but don't crash
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      res.setHeader('X-Components-Cache', 'MISS');
      res.setHeader('X-Components-Source', 'error');
      res.setHeader('X-Components-Count', '0');
      res.setHeader('X-Components-Opts', `dpi=${options.dpi};trim=${options.trim};convert=${options.convertUnsupported};bgremove=${options.bgremove};bgthreshold=${options.bgthreshold};minW=${options.minW};minH=${options.minH};maxAspect=${options.maxAspect};boostPages=[${options.boostPages.join(',')}];boostFactor=${options.boostFactor};embeddedBoost=${options.embeddedBoost};topN=${options.topN}`);
      res.setHeader('X-Components-Time', `${ms.toFixed(1)}ms`);
      return res.status(200).json({
        jobId,
        source: 'none',
        images: [],
        error: 'PDF component extraction failed.',
        details: e.message,
      });
    }
  });
}

/* NEW: Mount a health endpoint to verify Poppler availability */
export function mountPopplerHealthRoute(app) {
  app.get('/api/health/poppler', async (req, res) => {
    try {
      const status = await checkPoppler();
      res.setHeader('X-Poppler', status.ok ? 'OK' : 'MISSING');
      res.json(status);
    } catch (e) {
      res.setHeader('X-Poppler', 'ERROR');
      res.status(200).json({ ok: false, error: e.message });
    }
  });
}