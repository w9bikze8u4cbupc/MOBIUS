// Example of Retry-After header parsing for 429 handling
// This would be added to the fetchJson utility

const parseRetryAfter = (retryAfterHeader) => {
  if (!retryAfterHeader) return null;
  
  // Check if it's a number of seconds
  if (/^\d+$/.test(retryAfterHeader)) {
    return parseInt(retryAfterHeader, 10) * 1000; // Convert to milliseconds
  }
  
  // Check if it's an HTTP-date
  const date = new Date(retryAfterHeader);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  
  return null;
};

// Usage in the 429 handling section:
if (is429) {
  // Parse Retry-After header if present
  const retryAfter = res.headers.get('Retry-After');
  const retryAfterMs = parseRetryAfter(retryAfter);
  
  if (retryAfterMs) {
    // Use the server's suggested retry time, but cap it
    backoff = Math.min(retryAfterMs, 30000); // Cap at 30 seconds
  } else {
    // Use a larger backoff for rate limiting
    backoff = Math.max(backoff, 1000);
  }
}