const crypto = require('crypto');

const DEFAULT_TTL_MS = Number.parseInt(process.env.PREVIEW_TOKEN_TTL_MS || '', 10) || 15 * 60 * 1000;
const issuedTokens = new Map();

function parseConfig() {
  const raw = process.env.PREVIEW_API_KEYS || '';
  if (!raw.trim()) {
    return [
      { id: 'dev-preview', secret: process.env.PREVIEW_FALLBACK_SECRET || 'dev-preview-secret' },
    ];
  }

  return raw
    .split(',')
    .map((entry, index) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [id, secret] = entry.split(':');
      return {
        id: (id || `preview-${index + 1}`).trim(),
        secret: (secret || '').trim(),
      };
    });
}

function issueToken(id, secret) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + DEFAULT_TTL_MS);
  const nonce = crypto.randomBytes(12).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${secret || id}:${nonce}`)
    .digest('hex');
  const token = `${id}.${digest}`;
  const payload = {
    id,
    token,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  issuedTokens.set(id, payload);
  return payload;
}

function getIssuedToken(id, secret) {
  const existing = issuedTokens.get(id);
  if (existing) {
    const expiry = new Date(existing.expiresAt).getTime();
    if (!Number.isNaN(expiry) && expiry > Date.now()) {
      return existing;
    }
  }
  return issueToken(id, secret);
}

function getPreviewTokens() {
  const config = parseConfig();
  return config.map(({ id, secret }) => getIssuedToken(id, secret));
}

function validatePreviewToken(candidate) {
  if (!candidate) {
    return false;
  }
  const [id] = candidate.split('.');
  if (!id) {
    return false;
  }
  const current = issuedTokens.get(id);
  if (!current) {
    return false;
  }
  return current.token === candidate && new Date(current.expiresAt).getTime() > Date.now();
}

module.exports = {
  getPreviewTokens,
  validatePreviewToken,
};
