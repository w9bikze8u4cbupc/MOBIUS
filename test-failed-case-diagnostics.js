// Test case for failed BGG extraction with detailed diagnostics
console.log('=== Failed Case Diagnostics Example ===\n');

console.log('When BGG extraction fails, the backend should return detailed diagnostics:');

const failedCaseExample = {
  requestId: 'req-1758330860544-abc123',
  url: 'https://boardgamegeek.com/boardgame/999999999', // Non-existent game
  error: {
    success: false,
    error: 'Blocked by Cloudflare or anti-bot protection. Try again later.',
    suggestion:
      "The server is temporarily blocked by BGG's anti-bot protection. Please try again in a few minutes or use a different URL.",
    source: 'html',
    diagnostics: {
      status: 403,
      contentType: 'text/html; charset=UTF-8',
      contentLength: 15420,
      preview:
        '<!DOCTYPE html><html><head><title>Access denied</title></head><body>...Checking your browser before accessing boardgamegeek.com....</body></html>',
      source: 'html',
    },
  },
};

console.log(JSON.stringify(failedCaseExample, null, 2));

console.log('\nWhen falling back to XML API, the response should include:');
const xmlFallbackExample = {
  success: true,
  metadata: {
    title: 'CATAN',
    bgg_id: '13',
    // ... other metadata fields
  },
  source: 'xml',
};

console.log(JSON.stringify(xmlFallbackExample, null, 2));

console.log('\n=== End of Failed Case Diagnostics Example ===');
