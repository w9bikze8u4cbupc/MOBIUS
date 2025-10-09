// ESM module: src/ingest/pdf.js
// Responsibilities:
// - Extract text from PDFs using pdf-parse when possible
// - Fallback to OCR using system Tesseract (if available) or tesseract.js if installed
// - Expose a single high-level function: ingestPdf(pdfPath, options)

import fs from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';

let pdfParse;
try {
  // optional dependency
  // pdf-parse works in Node 18+ and is preferred for text extraction
  pdfParse = (await import('pdf-parse')).default;
} catch (e) {
  pdfParse = null;
}

async function runTesseractOnPdf(pdfPath, pageIndex = null) {
  // Try to find system pdftoppm + tesseract pipeline
  // If pageIndex is null, run on all pages by converting whole PDF to a single image (may be heavy)
  const pdftoppmCmd = spawnSync('pdftoppm', ['-v']);
  const hasPdftoppm = pdftoppmCmd.status === 0 || pdftoppmCmd.stderr?.length;
  const tesseractCmd = spawnSync('tesseract', ['--version']);
  const hasTesseract = tesseractCmd.status === 0 || tesseractCmd.stderr?.length;

  if (!hasTesseract) {
    // Try tesseract.js fallback if installed
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker();
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data } = await worker.recognize(pdfPath);
      await worker.terminate();
      return data?.text || '';
    } catch (err) {
      throw new Error('No tesseract binary found and tesseract.js not installed. OCR unavailable.');
    }
  }

  // Use pdftoppm to render page(s) to PNG, then tesseract
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const tmpPrefix = path.join(tmpDir, `mobius_ingest_${timestamp}`);
  const args = ['-png', pdfPath, tmpPrefix];
  if (pageIndex !== null) {
    // pdftoppm supports -f and -l
    args.unshift('-f', String(pageIndex + 1), '-l', String(pageIndex + 1));
  }
  const pdftoppm = spawnSync('pdftoppm', args);
  if (pdftoppm.status !== 0 && pdftoppm.stderr) {
    // continue - sometimes pdftoppm returns non-zero but still produced files
    // fall through
  }

  // Find generated PNG files
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`mobius_ingest_${timestamp}`) && f.endsWith('.png'));
  if (files.length === 0) {
    // try pattern with timestamp
    const all = fs.readdirSync(tmpDir).filter(f => f.includes('mobius_ingest_') && f.endsWith('.png'));
    if (all.length === 0) throw new Error('pdftoppm did not produce any PNGs for OCR fallback');
    files.push(...all);
  }

  let ocrText = '';
  for (const file of files) {
    const filePath = path.join(tmpDir, file);
    const t = spawnSync('tesseract', [filePath, 'stdout']);
    if (t.status === 0 || t.stdout) {
      ocrText += t.stdout?.toString() || '';
    }
  }
  return ocrText;
}

export async function ingestPdf(pdfPath, opts = { ocrThreshold: 0.5 }) {
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  const result = {
    source: pdfPath,
    parsedPages: [],
    extractedAt: new Date().toISOString(),
  };

  if (pdfParse) {
    const buffer = fs.readFileSync(pdfPath);
    try {
      const data = await pdfParse(buffer, { pagerender: null });
      // pdf-parse provides text (all pages) and a text per page is non-trivial; we will split by form-feed if present
      const raw = data.text || '';
      const pages = raw.split('\f');
      if (pages.length === 1 && raw.trim().length === 0) {
        // empty result — fallback to OCR
        const ocr = await runTesseractOnPdf(pdfPath);
        result.parsedPages.push({ pageNumber: 0, text: ocr, textConfidence: 0.0, source: 'ocr' });
      } else {
        for (let i = 0; i < pages.length; i++) {
          result.parsedPages.push({ pageNumber: i + 1, text: pages[i].trim(), textConfidence: pages[i].trim().length ? 1.0 : 0.0, source: 'pdf-parse' });
        }
      }
      
      // Add metadata to result
      result.meta = {
        info: data.info,
        metadata: data.metadata,
        encrypted: data.encrypted
      };
    } catch (err) {
      // pdf-parse failed — fallback
      const ocr = await runTesseractOnPdf(pdfPath);
      result.parsedPages.push({ pageNumber: 0, text: ocr, textConfidence: 0.0, source: 'ocr' });
    }
  } else {
    // No pdf-parse available — do OCR directly
    const ocr = await runTesseractOnPdf(pdfPath);
    result.parsedPages.push({ pageNumber: 0, text: ocr, textConfidence: 0.0, source: 'ocr' });
  }

  return result;
}

// Extract text and chunks from PDF for ingestion pipeline
export async function extractTextAndChunks(filePath, { dryRun = false } = {}) {
  if (dryRun) {
    return {
      text: 'DRY_RUN',
      chunks: [{ page: 1, text: 'Dry run content' }],
      pages: [1],
      toc: null,
      flags: { dryRun: true, pagesWithLowTextRatio: [] },
    };
  }

  const maxAttempts = 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // try primary parser
      const primary = await ingestPdf(filePath);
      const out = addHeuristics(primary);
      if (!out.text || !out.chunks?.length) throw new Error('empty_parse');
      return out;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  // fallback to alternate if available
  try {
    const alt = await ingestPdf(filePath); // using same parser as fallback for now
    const out = addHeuristics(alt);
    if (!out.text || !out.chunks?.length) throw new Error('empty_parse_alt');
    return out;
  } catch (e) {
    throw lastErr || e;
  }
}

function addHeuristics(parsed) {
  const { text, parsedPages: pages, toc } = parsed;
  
  // Create chunks from pages
  const chunks = pages.map(page => ({
    pageNumber: page.pageNumber,
    text: page.text,
    confidence: page.textConfidence,
    source: page.source
  }));
  
  // Combine all text from parsed pages
  const fullText = pages.map(page => page.text).join('\n\n');
  
  // pagesWithLowTextRatio heuristic
  const pagesWithLowTextRatio = (pages || [])
    .filter(p => (p.text || '').length < 200) // tune threshold
    .map(p => p.pageNumber || 0);

  // componentsDetected heuristic (simple keyword sweep)
  const t = (fullText || '').toLowerCase();
  const componentsDetected = /\bcomponents\b|\bcontents of the box\b/.test(t);

  // Simple TOC detection (look for common TOC patterns)
  let detectedToc = null;
  const tocPatterns = [
    /table of contents?/i,
    /contents?/i,
    /índice/i,
    /sommaire/i
  ];
  
  for (const page of pages) {
    for (const pattern of tocPatterns) {
      if (pattern.test(page.text)) {
        detectedToc = {
          pageNumber: page.pageNumber,
          text: page.text.substring(0, 500) // First 500 chars as sample
        };
        break;
      }
    }
    if (detectedToc) break;
  }

  return {
    text: fullText,
    chunks,
    pages,
    toc: detectedToc || toc,
    flags: { pagesWithLowTextRatio, componentsDetected },
    meta: parsed.meta
  };
}

export default { ingestPdf, extractTextAndChunks };