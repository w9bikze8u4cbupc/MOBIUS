const fs = require('fs');
// Contract-driven ingestion helper for hydrating BoardGameGeek metadata under
// the DOCS/spec ingestion manifest.
const path = require('path');
const { loadIngestionContract } = require('./contract');

const contract = loadIngestionContract();

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
