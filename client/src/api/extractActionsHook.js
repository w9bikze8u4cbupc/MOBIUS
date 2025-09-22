// client/src/api/extractActionsHook.js
import { useToast } from '../contexts/ToastContext';
import { fetchJson } from '../utils/fetchJson';

export function useExtractActionsApi() {
  const { addToast } = useToast();

  async function extractActions({ pdfUrl, options }, { signal } = {}) {
    return fetchJson('/api/extract-actions', {
      method: 'POST',
      body: { pdfUrl, options },
      signal,
      toast: { addToast, dedupeKey: 'extract-actions' },
      errorContext: { area: 'extract', action: 'actions' },
      expectedStatuses: [200],
    });
  }

  return { extractActions };
}
