#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { runIngestionPipeline } = require('../src/ingestion/pipeline');
const { generateStoryboardFromIngestion } = require('../src/storyboard/storyboard_from_ingestion');

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

  return {
    pipeline: runIngestionPipeline({
      documentId: payload.documentId ?? path.basename(pdfPath, path.extname(pdfPath)),
      metadata: payload.metadata ?? {},
      pages: payload.pages ?? [],
      ocr: payload.ocr ?? {},
      bggMetadata
    }),
    payload
  };
}

// Map internal pipeline manifest to the ingestion contract shape expected by
// check_ingestion.cjs (ingestionContractVersion, game, rulebook, text,
// structure, diagnostics).
const crypto = require('crypto');

function toContractShape({ pipeline, payload }) {
  const doc = pipeline.document || {};
  const pages = payload.pages || [];
  const fullText = pages.map(p => (p.blocks || []).map(b => b.text).join(' ')).join('\n');
  const textSha = crypto.createHash('sha256').update(fullText).digest('hex');

  const bggRaw = doc.bgg || payload.bgg || {};
  const bgg = {
    metadataStatus: bggRaw.name ? 'ok' : 'not_requested',
    id: bggRaw.id ?? null,
    url: bggRaw.url ?? null,
    title: bggRaw.name ?? null,
    yearPublished: bggRaw.yearPublished ?? null,
    designers: bggRaw.designers ?? [],
    minPlayers: bggRaw.minPlayers ?? null,
    maxPlayers: bggRaw.maxPlayers ?? null,
    minPlaytime: bggRaw.playTime ?? null,
    maxPlaytime: bggRaw.playTime ?? null
  };

  const headings = (pipeline.outline || []).map((h, i) => ({
    id: h.id || `heading-${i}`,
    page: h.page,
    text: h.title || h.text || '',
    level: h.level || 1
  }));

  const components = (pipeline.components || []).map(c => ({
    id: c.id,
    name: c.sourceHeading || c.id,
    quantity: 1,
    category: c.type || null,
    pageRefs: [c.pageStart]
  }));

  const setupSteps = (pipeline.components || []).filter(c => c.type === 'phase').map((c, i) => ({
    id: c.id,
    order: i,
    text: c.text || c.sourceHeading || c.id,
    componentRefs: [c.id],
    pageRefs: [c.pageStart]
  }));

  const pdfFilename = payload.metadata?.source || 'unknown.pdf';
  const rulebookSha = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  return {
    ingestionContractVersion: pipeline.version || '1.0.0',
    game: {
      slug: doc.gameId || doc.id || 'unknown-game',
      name: doc.title || bggRaw.name || 'Unknown Game',
      languagesSupported: ['en'],
      sources: {
        bggUrl: bggRaw.url || null,
        manualEntry: false
      },
      bgg
    },
    rulebook: {
      filename: pdfFilename,
      pages: pages.length || 1,
      sha256: rulebookSha,
      language: 'en'
    },
    text: {
      full: fullText,
      pages: pages.map(p => ({
        page: p.number,
        text: (p.blocks || []).map(b => b.text).join(' ')
      })),
      sha256: textSha
    },
    structure: {
      headings,
      components,
      setupSteps,
      phases: []
    },
    diagnostics: {
      warnings: [],
      errors: [],
      parser: { engine: 'mobius-ingest', version: pipeline.version || '1.0.0' },
      ocr: { used: (pipeline.ocrUsage || []).length > 0, reason: null }
    }
  };
}

async function main() {
  const { pdfPath, bggSource, outPath, storyboardOutPath } = parseArgs();
  if (!pdfPath) {
    console.error('Usage: node scripts/ingest-sample.js --pdf <rulebook.json> [--bgg <bgg.json|url>] [--out <path>] [--storyboard-out <path>]');
    process.exitCode = 1;
    return;
  }

  const pipelineResult = runIngestion({ pdfPath, bggSource });

  // Transform pipeline manifest into the contract-expected shape so that
  // check_ingestion.cjs validation passes and generateStoryboardFromIngestion
  // receives the keys it expects (game.slug, structure.setupSteps, etc.).
  const ingestionResult = toContractShape(pipelineResult);

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
