#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { runIngestionPipeline } = require('../src/ingestion/pipeline');
const { generateStoryboardFromIngestion } = require('../src/ingest/storyboard');

function parseArgs() {
  const args = process.argv.slice(2);
  let pdfPath = null;
  let bggSource = null;
  let outPath = null;
  let storyboardOutPath = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--pdf') {
      pdfPath = args[++i];
    } else if (arg === '--bgg') {
      bggSource = args[++i];
    } else if (arg === '--out') {
      outPath = args[++i];
    } else if (arg === '--storyboard-out') {
      storyboardOutPath = args[++i];
    }
  }

  return { pdfPath, bggSource, outPath, storyboardOutPath };
}

function loadJsonMaybe(filePath) {
  if (!filePath) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }
  return null;
}

function ensureDir(filePath) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function buildBggMetadata(bggSource, fallback) {
  if (!bggSource) {
    return fallback ?? {};
  }

  const asJson = loadJsonMaybe(bggSource);
  if (asJson) {
    return asJson;
  }

  return { url: bggSource };
}

function runIngestion({ pdfPath, bggSource }) {
  if (!pdfPath) {
    throw new Error('Missing --pdf argument');
  }

  const payload = loadJsonMaybe(pdfPath);
  if (!payload) {
    throw new Error(`Unable to load ingestion fixture from ${pdfPath}`);
  }

  const bggMetadata = buildBggMetadata(bggSource, payload.bgg);

  return runIngestionPipeline({
    documentId: payload.documentId ?? path.basename(pdfPath, path.extname(pdfPath)),
    metadata: payload.metadata ?? {},
    pages: payload.pages ?? [],
    ocr: payload.ocr ?? {},
    bggMetadata
  });
}

async function main() {
  const { pdfPath, bggSource, outPath, storyboardOutPath } = parseArgs();
  if (!pdfPath) {
    console.error('Usage: node scripts/ingest-sample.js --pdf <rulebook.json> [--bgg <bgg.json|url>] [--out <path>] [--storyboard-out <path>]');
    process.exitCode = 1;
    return;
  }

  const ingestionResult = runIngestion({ pdfPath, bggSource });

  if (outPath) {
    ensureDir(outPath);
    fs.writeFileSync(outPath, JSON.stringify(ingestionResult, null, 2), 'utf8');
    console.log(`[Phase E1] Wrote ingestion JSON to ${outPath}`);
  } else {
    console.log('[Phase E1] Ingestion preview:');
    console.log(JSON.stringify(ingestionResult, null, 2));
  }

  const storyboard = generateStoryboardFromIngestion(ingestionResult, {
    width: 1920,
    height: 1080,
    fps: 30
  });

  if (storyboardOutPath) {
    ensureDir(storyboardOutPath);
    fs.writeFileSync(storyboardOutPath, JSON.stringify(storyboard, null, 2), 'utf8');
    console.log(`[Phase E2] Wrote storyboard to ${storyboardOutPath}`);
  } else {
    console.log('[Phase E2] Storyboard preview:');
    console.log(JSON.stringify(storyboard, null, 2));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to run ingestion sample CLI:', error);
    process.exitCode = 1;
  });
}
