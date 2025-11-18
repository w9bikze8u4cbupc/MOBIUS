const fs = require('fs');
const path = require('path');
const { loadContract } = require('./pdf');

const contract = loadContract();

function readFixture(gameId) {
  const fixturePath = path.join(__dirname, `../../tests/fixtures/ingestion/bgg-${gameId}.json`);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`BGG fixture missing for ${gameId}`);
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

function normalizeMetadata(raw = {}) {
  const allowed = contract.metadata.bgg.allowedFields;
  return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.includes(key)));
}

function hydrateFromFixture(gameId) {
  const payload = readFixture(gameId);
  return normalizeMetadata(payload);
}

module.exports = {
  hydrateFromFixture,
  normalizeMetadata,
  readFixture
};
