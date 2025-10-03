import { fetchJson } from '../utils/fetchJson';

export async function extractBggHtml({ apiBase, bggUrl, addToast }) {
  // Use relative URL to go through proxy when apiBase is empty
  const url = apiBase
    ? `${apiBase}/api/extract-bgg-html`
    : '/api/extract-bgg-html';
  return fetchJson(url, {
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
