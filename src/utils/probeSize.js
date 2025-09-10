import probe from 'probe-image-size';
import fetch from 'node-fetch';

/**
 * Probe remote image dimensions with range request for efficiency
 * @param {string} url - Image URL to probe
 * @param {Object} options - Options
 * @param {number} options.timeoutMs - Timeout in milliseconds (default: 4000)
 * @returns {Object|null} Object with w and h properties or null
 */
async function probeRemoteSize(url, { timeoutMs = 4000 } = {}) {
  try {
    // Use range request to only fetch first 64KB for efficiency
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const res = await fetch(url, { 
      method: 'GET', 
      headers: { 'Range': 'bytes=0-65535' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return null;
    
    const meta = await probe(res.body);
    if (meta?.width && meta?.height) return { w: meta.width, h: meta.height };
  } catch (_) {
    // Silently fail probing errors
  }
  return null;
}

export { probeRemoteSize };