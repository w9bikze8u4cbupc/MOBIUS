const MODE = process.env.MOBIUS_GENESIS_MODE || 'OFF';
const ENABLED = process.env.MOBIUS_GENESIS_ENABLED !== 'false';

const allowedModes = ['OFF', 'SHADOW', 'ADVISORY', 'ACTIVE'];

function getGenesisMode() {
  if (!ENABLED) return 'OFF';
  return allowedModes.includes(MODE.toUpperCase()) ? MODE.toUpperCase() : 'OFF';
}

function isGenesisEnabled() {
  return getGenesisMode() !== 'OFF';
}

function isGenesisShadowMode() {
  return getGenesisMode() === 'SHADOW';
}

function isGenesisAdvisoryMode() {
  return getGenesisMode() === 'ADVISORY';
}

function isGenesisActiveMode() {
  return getGenesisMode() === 'ACTIVE';
}

module.exports = {
  getGenesisMode,
  isGenesisEnabled,
  isGenesisShadowMode,
  isGenesisAdvisoryMode,
  isGenesisActiveMode,
};
