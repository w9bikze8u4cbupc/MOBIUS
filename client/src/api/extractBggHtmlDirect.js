import { fetchJson } from '../utils/fetchJson';

export async function extractBggHtmlDirect({ apiBase, url, addToast }) {
  // Use relative URL to go through proxy when apiBase is empty
  const urlPath = apiBase
    ? `${apiBase}/api/extract-bgg-html`
    : '/api/extract-bgg-html';
  return fetchJson(urlPath, {
    method: 'POST',
    body: { url },
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'extract-bgg-html-direct' },
    errorContext: { area: 'bgg', action: 'extractBggHtmlDirect' },
  });
}
