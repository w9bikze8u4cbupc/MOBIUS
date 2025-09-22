import { fetchJson } from '../utils/fetchJson';

export async function extractBggHtmlDirect({ apiBase, url, addToast }) {
  return fetchJson(`${apiBase}/api/extract-bgg-html`, {
    method: 'POST',
    body: { url },
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'extract-bgg-html-direct' },
    errorContext: { area: 'bgg', action: 'extractBggHtmlDirect' },
  });
}
