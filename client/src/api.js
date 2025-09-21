const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Example API call function
export async function fetchBGGHtmlMetadata(url) {
  const response = await fetch(`${BACKEND_URL}/api/extract-bgg-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return await response.json();
}
