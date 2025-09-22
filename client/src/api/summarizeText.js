import { fetchJson } from '../utils/fetchJson';

export async function summarizeText({ apiBase, payload, addToast }) {
  return fetchJson(`${apiBase}/summarize`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'summarize-text' },
    errorContext: { area: 'summarize', action: 'summarizeText' },
  });
}
