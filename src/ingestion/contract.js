// Contract loader for the canonical ingestion pipeline; reads DOCS/spec
// ingestion_contract.json to enforce manifests.
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../../docs/spec/ingestion_contract.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

const governanceDefaults = {
  version: schema.contractVersion ?? schema.version ?? '1.0.0',
  headingRules: {
    coordinatePrecision: 2,
    fontSizeThreshold: 18,
    slugMaxLength: 48,
    levels: [
      { level: 1, minSize: 24 },
      { level: 2, minSize: 20 },
      { level: 3, minSize: 16 }
    ]
  },
  metadata: {
    requiredFields: ['title', 'gameId', 'source'],
    bgg: {
      allowedFields: ['name', 'minPlayers', 'maxPlayers', 'playTime', 'mechanics']
    }
  },
  hashing: {
    algorithm: 'sha256'
  },
  ocr: {
    maxFallbacksPerDocument: 5
  },
  toc: {
    heuristicsVersion: '1.0.0'
  }
};

const contract = {
  ...governanceDefaults,
  schema
};

function loadIngestionContract() {
  return contract;
}

module.exports = {
  loadIngestionContract
};
