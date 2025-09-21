import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), '.cache', 'http');
fs.mkdirSync(ROOT, { recursive: true });

/**
 * Convert cache key to file path
 * @param {string} key - Cache key
 * @returns {string} File path
 */
function keyToPath(key) {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(ROOT, `${h}.json`);
}

/**
 * Read cached data from disk
 * @param {string} key - Cache key
 * @returns {Object|null} Cached data or null if not found
 */
export function readCache(key) {
  try {
    const p = keyToPath(key);
    const s = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(s);
    // optional: check expiration here
    return obj;
  } catch {
    return null;
  }
}

/**
 * Write data to disk cache
 * @param {string} key - Cache key
 * @param {Object} value - Data to cache
 */
export function writeCache(key, value) {
  try {
    const p = keyToPath(key);
    fs.writeFileSync(p, JSON.stringify(value), 'utf8');
  } catch {}
}

/**
 * Delete cached data from disk
 * @param {string} key - Cache key
 */
export function deleteCache(key) {
  try {
    const p = keyToPath(key);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch {}
}
