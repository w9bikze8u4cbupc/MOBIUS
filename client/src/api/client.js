// src/api/client.js
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

export async function extractMetadata(bggUrl) {
  const res = await fetch(`${API_BASE}/start-extraction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bggUrl }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}
