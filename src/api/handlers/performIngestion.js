// src/api/handlers/performIngestion.js
import fs from 'fs';
import path from 'path';
import { resolveDataPath, getDirs } from '../../config/paths.js';
import { Metrics } from '../../metrics/metrics.js';

function scanPdfQuick(pathToFile) {
  // Very lightweight pre-scan to catch obvious risks; full sanitization would be external.
  const buf = fs.readFileSync(pathToFile);
  const header = buf.slice(0, 8).toString('utf8');
  // PDF header expected
  if (!header.startsWith('%PDF-')) return { ok: false, reason: 'not_pdf_header' };
  const s = buf.toString('latin1'); // lightweight scan
  const suspicious = [/\/JS\b/i, /\/JavaScript\b/i, /\/AA\b/i, /\/OpenAction\b/i].some((r) => r.test(s));
  return { ok: true, suspicious };
}

function isEncryptedPdf(parseMeta) {
  // If your parser exposes flags; otherwise, use a heuristic:
  // parseMeta?.info?.Encrypted === true or xref obj markers etc.
  return parseMeta?.encrypted === true;
}

export async function performIngestion(req, logger) {
  if (!req.file) {
    Metrics.inc('ingest_errors_total');
    throw new Error('no_file');
  }
  
  // PDF security scan
  const pre = scanPdfQuick(req.file.path);
  if (!pre.ok) {
    Metrics.inc('ingest_errors_total');
    throw new Error(`pdf_rejected_${pre.reason}`);
  }
  if (pre.suspicious && process.env.NODE_ENV === 'production') {
    Metrics.inc('ingest_errors_total');
    throw new Error('pdf_rejected_suspicious');
  }

  const { extractTextAndChunks } = await import('../../ingest/pdf.js');
  const { fetchBGG } = await import('../../ingest/bgg.js');
  const { buildStoryboard } = await import('../../ingest/storyboard.js');

  const bggId = req.body.bggId?.trim();
  const bggUrl = req.body.bggUrl?.trim();
  const title = req.body.title?.trim();
  const dryRun = /^true$/i.test(req.body.dryRun || '');

  logger.info('ingest_start', { file: req.file.filename, size: req.file.size, bggId, bggUrl, title, dryRun });

  // Parse PDF (with retry/fallback handled inside pdf.js)
  const parsed = await extractTextAndChunks(req.file.path, { dryRun });
  const { text, chunks, pages, toc, flags } = parsed || {};
  
  // Check if PDF is encrypted
  if (parsed?.meta && isEncryptedPdf(parsed.meta)) {
    throw new Error('pdf_encrypted_not_supported');
  }
  
  if (!dryRun && (!text || !chunks?.length)) {
    Metrics.inc('ingest_errors_total');
    throw new Error('pdf_parse_empty');
  }

  // BGG optional
  let bgg = null;
  try {
    if (bggId || bggUrl || title) {
      bgg = await fetchBGG({ bggId, bggUrl, titleGuess: title });
    }
  } catch (e) {
    logger.warn('bgg_fetch_failed', { reason: String(e?.message || e) });
  }

  // Storyboard
  const storyboard = await buildStoryboard({ chunks: chunks || [], toc, bgg, opts: { maxChapterLen: 8, dryRun } });

  // Persist
  const id = Date.now().toString(36);
  const outPath = resolveDataPath('output', `${id}_storyboard.json`);
  const payload = {
    storyboard,
    bgg,
    summary: {
      pages: pages?.length || 0,
      chunks: chunks?.length || 0,
      tocDetected: !!toc,
      flags: flags || {},
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  Metrics.inc('ingest_total');
  logger.info('ingest_complete', { id, outPath });

  const relPath = outPath.replace(getDirs().root + path.sep, '');
  return {
    ok: true,
    id,
    file: req.file.filename,
    summary: payload.summary,
    bgg: bgg
      ? { title: bgg.title, year: bgg.year, designers: bgg.designers, players: bgg.players, time: bgg.time, age: bgg.age }
      : null,
    storyboardPath: relPath,
  };
}