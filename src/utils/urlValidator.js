/**
 * URL Allowlist Validator
 * Validates URLs against a predefined allowlist to prevent SSRF attacks
 */

// Allowlist of permitted hosts
const ALLOWED_HOSTS = [
  'boardgamegeek.com',
  'www.boardgamegeek.com',
  'cf.geekdo-images.com',
  'geekdo-static.com',
  'localhost',
  '127.0.0.1',
];

/**
 * Check if a URL is allowed based on hostname allowlist
 * @param {string} urlString - The URL to validate
 * @returns {boolean} - True if URL is allowed, false otherwise
 */
export function isAllowedUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Check if hostname is in allowlist
    return ALLOWED_HOSTS.some(
      (allowedHost) => hostname === allowedHost || hostname.endsWith('.' + allowedHost),
    );
  } catch (error) {
    // Invalid URL format
    return false;
  }
}

/**
 * Validate URL with additional security checks
 * @param {string} urlString - The URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowHttpsOnly - Only allow HTTPS URLs
 * @param {boolean} options.allowPrivateIps - Allow private IP addresses
 * @returns {Object} - Validation result with valid flag and reason
 */
export function validateUrl(urlString, options = {}) {
  try {
    const url = new URL(urlString);

    // Check protocol
    if (options.allowHttpsOnly && url.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTPS URLs are allowed' };
    }

    // Check if URL is allowed
    if (!isAllowedUrl(urlString)) {
      return { valid: false, reason: 'URL host is not in allowlist' };
    }

    // Additional checks for private IPs if not allowed
    if (!options.allowPrivateIps) {
      const privateIpPatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^::1$/,
        /^fd[0-9a-f]{2}:/i,
      ];

      if (privateIpPatterns.some((pattern) => pattern.test(url.hostname))) {
        return { valid: false, reason: 'Private IP addresses are not allowed' };
      }
    }

    return { valid: true, reason: null };
  } catch (error) {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

export default { isAllowedUrl, validateUrl };
