// Server-side PDF extraction adapter. Converts raw PDF binary input into the
// structured ingestion pipeline contract shape: { pages, ocr, metadata }.
//
// Engine selection:
//   - "pdfjs-dist": direct modern pdfjs-dist (requires Node 22+ with DOMMatrix)
//   - "pdf-parse": legacy pdf-parse with bundled pdfjs v1.10.100
//   - "auto" (default): tries pdfjs-dist first, falls back to pdf-parse
//
// For scanned/image-only pages, emits ocrRecommended diagnostics without
// requiring Tesseract in CI.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Runtime capability detection
// ---------------------------------------------------------------------------

/**
 * Detect whether the current Node.js runtime supports direct pdfjs-dist usage.
 * pdfjs-dist v5+ requires DOMMatrix (available natively in Node 22+).
 */
function detectPdfjsDistCapability() {
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  const hasDOMMatrix = typeof globalThis.DOMMatrix === 'function';
  return {
    supported: nodeVersion >= 22 || hasDOMMatrix,
    nodeVersion,
    hasDOMMatrix,
    reason: nodeVersion >= 22
      ? 'Node 22+ detected'
      : hasDOMMatrix
        ? 'DOMMatrix polyfill available'
        : `Node ${nodeVersion} lacks DOMMatrix (requires Node 22+)`
  };
}

// ---------------------------------------------------------------------------
// Pure normalization helpers (testable without loading real PDFs)
// ---------------------------------------------------------------------------

const LIGATURES = new Map([
  ['\uFB00', 'ff'],
  ['\uFB01', 'fi'],
  ['\uFB02', 'fl'],
  ['\uFB03', 'ffi'],
  ['\uFB04', 'ffl']
]);

const COORDINATE_PRECISION = 2;

/**
 * Normalize text: replace ligatures, NFKC normalize, collapse whitespace.
 */
function normalizeItemText(text) {
  if (text == null || typeof text !== 'string') return '';
  const replaced = text
    .replace(/\u00A0/g, ' ')
    .split('')
    .map((ch) => LIGATURES.get(ch) || ch)
    .join('');
  return replaced.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * Round a numeric value to COORDINATE_PRECISION decimal places.
 */
function roundCoord(value) {
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * Derive fontSize from a pdf.js text item transform array.
 * The transform is a 6-element matrix [scaleX, skewX, skewY, scaleY, tx, ty].
 * Font size is approximated as abs(scaleY) (element [3]).
 */
function deriveFontSize(transform) {
  if (!Array.isArray(transform) || transform.length < 6) return 12;
  const scaleY = Math.abs(transform[3]);
  return scaleY > 0 ? roundCoord(scaleY) : 12;
}

/**
 * Convert a single pdf.js text content item into a normalized block.
 * Returns null if the item produces no meaningful text.
 *
 * @param {object} item - pdf.js textContent item with { str, transform, width, height }
 * @param {object} viewport - { width, height } of the page for coordinate normalization
 * @returns {object|null}
 */
function itemToBlock(item, viewport = { width: 612, height: 792 }) {
  if (!item || typeof item.str !== 'string') return null;

  const text = normalizeItemText(item.str);
  if (!text) return null;

  const transform = item.transform || [1, 0, 0, 1, 0, 0];
  const fontSize = deriveFontSize(transform);

  // pdf.js coordinates: origin at bottom-left, y increases upward.
  // Normalize to top-left origin matching the ingestion contract.
  const rawX = transform[4] || 0;
  const rawY = transform[5] || 0;
  const pageHeight = viewport.height || 792;

  const x = roundCoord(rawX);
  const y = roundCoord(pageHeight - rawY);
  const width = roundCoord(item.width || text.length * fontSize * 0.6);
  const height = roundCoord(item.height || fontSize);

  return { text, fontSize, x, y, width, height };
}

/**
 * Convert an array of pdf.js text content items into sorted page blocks.
 * Filters out empty items and sorts by reading order (top-to-bottom, left-to-right).
 *
 * @param {Array} items - pdf.js textContent items
 * @param {object} viewport - { width, height }
 * @returns {Array} blocks sorted by y then x
 */
function itemsToBlocks(items = [], viewport = { width: 612, height: 792 }) {
  const blocks = [];
  for (const item of items) {
    const block = itemToBlock(item, viewport);
    if (block) {
      blocks.push(block);
    }
  }
  // Sort by y (top-to-bottom), then x (left-to-right)
  blocks.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  return blocks;
}

/**
 * Merge adjacent blocks on the same line into logical lines.
 * Blocks are considered on the same line if their y-coordinates differ by
 * less than half the larger fontSize.
 */
function mergeLineBlocks(blocks = []) {
  if (!blocks.length) return [];

  const merged = [];
  let current = { ...blocks[0] };

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const yThreshold = Math.max(current.fontSize, block.fontSize) * 0.5;

    if (Math.abs(block.y - current.y) < yThreshold) {
      // Same line: extend
      const endX = Math.max(current.x + current.width, block.x + block.width);
      current.text = current.text + ' ' + block.text;
      current.width = roundCoord(endX - current.x);
      current.fontSize = Math.max(current.fontSize, block.fontSize);
    } else {
      merged.push(current);
      current = { ...block };
    }
  }
  merged.push(current);

  // Re-normalize merged text
  return merged.map((block) => ({
    ...block,
    text: normalizeItemText(block.text)
  }));
}

// ---------------------------------------------------------------------------
// PDF loading and extraction
// ---------------------------------------------------------------------------

/**
 * Load PDF data from a file path or buffer.
 * @param {string|Buffer|Uint8Array} input
 * @returns {Buffer}
 */
function loadPdfInput(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    return Buffer.from(input);
  }
  if (typeof input === 'string') {
    const resolved = path.isAbsolute(input) ? input : path.resolve(input);
    if (!fs.existsSync(resolved)) {
      throw new Error(`PDF file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved);
  }
  throw new Error('Input must be a Buffer, Uint8Array, or file path string');
}

/**
 * Extract structured page data from a PDF using pdf-parse with custom page renderer.
 * Returns text items with positional information per page.
 *
 * pdf-parse's bundled pdfjs (v1.10.100) may throw after processing pages
 * (e.g., bad XRef entry). We capture pages via the pagerender callback and
 * treat post-render errors as non-fatal if at least one page was captured.
 *
 * @param {Buffer} buffer - PDF file content
 * @param {object} options - { mergeLines: boolean }
 * @returns {Promise<{ pages: Array, diagnostics: Array }>}
 */
async function extractPagesFromBuffer(buffer, options = {}) {
  const { mergeLines = true } = options;
  const pdfParse = require('pdf-parse');

  const pages = [];
  const diagnostics = [];

  // Use pdf-parse with a custom pagerender to capture text items with transforms.
  // pdf-parse exposes the underlying pdfjs-dist page objects in pagerender callbacks.

  const pagerender = async function (pageData) {
    const pageNum = pageData.pageIndex + 1;
    const viewport = pageData.getViewport({ scale: 1.0 });

    let textContent;
    try {
      textContent = await pageData.getTextContent();
    } catch (err) {
      diagnostics.push({
        page: pageNum,
        type: 'TEXT_CONTENT_ERROR',
        message: err.message
      });
      pages.push({ number: pageNum, blocks: [], ocrRecommended: true });
      return '';
    }

    const items = (textContent && textContent.items) || [];
    let blocks = itemsToBlocks(items, { width: viewport.width, height: viewport.height });

    if (mergeLines) {
      blocks = mergeLineBlocks(blocks);
    }

    if (blocks.length === 0) {
      diagnostics.push({
        page: pageNum,
        type: 'EMPTY_PAGE',
        message: `Page ${pageNum} produced no text blocks; OCR may be required`
      });
      pages.push({ number: pageNum, blocks: [], ocrRecommended: true });
    } else {
      pages.push({ number: pageNum, blocks, ocrRecommended: false });
    }

    // Return text representation for pdf-parse's internal aggregation
    return blocks.map((b) => b.text).join('\n');
  };

  try {
    await pdfParse(buffer, { pagerender });
  } catch (err) {
    // pdf-parse's bundled pdfjs (v1.10.100) often throws after processing pages
    // (bad XRef entry, Invalid PDF structure, etc.). If we captured pages via the
    // pagerender callback, treat this as a soft error with diagnostics.
    if (pages.length > 0) {
      diagnostics.push({
        page: 0,
        type: 'PARSER_WARNING',
        message: `pdf-parse completed with warning: ${err.message}`
      });
    } else {
      throw new Error(`PDF parsing failed: ${err.message}`);
    }
  }

  // Sort pages by number (pdf-parse may call pagerender out of order for large docs)
  pages.sort((a, b) => a.number - b.number);

  return { pages, diagnostics };
}

// ---------------------------------------------------------------------------
// Direct pdfjs-dist extraction engine (Node 22+)
// ---------------------------------------------------------------------------

/**
 * Extract structured page data using direct pdfjs-dist (modern engine).
 * Uses dynamic import to avoid breaking CommonJS import-time on Node 18/20.
 *
 * @param {Buffer} buffer - PDF file content
 * @param {object} options - { mergeLines: boolean }
 * @returns {Promise<{ pages: Array, diagnostics: Array, engineUsed: string }>}
 */
async function extractPagesWithPdfjsDist(buffer, options = {}) {
  const { mergeLines = true } = options;

  const pages = [];
  const diagnostics = [];

  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (importErr) {
    throw new Error(`PDFJS_DIST_IMPORT_FAILED: ${importErr.message}`);
  }

  let doc;
  try {
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
    doc = await loadingTask.promise;
  } catch (loadErr) {
    throw new Error(`PDFJS_DIST_LOAD_FAILED: ${loadErr.message}`);
  }

  const numPages = doc.numPages;

  for (let i = 1; i <= numPages; i++) {
    let page;
    try {
      page = await doc.getPage(i);
    } catch (pageErr) {
      diagnostics.push({
        page: i,
        type: 'PAGE_LOAD_ERROR',
        message: pageErr.message
      });
      pages.push({ number: i, blocks: [], ocrRecommended: true });
      continue;
    }

    const viewport = page.getViewport({ scale: 1.0 });
    let textContent;
    try {
      textContent = await page.getTextContent();
    } catch (tcErr) {
      diagnostics.push({
        page: i,
        type: 'TEXT_CONTENT_ERROR',
        message: tcErr.message
      });
      pages.push({ number: i, blocks: [], ocrRecommended: true });
      continue;
    }

    const items = (textContent && textContent.items) || [];
    let blocks = itemsToBlocks(items, { width: viewport.width, height: viewport.height });

    if (mergeLines) {
      blocks = mergeLineBlocks(blocks);
    }

    if (blocks.length === 0) {
      diagnostics.push({
        page: i,
        type: 'EMPTY_PAGE',
        message: `Page ${i} produced no text blocks; OCR may be required`
      });
      pages.push({ number: i, blocks: [], ocrRecommended: true });
    } else {
      pages.push({ number: i, blocks, ocrRecommended: false });
    }
  }

  return { pages, diagnostics, engineUsed: 'pdfjs-dist' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract structured ingestion input from a PDF file or buffer.
 *
 * Returns a shape compatible with `runIngestionPipeline({ pages, ocr, metadata })`:
 *   - pages: [{ number, blocks: [{ text, fontSize, x, y, width, height }] }]
 *   - ocr: {} (placeholder; empty pages flagged via diagnostics for external OCR)
 *   - metadata: { source, pageCount, engine, engineVersion, extractionEngine, extractedAt, runtime }
 *   - diagnostics: [{ page, type, message }]
 *
 * @param {string|Buffer|Uint8Array} input - PDF file path, Buffer, or Uint8Array
 * @param {object} options
 * @param {boolean} options.mergeLines - merge adjacent text items into lines (default: true)
 * @param {string} options.source - source identifier for metadata (default: derived from path or 'buffer')
 * @param {string} options.engine - "auto" | "pdfjs-dist" | "pdf-parse" (default: "auto")
 * @returns {Promise<{ pages, ocr, metadata, diagnostics }>}
 */
async function extractPdfToIngestionInput(input, options = {}) {
  const { mergeLines = true, source, engine = 'auto' } = options;

  const buffer = loadPdfInput(input);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const capability = detectPdfjsDistCapability();
  let pages, diagnostics, engineUsed;

  if (engine === 'pdfjs-dist' || (engine === 'auto' && capability.supported)) {
    // Attempt direct pdfjs-dist extraction
    try {
      const result = await extractPagesWithPdfjsDist(buffer, { mergeLines });
      pages = result.pages;
      diagnostics = result.diagnostics;
      engineUsed = 'pdfjs-dist';
    } catch (err) {
      if (engine === 'pdfjs-dist') {
        // Forced engine: propagate error without fallback
        throw new Error(`pdfjs-dist extraction failed: ${err.message}`);
      }
      // Auto mode: fall back to pdf-parse
      diagnostics = [{
        page: 0,
        type: 'PDFJS_DIST_UNAVAILABLE',
        message: `Direct pdfjs-dist failed (${err.message}); falling back to pdf-parse`
      }];
      const fallback = await extractPagesFromBuffer(buffer, { mergeLines });
      pages = fallback.pages;
      diagnostics = diagnostics.concat(fallback.diagnostics);
      engineUsed = 'pdf-parse';
    }
  } else if (engine === 'pdf-parse' || (engine === 'auto' && !capability.supported)) {
    // Use pdf-parse fallback
    if (engine === 'auto') {
      diagnostics = [{
        page: 0,
        type: 'PDFJS_DIST_UNAVAILABLE',
        message: `Direct pdfjs-dist not available: ${capability.reason}; using pdf-parse`
      }];
    } else {
      diagnostics = [];
    }
    const fallback = await extractPagesFromBuffer(buffer, { mergeLines });
    pages = fallback.pages;
    diagnostics = (diagnostics || []).concat(fallback.diagnostics);
    engineUsed = 'pdf-parse';
  } else {
    throw new Error(`Unknown engine: ${engine}. Use "auto", "pdfjs-dist", or "pdf-parse".`);
  }

  const sourceName = source || (typeof input === 'string' ? path.basename(input) : 'buffer');

  const metadata = {
    source: sourceName,
    pageCount: pages.length,
    sha256,
    engine: 'mobius-pdf-extractor',
    engineVersion: '2.0.0',
    extractionEngine: engineUsed,
    extractedAt: new Date().toISOString(),
    runtime: {
      nodeVersion: process.versions.node,
      pdfjsDistSupported: capability.supported,
      pdfjsDistReason: capability.reason
    }
  };

  // Build OCR placeholder: pages that need OCR are flagged but we don't execute it
  const ocr = {};
  for (const page of pages) {
    if (page.ocrRecommended) {
      ocr[String(page.number)] = [];
    }
  }

  // Clean ocrRecommended from page output (not part of the pipeline contract)
  const cleanPages = pages.map(({ number, blocks }) => ({ number, blocks }));

  return {
    pages: cleanPages,
    ocr,
    metadata,
    diagnostics
  };
}

module.exports = {
  // Public
  extractPdfToIngestionInput,
  detectPdfjsDistCapability,
  // Exported for testing
  normalizeItemText,
  roundCoord,
  deriveFontSize,
  itemToBlock,
  itemsToBlocks,
  mergeLineBlocks,
  loadPdfInput,
  extractPagesFromBuffer,
  extractPagesWithPdfjsDist
};
