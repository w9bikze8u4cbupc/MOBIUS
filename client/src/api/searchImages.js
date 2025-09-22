// client/src/api/searchImages.js
import { fetchJson } from '../utils/fetchJson';

export async function searchImages({ apiBase, query, addToast }) {
  return fetchJson(`${apiBase}/api/search-images`, {
    method: 'POST',
    body: query,
    toast: { addToast, dedupeKey: 'search-images' },
    errorContext: { area: 'search', action: 'images' },
    // tune as desired:
    retries: 2,
    retryBackoffMs: 300,
    maxTimeout: 20000,
  });
}
