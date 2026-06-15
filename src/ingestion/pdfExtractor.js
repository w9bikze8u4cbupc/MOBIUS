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
 * pdfjs-dist v5+ requires DOMMatrix — we provide a polyfill for Node.js server
 * environments, so the gate is purely on Node version (>=22 for stable ESM import).
 */
function detectPdfjsDistCapability() {
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  const hasDOMMatrix = typeof globalThis.DOMMatrix === 'function';
  // We polyfill DOMMatrix at extraction time, so the real gate is Node >= 22
  // for stable dynamic ESM import support.
  const supported = nodeVersion >= 22;
  return {
    supported,
    nodeVersion,
    hasDOMMatrix,
    reason: supported
      ? `Node ${nodeVersion} detected (DOMMatrix polyfill provided)`
      : `Node ${nodeVersion} — requires Node 22+ for stable pdfjs-dist ESM import`
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
 * Provides a minimal DOMMatrix polyfill for Node.js server environments
 * where DOMMatrix is not available natively.
 *
 * @param {Buffer} buffer - PDF file content
 * @param {object} options - { mergeLines: boolean }
 * @returns {Promise<{ pages: Array, diagnostics: Array, engineUsed: string }>}
 */
async function extractPagesWithPdfjsDist(buffer, options = {}) {
  const { mergeLines = true } = options;

  const pages = [];
  const diagnostics = [];

  // Polyfill DOMMatrix for Node.js environments (not available natively even in Node 22)
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const values = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
        this.a = values[0] || 0; this.b = values[1] || 0;
        this.c = values[2] || 0; this.d = values[3] || 0;
        this.e = values[4] || 0; this.f = values[5] || 0;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
        this.m13 = 0; this.m14 = 0; this.m23 = 0; this.m24 = 0;
        this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
        this.m43 = 0; this.m44 = 1;
        this.is2D = true; this.isIdentity = false;
      }
      multiply(other) { return new DOMMatrix([
        this.a * other.a + this.c * other.b,
        this.b * other.a + this.d * other.b,
        this.a * other.c + this.c * other.d,
        this.b * other.c + this.d * other.d,
        this.a * other.e + this.c * other.f + this.e,
        this.b * other.e + this.d * other.f + this.f
      ]); }
      translate(tx, ty) { return this.multiply(new DOMMatrix([1, 0, 0, 1, tx || 0, ty || 0])); }
      scale(sx, sy) { return this.multiply(new DOMMatrix([sx || 1, 0, 0, sy || sx || 1, 0, 0])); }
      inverse() {
        const det = this.a * this.d - this.b * this.c;
        if (!det) return new DOMMatrix([0, 0, 0, 0, 0, 0]);
        return new DOMMatrix([
          this.d / det, -this.b / det,
          -this.c / det, this.a / det,
          (this.c * this.f - this.d * this.e) / det,
          (this.b * this.e - this.a * this.f) / det
        ]);
      }
      transformPoint(point) {
        const x = (point && point.x) || 0;
        const y = (point && point.y) || 0;
        return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f };
      }
      static fromMatrix(other) { return new DOMMatrix([other.a, other.b, other.c, other.d, other.e, other.f]); }
      static fromFloat32Array(arr) { return new DOMMatrix(Array.from(arr)); }
      static fromFloat64Array(arr) { return new DOMMatrix(Array.from(arr)); }
    };
  }

  // Polyfill ImageData (pdfjs-dist checks for it during initialization)
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data || new Uint8ClampedArray(width * height * 4);
        this.width = width;
        this.height = height;
      }
    };
  }

  // Polyfill Path2D (minimal no-op for server-side text extraction)
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {
      constructor() { this._ops = []; }
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      closePath() {}
      rect() {}
      arc() {}
      ellipse() {}
    };
  }

  let pdfjs;
  try {
    // Try non-legacy build first (better for Node 22+ with full ES2022 support)
    try {
      pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    } catch (_) {
      // Fall back to legacy build
      pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
  } catch (importErr) {
    throw new Error(`PDFJS_DIST_IMPORT_FAILED: ${importErr.message}`);
  }

  // Disable worker for server-side usage
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = '';
  }

  let doc;
  try {
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      useWorkerFetch: false
    });
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
