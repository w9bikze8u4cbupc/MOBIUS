// client/src/api/extractPdfImages.js
const API_BASE = (process.env.REACT_APP_API_BASE || '').replace(/\/$/, ''); // e.g. http://localhost:5001

export async function extractPdfImages(pdfUrl) {
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    throw new Error('Please provide a valid PDF URL string.');
  }

  const res = await fetch(`${API_BASE}/api/extract-pdf-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfUrl }),
  });

  if (!res.ok) {
    let msg = `Extraction failed (${res.status})`;
    try {
      const t = await res.text();
      if (t) msg += `: ${t}`;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json(); // { jobId, outputDir, images: [...] }
  const images = (data.images || []).map((img) => {
    const rawUrl = img.url || '';
    // Ensure images load from the backend host in dev when frontend is on a different port
    const absoluteUrl = API_BASE ? new URL(rawUrl, API_BASE).toString() : rawUrl;
    return {
      ...img,
      url: absoluteUrl,
      type: (img.type || '').toLowerCase(),
    };
  });

  return { ...data, images };
}