/**
 * normalize-real-input-fixture.cjs — CJS version of the normalizer.
 * Used by Jest tests and other CJS consumers.
 */

'use strict';

const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

/**
 * Convert product-like metadata + rulebook extraction into canonical tutorial fixture.
 */
function normalizeRealInput(metadata, extract) {
  if (!metadata) throw new Error('normalizeRealInput: metadata is required');
  if (!extract) throw new Error('normalizeRealInput: rulebook extract is required');
  if (!metadata.slug) throw new Error('normalizeRealInput: metadata.slug is required');
  if (!metadata.title) throw new Error('normalizeRealInput: metadata.title is required');
  if (!metadata.playerCount) throw new Error('normalizeRealInput: metadata.playerCount is required');

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

  let duration;
  if (metadata.playtimeMinutes) {
    const { min, max } = metadata.playtimeMinutes;
    duration = min === max ? `${min} minutes` : `${min}-${max} minutes`;
  } else {
    duration = 'Unknown';
  }

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

module.exports = { normalizeRealInput };

// CLI mode
if (require.main === module) {
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
}
