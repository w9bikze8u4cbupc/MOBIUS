const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { detectHeadings, hashBlocks, normalizePages, buildPageHash } = require('./pdf');
const { loadIngestionContract } = require('./contract');

const contract = loadIngestionContract();

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, contract.headingRules.slugMaxLength);
}

function ensureMetadata(metadata = {}) {
  const missing = contract.metadata.requiredFields.filter((field) => !metadata[field]);
  if (missing.length) {
    throw new Error(`Missing metadata fields: ${missing.join(', ')}`);
  }
  return metadata;
}

function normalizeBggMetadata(raw = {}) {
  const allowed = contract.metadata.bgg.allowedFields;
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => allowed.includes(key))
      .map(([key, value]) => [key, value])
  );
}

function extractOutline(pages) {
  const headings = pages.flatMap((page) =>
    detectHeadings(hashBlocks(page.blocks)).map((heading) => ({
      ...heading,
      page: page.number,
      slug: slugify(heading.title)
    }))
  );

  return headings.sort((a, b) => (a.page === b.page ? a.bbox.y - b.bbox.y : a.page - b.page));
}

function extractComponents(pages, outline) {
  const components = [];
  outline.forEach((heading, index) => {
    const next = outline[index + 1];
    const sourcePages = pages.filter((page) => page.number >= heading.page && (!next || page.number < next.page));
    const text = sourcePages.flatMap((page) => page.blocks.map((block) => block.text)).join(' ');
    const hash = crypto.createHash(contract.hashing.algorithm).update(text).digest('hex');
    components.push({
      id: `comp-${heading.slug}`,
      type: 'phase',
      sourceHeading: heading.id,
      text,
      hash,
      pageStart: heading.page,
      pageEnd: sourcePages.length ? sourcePages[sourcePages.length - 1].number : heading.page,
      confidence: 0.95
    });
  });
  return components;
}

function buildAssets(pages, components) {
  const pageHashes = pages.map((page) => ({
    page: page.number,
    hash: buildPageHash(page)
  }));

  const componentHashes = components.map((component) => ({ id: component.id, hash: component.hash }));

  return {
    pages: pageHashes,
    components: componentHashes
  };
}

function runIngestionPipeline({ documentId, metadata, pages = [], ocr = {}, bggMetadata = {} }) {
  const { pages: normalizedPages, fallbackEvents } = normalizePages(pages, ocr);
  const outline = extractOutline(normalizedPages);
  if (!outline.length) {
    throw new Error('INGEST_HEADING_MISSING');
  }

  const components = extractComponents(normalizedPages, outline);
  const assets = buildAssets(normalizedPages, components);
  const manifest = {
    version: contract.version,
    document: {
      id: documentId,
      ...ensureMetadata(metadata),
      bgg: normalizeBggMetadata(bggMetadata),
      generatedAt: new Date().toISOString()
    },
    outline,
    components,
    assets,
    heuristics: {
      headingRules: contract.headingRules,
      toc: contract.toc
    },
    ocrUsage: fallbackEvents,
    stats: {
      pageCount: normalizedPages.length,
      headingCount: outline.length,
      componentCount: components.length
    }
  };

  if (manifest.ocrUsage.length > contract.ocr.maxFallbacksPerDocument) {
    throw new Error('INGEST_OCR_EXCEEDED');
  }

  return manifest;
}

function writeManifest(manifest, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
}

module.exports = {
  runIngestionPipeline,
  writeManifest
};
