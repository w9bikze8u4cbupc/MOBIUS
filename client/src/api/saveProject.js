import { fetchJson } from '../utils/fetchJson';

export async function saveProject({ apiBase, payload, addToast }) {
  return fetchJson(`${apiBase}/save-project`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'save-project' },
    errorContext: { area: 'project', action: 'saveProject' },
  });
}
