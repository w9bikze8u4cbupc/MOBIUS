// Contract-driven ingestion helpers for normalizing PDF text into the ingestion
// manifest shape (heading detection, hashing, OCR tracking).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { loadIngestionContract } = require('./contract');

const contract = loadIngestionContract();

const LIGATURES = new Map([
  ['ﬀ', 'ff'],
  ['ﬁ', 'fi'],
  ['ﬂ', 'fl'],
  ['ﬃ', 'ffi'],
  ['ﬄ', 'ffl']
]);

function normalizeText(text = '') {
  const normalized = text
    .replace(/\u00A0/g, ' ')
    .split('')
    .map((char) => LIGATURES.get(char) ?? char)
    .join('');
  return normalized.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function roundCoordinate(value) {
  const precision = contract.headingRules.coordinatePrecision;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function canonicalizeBlocks(blocks = []) {
  return blocks
    .map((block) => ({
      ...block,
      text: normalizeText(block.text),
      x: roundCoordinate(block.x ?? 0),
      y: roundCoordinate(block.y ?? 0),
      width: roundCoordinate(block.width ?? 0),
      height: roundCoordinate(block.height ?? 0),
      fontSize: block.fontSize ?? 0,
      confidence: typeof block.confidence === 'number' ? block.confidence : 1
    }))
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

function hashValue(value) {
  return crypto.createHash(contract.hashing.algorithm).update(value).digest('hex');
}

function hashBlocks(blocks) {
  return blocks.map((block) => ({
    id: hashValue(`${block.text}:${block.x}:${block.y}:${block.fontSize}`),
    text: block.text,
    hash: hashValue(block.text),
    confidence: block.confidence,
    bbox: {
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height
    },
    fontSize: block.fontSize
  }));
}

function mergeOcr(page, ocrSpans = []) {
  if (!ocrSpans.length) {
    return page;
  }

  const canonical = canonicalizeBlocks([
    ...page.blocks,
    ...ocrSpans.map((span) => ({
      text: span.text,
      x: span.x ?? 0,
      y: span.y ?? 0,
      width: span.width ?? 0,
      height: span.height ?? 0,
      fontSize: span.fontSize ?? contract.headingRules.fontSizeThreshold,
      confidence: span.confidence ?? 0.8
    }))
  ]);

  return {
    ...page,
    blocks: canonical
  };
}

function normalizePages(pages = [], ocrByPage = {}) {
  const fallbackEvents = [];
  const normalized = pages.map((page) => {
    const canonicalBlocks = canonicalizeBlocks(page.blocks);
    if (!canonicalBlocks.length && ocrByPage[page.number]) {
      fallbackEvents.push({ page: page.number, reason: 'EMPTY_PAGE', count: ocrByPage[page.number].length });
      return mergeOcr({ ...page, blocks: canonicalBlocks }, ocrByPage[page.number]);
    }

    return {
      ...page,
      blocks: canonicalBlocks
    };
  });

  return { pages: normalized, fallbackEvents };
}

function detectHeadings(blocks = []) {
  const thresholds = contract.headingRules.levels;
  return blocks
    .filter((block) => block.fontSize >= contract.headingRules.fontSizeThreshold && block.text)
    .map((block) => {
      const matched = thresholds.find((rule) => block.fontSize >= rule.minSize) ?? thresholds[thresholds.length - 1];
      return {
        id: hashValue(`${block.text}-${block.x}-${block.y}`),
        title: block.text,
        level: matched.level,
        fontSize: block.fontSize,
        bbox: block.bbox ?? {
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height
        }
      };
    });
}

function buildPageHash(page) {
  const textBlob = page.blocks.map((block) => block.text).join('\n');
  return hashValue(`${page.number}:${textBlob}`);
}

function loadContract() {
  return contract;
}

module.exports = {
  canonicalizeBlocks,
  detectHeadings,
  hashBlocks,
  hashValue,
  mergeOcr,
  normalizePages,
  normalizeText,
  buildPageHash,
  loadContract
};
