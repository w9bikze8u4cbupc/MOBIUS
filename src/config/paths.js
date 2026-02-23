// src/config/paths.js
// 
// DEPRECATED: This file is maintained for backward compatibility only.
// New code should import directly from './storage.mjs'

import { 
  getDataRoot, 
  getDataDirs as getCanonicalDataDirs,
  ensureDataDirs as ensureCanonicalDataDirs,
  resolveDataPath as resolveCanonicalDataPath
} from './storage.mjs';

export function getDataDir() {
  return getDataRoot();
}

export function ensureDir(dirPath) {
  // This function is kept for compatibility but directories
  // are now managed by storage.js
  ensureCanonicalDataDirs();
}

export function resolveDataPath(...segments) {
  return resolveCanonicalDataPath(...segments);
}

export function getDirs() {
  return getCanonicalDataDirs();
}