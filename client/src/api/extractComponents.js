import { fetchJson } from '../utils/fetchJson';

export async function extractComponents({ apiBase, pdfPath, addToast }) {
  return fetchJson(`${apiBase}/api/extract-components`, {
    method: 'POST',
    body: { pdfPath },
    headers: { 'Content-Type': 'application/json' },
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'extract-components' },
    errorContext: { area: 'pdf', action: 'extractComponents' },
  });
}
