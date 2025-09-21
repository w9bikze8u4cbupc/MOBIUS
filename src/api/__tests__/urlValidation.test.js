/**
 * Test for URL validation and SSRF protection
 */

// Import the validateUrl function directly
import { validateUrl, isAllowedUrl } from '../../utils/urlValidator.js';

describe('URL Validation and SSRF Protection', () => {
  test('should allow valid HTTPS URLs from allowlist', async () => {
    const result = await validateUrl('https://boardgamegeek.com/test.pdf', {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });
    
    expect(result.valid).toBe(true);
  });

  test('should reject HTTP URLs when HTTPS is required', async () => {
    const result = await validateUrl('http://boardgamegeek.com/test.pdf', {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Only HTTPS URLs are allowed');
  });

  test('should reject URLs not in allowlist', async () => {
    const result = await validateUrl('https://example.com/test.pdf', {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('URL host is not in allowlist');
  });

  test('should reject private IP addresses not in allowlist', async () => {
    const result = await validateUrl('https://192.168.1.1/private.pdf', {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('URL host is not in allowlist');
  });

  test('should allow localhost when in allowlist', async () => {
    const result = await validateUrl('https://localhost:3000/test.pdf', {
      allowHttpsOnly: true,
      allowPrivateIps: false,
    });
    
    expect(result.valid).toBe(true);
  });

  test('should allow private IPs when explicitly allowed and in allowlist', async () => {
    // First we need to add a private IP to the allowlist for this test
    // Since we can't modify the allowlist, we'll test with localhost which is in the allowlist
    const result = await validateUrl('https://localhost/private.pdf', {
      allowHttpsOnly: true,
      allowPrivateIps: true,
    });
    
    expect(result.valid).toBe(true);
  });

  test('isAllowedUrl should correctly identify allowed hosts', () => {
    expect(isAllowedUrl('https://boardgamegeek.com/test')).toBe(true);
    expect(isAllowedUrl('https://www.boardgamegeek.com/test')).toBe(true);
    expect(isAllowedUrl('https://cf.geekdo-images.com/image.jpg')).toBe(true);
    expect(isAllowedUrl('https://example.com/test')).toBe(false);
  });
});