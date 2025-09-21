// client/src/api/extractPdfImages.js
import { fetchJson } from '../utils/fetchJson';

const API_BASE = (process.env.REACT_APP_API_BASE || '').replace(/\/$/, ''); // e.g. http://localhost:5001

export async function extractPdfImages(pdfUrl, toastContext = null) {
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    throw new Error('Please provide a valid PDF URL string.');
  }

  // Use fetchJson with the new API
  const data = await fetchJson(`${API_BASE}/api/extract-pdf-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfUrl }),
    toast: toastContext,
    errorContext: { area: 'extract', action: 'pdf-images' },
    expectedStatuses: [200],
  });

  const images = (data.images || []).map(img => {
    const rawUrl = img.url || '';
    // Ensure images load from the backend host in dev when frontend is on a different port
    const absoluteUrl = API_BASE
      ? new URL(rawUrl, API_BASE).toString()
      : rawUrl;
    return {
      ...img,
      url: absoluteUrl,
      type: (img.type || '').toLowerCase(),
    };
  });

  return { ...data, images };
}
