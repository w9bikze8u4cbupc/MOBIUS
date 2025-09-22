import { fetchJson } from '../utils/fetchJson';

export async function extractBggHtml({ apiBase, bggUrl, addToast }) {
  return fetchJson(`${apiBase}/api/extract-bgg-html`, {
    method: 'POST',
    body: { bggUrl },
    toast: { addToast, dedupeKey: 'extract-bgg-html' },
    errorContext: { area: 'extract', action: 'bgg-html' },
    // tune as desired:
    retries: 2,
    retryBackoffMs: 300,
    maxTimeout: 20000,
  });
}
