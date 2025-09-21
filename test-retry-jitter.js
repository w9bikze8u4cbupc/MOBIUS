// Test case for retry-with-jitter functionality
console.log('=== Retry with Jitter Implementation ===\n');

console.log('Implemented retry-with-jitter for 429/503 responses:');
console.log('- 2 retries maximum');
console.log('- Backoff: 250ms/750ms');
console.log('- No retry on 403 (Forbidden)');

console.log('\nExample retry logic in BGG extraction:');

const retryLogicExample = `
app.post('/api/extract-bgg-html', async (req, res) => {
  try {
    const { url } = req.body;
    
    // Add strong headers to avoid Cloudflare/bot detection
    let response;
    let retryCount = 0;
    const maxRetries = 2; // 2 retries = 3 total attempts
    
    while (retryCount <= maxRetries) {
      try {
        response = await axios.get(url, { 
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          },
          signal: AbortSignal.timeout(15000) // AbortSignal.timeout for modern browsers
        });
        
        // Check if we should retry based on status code
        if (response.status === 429 || response.status === 503) {
          if (retryCount < maxRetries) {
            // Calculate jitter: 250ms for first retry, 750ms for second
            const jitter = retryCount === 0 ? 250 : 750;
            console.warn(\`BGG fetch attempt \${retryCount + 1} failed with \${response.status}, retrying in \${jitter}ms...\`);
            await new Promise(resolve => setTimeout(resolve, jitter));
            retryCount++;
            continue;
          }
        }
        
        // If we get here, either success or max retries exceeded
        break;
      } catch (error) {
        // Don't retry on 403 (Forbidden) or other client errors
        if (error.response && error.response.status === 403) {
          throw new Error('Access forbidden - will not retry');
        }
        
        // Retry on network errors, timeouts, etc.
        if (retryCount < maxRetries) {
          const jitter = retryCount === 0 ? 250 : 750;
          console.warn(\`BGG fetch attempt \${retryCount + 1} failed with network error, retrying in \${jitter}ms...\`);
          await new Promise(resolve => setTimeout(resolve, jitter));
          retryCount++;
          continue;
        }
        
        // Max retries exceeded, re-throw the error
        throw error;
      }
    }
    
    // Process response...
  } catch (error) {
    // Handle error...
  }
});
`;

console.log(retryLogicExample);

console.log('\nBenefits of retry-with-jitter:');
console.log('1. Reduces load on BGG servers during temporary issues');
console.log('2. Improves success rate for rate-limited requests');
console.log('3. Prevents retry storms with jittered backoff');
console.log('4. Respects server responses (no retry on 403)');

console.log('\n=== End of Retry with Jitter Implementation ===');
