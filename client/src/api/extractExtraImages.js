import { fetchJson } from '../utils/fetchJson';

export async function extractExtraImages({ apiBase, extraImageUrls, addToast }) {
  return fetchJson(`${apiBase}/api/extract-extra-images`, {
    method: 'POST',
    body: { extraImageUrls },
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'extract-extra-images' },
    errorContext: { area: 'images', action: 'extractExtraImages' },
  });
}