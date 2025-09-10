/**
 * Provider configuration with feature flags
 * Allows disabling providers temporarily without code changes
 */

export const ENABLED_PROVIDERS = {
  pdfEmbedded: process.env.PROV_PDF_EMBEDDED !== '0',
  pdfSnapshots: process.env.PROV_PDF_SNAPSHOTS !== '0',
  ubg: process.env.PROV_UBG !== '0'
};

/**
 * Get enabled providers list
 * @returns {Array} Array of enabled provider names
 */
export function getEnabledProviders() {
  return Object.keys(ENABLED_PROVIDERS).filter(name => ENABLED_PROVIDERS[name]);
}

/**
 * Check if a provider is enabled
 * @param {string} name - Provider name
 * @returns {boolean} True if provider is enabled
 */
export function isProviderEnabled(name) {
  return ENABLED_PROVIDERS[name] !== false;
}