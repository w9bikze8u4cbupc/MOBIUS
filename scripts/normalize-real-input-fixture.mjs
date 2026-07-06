#!/usr/bin/env node

/**
 * normalize-real-input-fixture.mjs — Converts product-like metadata + rulebook-extract
 * into the canonical tutorial fixture shape consumed by generate-tutorial-preview.mjs.
 *
 * Usage (CLI):
 *   node scripts/normalize-real-input-fixture.mjs \
 *     --metadata tests/fixtures/tutorial-real-input/sakura-market.metadata.json \
 *     --extract tests/fixtures/tutorial-real-input/sakura-market.rulebook-extract.json \
 *     --out /tmp/normalized-fixture.json
 *
 * Usage (import):
 *   import { normalizeRealInput } from './normalize-real-input-fixture.mjs';
 *   const fixture = normalizeRealInput(metadata, rulebookExtract);
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Normalizer function (importable)
// ---------------------------------------------------------------------------

/**
 * Convert product-like metadata + rulebook extraction into canonical tutorial fixture.
 *
 * @param {object} metadata - BGG-style normalized metadata
 * @param {object} extract - Rulebook-extracted tutorial structure
 * @returns {object} Canonical tutorial fixture JSON
 */
export function normalizeRealInput(metadata, extract) {
  // Validate required metadata fields
  if (!metadata) throw new Error('normalizeRealInput: metadata is required');
  if (!extract) throw new Error('normalizeRealInput: rulebook extract is required');
  if (!metadata.slug) throw new Error('normalizeRealInput: metadata.slug is required');
  if (!metadata.title) throw new Error('normalizeRealInput: metadata.title is required');
  if (!metadata.playerCount) throw new Error('normalizeRealInput: metadata.playerCount is required');

  // Validate required extract fields
  if (!extract.objective) throw new Error('normalizeRealInput: extract.objective is required');
  if (!Array.isArray(extract.components) || extract.components.length === 0) {
    throw new Error('normalizeRealInput: extract.components must be a non-empty array');
  }
  if (!Array.isArray(extract.setup) || extract.setup.length === 0) {
    throw new Error('normalizeRealInput: extract.setup must be a non-empty array');
  }
  if (!extract.turnStructure) throw new Error('normalizeRealInput: extract.turnStructure is required');
  if (!extract.coreMechanic) throw new Error('normalizeRealInput: extract.coreMechanic is required');
  if (!extract.scoring) throw new Error('normalizeRealInput: extract.scoring is required');

  // Format duration string
  let duration;
  if (metadata.playtimeMinutes) {
    const { min, max } = metadata.playtimeMinutes;
    duration = min === max ? `${min} minutes` : `${min}-${max} minutes`;
  } else {
    duration = 'Unknown';
  }

  // Format designer string
  const designer = Array.isArray(metadata.designers) && metadata.designers.length > 0
    ? metadata.designers.join(', ')
    : 'Unknown';

  return {
    gameId: metadata.slug,
    gameName: metadata.title,
    playerCount: metadata.playerCount,
    duration,
    designer,
    objective: extract.objective,
    components: extract.components,
    setup: extract.setup,
    turnStructure: extract.turnStructure,
    coreMechanic: extract.coreMechanic,
    scoring: extract.scoring,
    edgeCases: extract.edgeCases || [],
  };
}

// ---------------------------------------------------------------------------
// CLI mode
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const metadataPath = getArg('metadata');
const extractPath = getArg('extract');
const outPath = getArg('out');

if (metadataPath && extractPath) {
  const metadata = JSON.parse(readFileSync(resolve(metadataPath), 'utf8'));
  const extract = JSON.parse(readFileSync(resolve(extractPath), 'utf8'));

  const fixture = normalizeRealInput(metadata, extract);

  if (outPath) {
    writeFileSync(resolve(outPath), JSON.stringify(fixture, null, 2), 'utf8');
    console.log(`[normalize] Written to: ${outPath}`);
  } else {
    console.log(JSON.stringify(fixture, null, 2));
  }
}
