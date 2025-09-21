import { fetchJson } from '../utils/fetchJson';

export async function generateStoryboard({ apiBase, payload, addToast }) {
  return fetchJson(`${apiBase}/api/generate-storyboard`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'generate-storyboard' },
    errorContext: { area: 'storyboard', action: 'generateStoryboard' },
  });
}