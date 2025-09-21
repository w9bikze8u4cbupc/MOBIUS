// Example of in-flight dedupe Map implementation for fetchJson
// This would be added to the fetchJson utility to handle concurrent requests

// Global Map to track in-flight requests
const inFlightRequests = new Map();

export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    signal,
    authToken,
    retries = 2,
    retryBackoffMs = 400,
    maxTimeout = 30000,
    toast,
    errorContext,
    expectedStatuses = [200],
  } = options;

  // Create a unique key for this request
  const requestKey = `${method}:${url}:${JSON.stringify(body || {})}:${toast?.dedupeKey || ''}`;
  
  // Check if there's an in-flight request for this key
  if (inFlightRequests.has(requestKey)) {
    // Return the existing promise to avoid duplicate requests
    return inFlightRequests.get(requestKey);
  }

  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (authToken) {
    finalHeaders.Authorization = `Bearer ${authToken}`;
  }

  // Track start time for maxTimeout
  const startTime = Date.now();
  
  // Create the actual request promise
  const requestPromise = (async () => {
    try {
      // ... existing fetch logic ...
      
      // Clean up the in-flight request when done
      inFlightRequests.delete(requestKey);
      
      return result;
    } catch (error) {
      // Clean up the in-flight request when done
      inFlightRequests.delete(requestKey);
      
      throw error;
    }
  })();
  
  // Store the promise in the in-flight requests map
  inFlightRequests.set(requestKey, requestPromise);
  
  // Return the promise
  return requestPromise;
}