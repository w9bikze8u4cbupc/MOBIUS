/**
 * realInputFixtureRegistry.cjs — Shared registry loading and lookup helper.
 *
 * Used by both the E2E smoke test and the offline preview CLI to discover
 * and resolve real-input fixtures from fixtures.json.
 *
 * Dependency-free, cross-platform.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '../fixtures/tutorial-real-input/fixtures.json');

/**
 * Load the fixture registry from disk.
 * @param {string} [registryPath] - Override path to fixtures.json (defaults to workspace registry)
 * @returns {object} Parsed registry object
 * @throws {Error} If file not found or invalid JSON
 */
function loadRegistry(registryPath) {
  const resolvedPath = registryPath || DEFAULT_REGISTRY_PATH;
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Registry file not found: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in registry file: ${err.message}`);
  }
  if (!Array.isArray(registry.fixtures)) {
    throw new Error('Registry must contain a "fixtures" array');
  }
  return registry;
}

/**
 * Get all enabled fixtures from the registry.
 * @param {object} registry - Parsed registry object
 * @returns {object[]} Array of enabled fixture entries
 */
function getEnabledFixtures(registry) {
  return registry.fixtures.filter((f) => f.enabled);
}

/**
 * Find a fixture by slug from the registry.
 * @param {object} registry - Parsed registry object
 * @param {string} slug - Fixture slug to find
 * @returns {object|null} Fixture entry or null if not found
 */
function findFixtureBySlug(registry, slug) {
  return registry.fixtures.find((f) => f.slug === slug) || null;
}

/**
 * Resolve fixture file paths relative to a registry directory.
 * @param {object} fixture - Fixture registry entry
 * @param {string} registryDir - Absolute path to the registry directory
 * @returns {object} Resolved paths: { metadata, extract, expected }
 */
function resolveFixturePaths(fixture, registryDir) {
  return {
    metadata: path.join(registryDir, fixture.metadataFile),
    extract: path.join(registryDir, fixture.rulebookExtractFile),
    expected: path.join(registryDir, fixture.expectedFile),
  };
}

/**
 * Validate that a fixture's required files exist on disk.
 * @param {object} fixture - Fixture registry entry
 * @param {string} registryDir - Absolute path to the registry directory
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateFixtureFiles(fixture, registryDir) {
  const paths = resolveFixturePaths(fixture, registryDir);
  const missing = [];
  if (!fs.existsSync(paths.metadata)) missing.push(fixture.metadataFile);
  if (!fs.existsSync(paths.extract)) missing.push(fixture.rulebookExtractFile);
  if (!fs.existsSync(paths.expected)) missing.push(fixture.expectedFile);
  return { valid: missing.length === 0, missing };
}

module.exports = {
  DEFAULT_REGISTRY_PATH,
  loadRegistry,
  getEnabledFixtures,
  findFixtureBySlug,
  resolveFixturePaths,
  validateFixtureFiles,
};
