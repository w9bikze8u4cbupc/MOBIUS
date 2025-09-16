// Test URL whitelist functionality
function isUrlWhitelistedSecure(url, isDevMode = true) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // In production, only allow specific domains
    if (!isDevMode) {
      const PROD_WHITELIST = [
        'boardgamegeek.com',
        'cf.geekdo-images.com',
        'geekdo-static.com'
      ];
      return PROD_WHITELIST.some(allowedHost => 
        hostname === allowedHost || 
        hostname.endsWith('.' + allowedHost)
      );
    }
    
    // In development, allow localhost/127.0.0.1 plus specific domains
    const DEV_WHITELIST = [
      'localhost',
      '127.0.0.1',
      'boardgamegeek.com',
      'cf.geekdo-images.com',
      'geekdo-static.com'
    ];
    return DEV_WHITELIST.some(allowedHost => 
      hostname === allowedHost || 
      hostname.endsWith('.' + allowedHost) ||
      // For IP addresses, check exact match
      (hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/) && DEV_WHITELIST.includes(hostname))
    );
  } catch (e) {
    console.warn('Invalid URL format:', url);
    return false;
  }
}

// Test URLs
const testUrls = [
  'http://localhost:3000',
  'http://127.0.0.1:5001',
  'https://boardgamegeek.com',
  'https://cf.geekdo-images.com/image/12345.jpg',
  'https://malicious-site.com',
  'https://evil.com/boardgamegeek.com',
  'invalid-url'
];

console.log('Testing URL whitelist in DEV mode:');
for (const url of testUrls) {
  const isAllowed = isUrlWhitelistedSecure(url, true);
  console.log(`  ${url}: ${isAllowed ? 'ALLOWED' : 'BLOCKED'}`);
}

console.log('\nTesting URL whitelist in PROD mode:');
for (const url of testUrls) {
  const isAllowed = isUrlWhitelistedSecure(url, false);
  console.log(`  ${url}: ${isAllowed ? 'ALLOWED' : 'BLOCKED'}`);
}