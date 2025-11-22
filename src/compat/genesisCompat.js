import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version: packageVersion = '1.0.0' } = require('../../package.json');
const MOBIUS_APP_VERSION = packageVersion || '1.0.0';

function minor(version) {
  if (!version || typeof version !== 'string') return '';
  return version.split('.').slice(0, 2).join('.');
}

export function checkGenesisFeedbackCompat(g6Bundle) {
  if (!g6Bundle || !g6Bundle.contract) {
    return {
      compatible: false,
      reason: 'Invalid GENESIS feedback bundle.',
    };
  }

  const g6Version = g6Bundle.contract.version || '';
  const g5Version = g6Bundle.input?.g5AnalyticsVersion || '';
  const g4Version = g6Bundle.input?.g4ClarityVersion || '';
  const exportVersion = g6Bundle.input?.mobiusExportVersion || '';

  const appMinor = minor(MOBIUS_APP_VERSION);
  const g6Minor = minor(g6Version);
  const g5Minor = minor(g5Version);
  const g4Minor = minor(g4Version);
  const exportMinor = minor(exportVersion);

  const expectedMinor = '1.0';

  const compatible =
    appMinor === expectedMinor &&
    g6Minor === expectedMinor &&
    g5Minor === expectedMinor &&
    g4Minor === expectedMinor &&
    exportMinor === expectedMinor;

  return {
    compatible,
    reason: compatible
      ? 'Contracts are within the supported minor version range.'
      : `Contract versions are outside supported minor range (expected ${expectedMinor}.x).`,
    mobiusAppVersion: MOBIUS_APP_VERSION,
    g6Version,
    g5Version,
    g4Version,
    exportVersion,
  };
}
