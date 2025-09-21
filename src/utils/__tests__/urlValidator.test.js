import { isAllowedUrl, validateUrl } from '../urlValidator.js';

describe('isAllowedUrl', () => {
  test('accepts BGG hosts', () => {
    expect(isAllowedUrl('https://boardgamegeek.com/boardgame/155987/abyss')).toBe(true);
    expect(isAllowedUrl('https://www.boardgamegeek.com/boardgame/155987/abyss')).toBe(true);
  });

  test('accepts localhost and 127.0.0.1', () => {
    expect(isAllowedUrl('http://localhost:3000')).toBe(true);
    expect(isAllowedUrl('http://127.0.0.1:5001')).toBe(true);
  });

  test('rejects non-BGG hosts', () => {
    expect(isAllowedUrl('https://example.com')).toBe(false);
  });

  test('rejects invalid URL', () => {
    expect(isAllowedUrl('not a url')).toBe(false);
  });
});

describe('validateUrl', () => {
  test('accepts valid HTTPS URLs', () => {
    const result = validateUrl('https://boardgamegeek.com/boardgame/155987/abyss', {
      allowHttpsOnly: true,
    });
    expect(result.valid).toBe(true);
  });

  test('rejects HTTP URLs when HTTPS only is required', () => {
    const result = validateUrl('http://boardgamegeek.com/boardgame/155987/abyss', {
      allowHttpsOnly: true,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Only HTTPS URLs are allowed');
  });

  test('rejects URLs with private IPs when not allowed', () => {
    const result = validateUrl('http://192.168.1.1/test', { allowPrivateIps: false });
    expect(result.valid).toBe(false);
    // The URL is rejected because the host is not in the allowlist
    expect(result.reason).toBe('URL host is not in allowlist');
  });
});
