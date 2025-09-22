import { fetchJson } from '../utils/fetchJson';

export async function fetchBggImages({ apiBase, gameName, addToast }) {
  return fetchJson(`${apiBase}/api/fetch-bgg-images`, {
    method: 'POST',
    body: { gameName },
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'fetch-bgg-images' },
    errorContext: { area: 'images', action: 'fetchBggImages' },
  });
}
