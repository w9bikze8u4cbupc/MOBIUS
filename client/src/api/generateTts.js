import { fetchJson } from '../utils/fetchJson';

export async function generateTts({ apiBase, payload, addToast }) {
  return fetchJson(`${apiBase}/tts`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'generate-tts' },
    errorContext: { area: 'tts', action: 'generateTts' },
  });
}