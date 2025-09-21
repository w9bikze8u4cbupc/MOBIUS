import { fetchJson } from '../utils/fetchJson';

export async function uploadPdf({ apiBase, formData, addToast }) {
  return fetchJson(`${apiBase}/upload-pdf`, {
    method: 'POST',
    body: formData,
    // Note: For FormData, we don't set Content-Type header manually
    // fetchJson will handle this correctly
    expectedStatuses: [200],
    toast: { addToast, dedupeKey: 'upload-pdf' },
    errorContext: { area: 'pdf', action: 'uploadPdf' },
  });
}