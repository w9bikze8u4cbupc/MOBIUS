// client/src/api/extractPdfImagesHook.js
import { useToast } from '../contexts/ToastContext';
import { fetchJson } from '../utils/fetchJson';

export function useExtractPdfImagesApi() {
  const { addToast } = useToast();

  async function extractPdfImages({ fileId }, { signal } = {}) {
    return fetchJson(`/api/extract-pdf-images/${encodeURIComponent(fileId)}`, {
      method: 'GET',
      signal,
      toast: { addToast, dedupeKey: `extract-pdf-images:${fileId}` },
      errorContext: { area: 'extract', action: 'pdf-images' },
      expectedStatuses: [200],
    });
  }

  return { extractPdfImages };
}
