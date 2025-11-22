const MODE = process.env.MOBIUS_GENESIS_MODE || 'OFF';
const ENABLED = process.env.MOBIUS_GENESIS_ENABLED !== 'false';

const allowedModes = ['OFF', 'SHADOW', 'ADVISORY', 'ACTIVE'];

export function getGenesisMode() {
  if (!ENABLED) return 'OFF';
  return allowedModes.includes(MODE.toUpperCase()) ? MODE.toUpperCase() : 'OFF';
}

export function isGenesisEnabled() {
  return getGenesisMode() !== 'OFF';
}

export function isGenesisShadowMode() {
  return getGenesisMode() === 'SHADOW';
}

export function isGenesisAdvisoryMode() {
  return getGenesisMode() === 'ADVISORY';
}

export function isGenesisActiveMode() {
  return getGenesisMode() === 'ACTIVE';
}
