import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base synonyms that apply to all games
const BASE_SYNONYMS = {
  'cards': 'card',
  'tokens': 'token',
  'markers': 'marker',
  'tiles': 'tile',
  'boards': 'board',
  'pawns': 'pawn',
  'meeples': 'meeple',
  'dice': 'die',
  'sheets': 'sheet'
};

// Base allowlist terms
const BASE_ALLOWLIST = [
  'card', 'token', 'marker', 'tile', 'board', 'pawn', 'meeple', 
  'die', 'sheet', 'figure', 'cube', 'disc', 'chip', 'counter'
];

/**
 * Load game profile configuration
 * @param {string} gameTitle - Game title to load profile for
 * @returns {Object} Game profile configuration
 */
export async function loadGameProfile(gameTitle) {
  // Normalize game title for file naming
  const normalizedTitle = gameTitle
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-'); // collapse multiple hyphens

  try {
    // Try to load game-specific profile
    const profilePath = path.join(__dirname, '..', 'config', 'game-profiles', `${normalizedTitle}.json`);
    if (fs.existsSync(profilePath)) {
      const profile = JSON.parse(await fs.promises.readFile(profilePath, 'utf8'));
      
      // Merge with base configuration
      return {
        allowlist: [...new Set([...BASE_ALLOWLIST, ...(profile.allowlist || [])])],
        expectedCounts: profile.expectedCounts || {},
        synonyms: { ...BASE_SYNONYMS, ...(profile.synonyms || {}) },
        excludeSupply: profile.excludeSupply || []
      };
    }
  } catch (error) {
    console.warn(`Failed to load profile for ${gameTitle}:`, error.message);
  }
  
  // Return base configuration if no game-specific profile exists
  return {
    allowlist: BASE_ALLOWLIST,
    expectedCounts: {},
    synonyms: BASE_SYNONYMS,
    excludeSupply: []
  };
}

/**
 * Normalize component name using synonyms and game profile
 * @param {string} name - Component name to normalize
 * @param {Object} profile - Game profile configuration
 * @returns {string} Normalized component name
 */
export function normalizeComponentName(name, profile) {
  // Convert to lowercase and trim
  let normalized = name.toLowerCase().trim();
  
  // Apply game-specific synonyms
  for (const [synonym, canonical] of Object.entries(profile.synonyms)) {
    if (normalized.includes(synonym)) {
      normalized = normalized.replace(new RegExp(synonym, 'g'), canonical);
    }
  }
  
  return normalized;
}

/**
 * Check if component should be excluded (supply only)
 * @param {string} name - Component name
 * @param {Object} profile - Game profile configuration
 * @returns {boolean} True if component should be excluded
 */
export function isSupplyOnly(name, profile) {
  const normalized = name.toLowerCase().trim();
  
  // Check explicit supply exclusions
  if (profile.excludeSupply.some(term => normalized.includes(term))) {
    return true;
  }
  
  // Check for common supply terms
  const supplyTerms = ['supply', 'bank', 'reserve', 'treasury'];
  return supplyTerms.some(term => normalized.includes(term));
}

/**
 * Validate component counts against expected values
 * @param {Array} components - Array of component objects
 * @param {Object} profile - Game profile configuration
 * @returns {Object} Validation results
 */
export function validateComponentCounts(components, profile) {
  const results = {
    valid: true,
    issues: [],
    expected: profile.expectedCounts
  };
  
  // Group components by normalized name
  const componentGroups = {};
  for (const component of components) {
    const normalizedName = normalizeComponentName(component.name, profile);
    if (!componentGroups[normalizedName]) {
      componentGroups[normalizedName] = [];
    }
    componentGroups[normalizedName].push(component);
  }
  
  // Check expected counts
  for (const [name, expectedCount] of Object.entries(profile.expectedCounts)) {
    const actualCount = componentGroups[name] ? componentGroups[name].length : 0;
    if (actualCount !== expectedCount) {
      results.valid = false;
      results.issues.push({
        type: 'count_mismatch',
        component: name,
        expected: expectedCount,
        actual: actualCount
      });
    }
  }
  
  return results;
}