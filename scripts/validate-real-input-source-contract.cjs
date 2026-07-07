/**
 * validate-real-input-source-contract.cjs — Source contract validator for
 * real-input fixture metadata and rulebook-extract files.
 *
 * Validates source inputs before normalization to catch structural issues
 * early, before the CLI or E2E smoke attempts rendering.
 *
 * Usage:
 *   node scripts/validate-real-input-source-contract.cjs --fixture sakura-market
 *   node scripts/validate-real-input-source-contract.cjs --all
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more contract violations found
 *   2 = invalid arguments or missing registry
 *
 * Programmatic API:
 *   const { validateMetadata, validateRulebookExtract, validateSourceContract } = require('./validate-real-input-source-contract.cjs');
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Metadata contract validation
// ---------------------------------------------------------------------------

/**
 * Validate a metadata object against the source contract.
 * @param {object} metadata - Parsed metadata JSON
 * @returns {{ passed: boolean, errors: string[] }}
 */
function validateMetadata(metadata) {
  const errors = [];

  if (!metadata || typeof metadata !== 'object') {
    return { passed: false, errors: ['Metadata must be a non-null object'] };
  }

  // Required string fields
  const requiredStrings = ['slug', 'title'];
  for (const field of requiredStrings) {
    if (typeof metadata[field] !== 'string' || metadata[field].length === 0) {
      errors.push(`metadata.${field} must be a non-empty string`);
    }
  }

  // playerCount structure
  if (!metadata.playerCount || typeof metadata.playerCount !== 'object') {
    errors.push('metadata.playerCount must be an object');
  } else {
    if (typeof metadata.playerCount.min !== 'number' || metadata.playerCount.min < 1) {
      errors.push('metadata.playerCount.min must be a positive number');
    }
    if (typeof metadata.playerCount.max !== 'number' || metadata.playerCount.max < 1) {
      errors.push('metadata.playerCount.max must be a positive number');
    }
    if (metadata.playerCount.min > metadata.playerCount.max) {
      errors.push('metadata.playerCount.min must not exceed metadata.playerCount.max');
    }
  }

  // designers array
  if (!Array.isArray(metadata.designers) || metadata.designers.length === 0) {
    errors.push('metadata.designers must be a non-empty array');
  } else {
    for (let i = 0; i < metadata.designers.length; i++) {
      if (typeof metadata.designers[i] !== 'string' || metadata.designers[i].length === 0) {
        errors.push(`metadata.designers[${i}] must be a non-empty string`);
      }
    }
  }

  // playtimeMinutes structure (optional but if present must be valid)
  if (metadata.playtimeMinutes) {
    if (typeof metadata.playtimeMinutes !== 'object') {
      errors.push('metadata.playtimeMinutes must be an object if present');
    } else {
      if (typeof metadata.playtimeMinutes.min !== 'number' || metadata.playtimeMinutes.min < 0) {
        errors.push('metadata.playtimeMinutes.min must be a non-negative number');
      }
      if (typeof metadata.playtimeMinutes.max !== 'number' || metadata.playtimeMinutes.max < 0) {
        errors.push('metadata.playtimeMinutes.max must be a non-negative number');
      }
    }
  }

  // description (optional but if present must be string)
  if (metadata.description !== undefined && typeof metadata.description !== 'string') {
    errors.push('metadata.description must be a string if present');
  }

  return { passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Rulebook-extract contract validation
// ---------------------------------------------------------------------------

/**
 * Validate a rulebook-extract object against the source contract.
 * @param {object} extract - Parsed rulebook-extract JSON
 * @returns {{ passed: boolean, errors: string[] }}
 */
function validateRulebookExtract(extract) {
  const errors = [];

  if (!extract || typeof extract !== 'object') {
    return { passed: false, errors: ['Rulebook extract must be a non-null object'] };
  }

  // objective: required non-empty string
  if (typeof extract.objective !== 'string' || extract.objective.length === 0) {
    errors.push('extract.objective must be a non-empty string');
  }

  // components: required non-empty array of objects with name
  if (!Array.isArray(extract.components) || extract.components.length === 0) {
    errors.push('extract.components must be a non-empty array');
  } else {
    for (let i = 0; i < extract.components.length; i++) {
      const comp = extract.components[i];
      if (!comp || typeof comp !== 'object') {
        errors.push(`extract.components[${i}] must be an object`);
      } else if (typeof comp.name !== 'string' || comp.name.length === 0) {
        errors.push(`extract.components[${i}].name must be a non-empty string`);
      }
    }
  }

  // setup: required non-empty array of strings
  if (!Array.isArray(extract.setup) || extract.setup.length === 0) {
    errors.push('extract.setup must be a non-empty array');
  } else {
    for (let i = 0; i < extract.setup.length; i++) {
      if (typeof extract.setup[i] !== 'string' || extract.setup[i].length === 0) {
        errors.push(`extract.setup[${i}] must be a non-empty string`);
      }
    }
  }

  // turnStructure: required object with phases array and description
  if (!extract.turnStructure || typeof extract.turnStructure !== 'object') {
    errors.push('extract.turnStructure must be an object');
  } else {
    if (!Array.isArray(extract.turnStructure.phases) || extract.turnStructure.phases.length === 0) {
      errors.push('extract.turnStructure.phases must be a non-empty array');
    }
    if (typeof extract.turnStructure.description !== 'string' || extract.turnStructure.description.length === 0) {
      errors.push('extract.turnStructure.description must be a non-empty string');
    }
  }

  // coreMechanic: required object with name and description
  if (!extract.coreMechanic || typeof extract.coreMechanic !== 'object') {
    errors.push('extract.coreMechanic must be an object');
  } else {
    if (typeof extract.coreMechanic.name !== 'string' || extract.coreMechanic.name.length === 0) {
      errors.push('extract.coreMechanic.name must be a non-empty string');
    }
    if (typeof extract.coreMechanic.description !== 'string' || extract.coreMechanic.description.length === 0) {
      errors.push('extract.coreMechanic.description must be a non-empty string');
    }
  }

  // scoring: required object with winCondition
  if (!extract.scoring || typeof extract.scoring !== 'object') {
    errors.push('extract.scoring must be an object');
  } else {
    if (typeof extract.scoring.winCondition !== 'string' || extract.scoring.winCondition.length === 0) {
      errors.push('extract.scoring.winCondition must be a non-empty string');
    }
  }

  return { passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Combined source contract validation
// ---------------------------------------------------------------------------

/**
 * Validate a complete source contract (metadata + rulebook-extract + identity consistency).
 * @param {object} metadata - Parsed metadata JSON
 * @param {object} extract - Parsed rulebook-extract JSON
 * @param {object} [registryEntry] - Optional registry entry for identity consistency checks
 * @returns {{ passed: boolean, errors: string[] }}
 */
function validateSourceContract(metadata, extract, registryEntry) {
  const metaResult = validateMetadata(metadata);
  const extractResult = validateRulebookExtract(extract);
  const errors = [...metaResult.errors, ...extractResult.errors];

  // Identity consistency with registry entry
  if (registryEntry && metadata && typeof metadata === 'object') {
    if (metadata.slug !== registryEntry.slug) {
      errors.push(`Identity mismatch: metadata.slug "${metadata.slug}" !== registry slug "${registryEntry.slug}"`);
    }
    if (metadata.title !== registryEntry.gameName) {
      errors.push(`Identity mismatch: metadata.title "${metadata.title}" !== registry gameName "${registryEntry.gameName}"`);
    }
  }

  return { passed: errors.length === 0, errors };
}

module.exports = { validateMetadata, validateRulebookExtract, validateSourceContract };

// ---------------------------------------------------------------------------
// CLI mode
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { loadRegistry, getEnabledFixtures, findFixtureBySlug, resolveFixturePaths } = require('../tests/helpers/realInputFixtureRegistry.cjs');

  const args = process.argv.slice(2);
  function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) return null;
    return args[idx + 1];
  }
  const isAll = args.includes('--all');
  const fixtureSlug = getArg('fixture');

  if (!isAll && !fixtureSlug) {
    console.error('Usage:');
    console.error('  node scripts/validate-real-input-source-contract.cjs --all');
    console.error('  node scripts/validate-real-input-source-contract.cjs --fixture <slug>');
    process.exit(2);
  }

  let registry;
  try {
    registry = loadRegistry();
  } catch (err) {
    console.error(`[source-contract] Failed to load registry: ${err.message}`);
    process.exit(2);
  }

  const REGISTRY_DIR = path.resolve(__dirname, '../tests/fixtures/tutorial-real-input');
  const fixtures = isAll ? getEnabledFixtures(registry) : (() => {
    const f = findFixtureBySlug(registry, fixtureSlug);
    if (!f) {
      console.error(`[source-contract] Unknown fixture slug: "${fixtureSlug}"`);
      console.error(`[source-contract] Available: ${registry.fixtures.map((x) => x.slug).join(', ')}`);
      process.exit(2);
    }
    return [f];
  })();

  let totalErrors = 0;

  for (const fixture of fixtures) {
    const paths = resolveFixturePaths(fixture, REGISTRY_DIR);
    console.log(`[source-contract] Validating: ${fixture.slug}`);

    let metadata, extract;
    try {
      metadata = JSON.parse(fs.readFileSync(paths.metadata, 'utf8'));
    } catch (err) {
      console.error(`  metadata: PARSE ERROR — ${err.message}`);
      totalErrors++;
      continue;
    }
    try {
      extract = JSON.parse(fs.readFileSync(paths.extract, 'utf8'));
    } catch (err) {
      console.error(`  rulebook-extract: PARSE ERROR — ${err.message}`);
      totalErrors++;
      continue;
    }

    const result = validateSourceContract(metadata, extract, fixture);
    if (result.passed) {
      console.log(`  ✓ PASSED`);
    } else {
      console.error(`  ✗ FAILED (${result.errors.length} error(s)):`);
      result.errors.forEach((e) => console.error(`    - ${e}`));
      totalErrors += result.errors.length;
    }
  }

  console.log('');
  if (totalErrors === 0) {
    console.log(`[source-contract] ALL PASSED (${fixtures.length} fixture(s) validated)`);
    process.exit(0);
  } else {
    console.error(`[source-contract] FAILED: ${totalErrors} total error(s) across ${fixtures.length} fixture(s)`);
    process.exit(1);
  }
}
