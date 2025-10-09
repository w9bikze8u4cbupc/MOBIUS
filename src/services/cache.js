// src/services/cache.js
import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '../config/paths.js';

export function cacheGet(key) {
  const file = resolveDataPath('cache', 'bgg', `${key}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function cacheSet(key, value) {
  const file = resolveDataPath('cache', 'bgg', `${key}.json`);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function isFresh(entry, ttlMs) {
  if (!entry?.__ts) return false;
  return Date.now() - entry.__ts < ttlMs;
}