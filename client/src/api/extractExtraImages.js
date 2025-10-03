import { fetchJson } from '../utils/fetchJson';

export async function extractExtraImages({
  apiBase,
  extraImageUrls,
  addToast,
}) {
  // Use relative URL to go through proxy when apiBase is empty
  const urlPath = apiBase
    ? `${apiBase}/api/extract-extra-images`
    : '/api/extract-extra-images';
  return fetchJson(urlPath, {
    method: 'POST',
    body: { extraImageUrls },
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'extract-extra-images' },
    errorContext: { area: 'images', action: 'extractExtraImages' },
  });
}
