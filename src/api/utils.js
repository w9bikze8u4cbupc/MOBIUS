// src/api/utils.js
// Utility functions for the API
// 
// DEPRECATED: This file is maintained for backward compatibility only.
// New code should import directly from '../config/storage.mjs'

import { 
  getDataRoot, 
  getDbPath as getCanonicalDbPath,
  getDataDirs,
  ensureDataDirs
} from '../config/storage.mjs';

/**
 * Get the canonical data directory path
 * @deprecated Use getDataRoot from '../config/storage.js' instead
 * @returns {string} Path to the data directory
 */
export function getDataDir() {
  return getDataRoot();
}

/**
 * Get the database path
 * @deprecated Use getDbPath from '../config/storage.js' instead
 * @returns {string} Path to the database file
 */
export function getDbPath() {
  return getCanonicalDbPath();
}

/**
 * Get the uploads directory path
 * @deprecated Use getDataDirs().uploads from '../config/storage.js' instead
 * @returns {string} Path to the uploads directory
 */
export function getUploadsDir() {
  ensureDataDirs();
  const dirs = getDataDirs();
  return dirs.uploads;
}

export default {
  getDataDir,
  getDbPath,
  getUploadsDir
};


/**
 * Extract components from text (stub)
 * @param {string} text - Text to extract components from
 * @returns {Array} Array of components
 */
export function extractComponentsFromText(text) {
  // Stub implementation
  return [];
}
