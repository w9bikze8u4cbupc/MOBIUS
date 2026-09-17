// Synthetic contract fixture ONLY. Never used by a real-source proof or production.
const fs = require('node:fs');
const crypto = require('node:crypto');
module.exports = (assetId, file, requiredObject, overrides = {}) => ({
  contract: 'mobius-object-visual-evidence-v1', assetId, requiredObject,
  method: 'provider-pixel-analysis', model: 'synthetic-test-provider',
  imageSha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  evidencePacketHash: 'synthetic-packet', present: true, confidence: 0.99,
  complete: true, isolated: true, stateCompatible: true, bbox: [0.05, 0.05, 0.95, 0.95],
  reason: 'Synthetic unit-test verdict; not a physical validation.', ...overrides,
});
