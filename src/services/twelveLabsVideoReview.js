import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

export const TWELVELABS_RUBRIC_VERSION = 'mobius-twelvelabs-professional-v2';
export const TWELVELABS_MODEL = 'pegasus1.5';
export const TWELVELABS_CACHE_VERSION = 1;
export const TWELVELABS_DEFAULT_BASE_URL = 'https://api.twelvelabs.io/v1.3';

const DEFAULT_CACHE = path.join(process.cwd(), 'data', 'twelvelabs', 'editorial-review-cache.json');
const DEFAULT_PROMPT = path.resolve(process.cwd(), 'config', 'twelvelabs-professional-review-prompt.md');
const DEFAULT_SCHEMA = path.resolve(process.cwd(), 'config', 'twelvelabs-professional-review.schema.json');

const hashBytes = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashValue = (value) => hashBytes(Buffer.from(JSON.stringify(value)));

export function getTwelveLabsConfig(env = process.env) {
  const apiKey = String(env.TWELVELABS_API_KEY || env.TWELVE_LABS_API_KEY || '').trim();
  return {
    configured: Boolean(apiKey),
    baseUrl: String(env.TWELVELABS_BASE_URL || TWELVELABS_DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: String(env.TWELVELABS_MODEL || TWELVELABS_MODEL).trim() || TWELVELABS_MODEL,
    apiKey,
  };
}

export function safeTwelveLabsConfig(env = process.env) {
  const config = getTwelveLabsConfig(env);
  return { configured: config.configured, baseUrl: config.baseUrl, model: config.model, provider: 'twelvelabs' };
}

export function classifyTwelveLabsError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  if (status === 401 || status === 403 || /api key|authentication|unauthorized|forbidden/.test(message)) return 'auth_failed';
  if (status === 404 || /model|asset.*not found|unsupported/.test(message)) return 'model_or_asset_unavailable';
  if (status === 429 || /rate limit|quota|credit/.test(message)) return 'rate_limited_or_quota';
  if (status >= 500) return 'provider_5xx';
  if (/timeout|abort|network|fetch failed|econn/.test(message)) return 'network_transient';
  if (/json|schema|structured/.test(message)) return 'invalid_structured_output';
  return 'unknown_provider_failure';
}

function redact(value) {
  return String(value || '')
    .replace(/(?:x-api-key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1: [REDACTED]')
    .replace(/(?:sk-|tl_|twelve|api[_-]?key)[A-Za-z0-9._-]{8,}/gi, '[REDACTED_TOKEN]');
}

function cacheFilePath(value) { return path.resolve(value || process.env.MOBIUS_TWELVELABS_CACHE || DEFAULT_CACHE); }

function readCache(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (value?.version === TWELVELABS_CACHE_VERSION && value.evaluations && value.assets) return value;
  } catch {}
  return { version: TWELVELABS_CACHE_VERSION, updatedAt: null, assets: {}, evaluations: {} };
}

async function writeCache(filePath, cache) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await fsPromises.writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await fsPromises.rename(temporary, filePath);
}

async function requestJson(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const error = new Error(redact(payload?.message || payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`));
      error.status = response.status;
      error.provider = 'twelvelabs';
      throw error;
    }
    return payload;
  } finally { clearTimeout(timer); }
}

function headers(config) { return { 'x-api-key': config.apiKey }; }

async function uploadAsset(videoPath, config, timeoutMs, fetchImpl) {
  const bytes = await fsPromises.readFile(videoPath);
  const form = new FormData();
  form.append('method', 'direct');
  form.append('file', new Blob([bytes]), path.basename(videoPath));
  const payload = await requestJson(`${config.baseUrl}/assets`, { method: 'POST', headers: headers(config), body: form }, timeoutMs, fetchImpl);
  const assetId = payload?._id || payload?.id || payload?.asset_id || payload?.asset?._id || payload?.asset?.id;
  if (!assetId) throw new Error('Twelve Labs upload returned no asset identifier.');
  return assetId;
}

async function waitForAsset(assetId, config, timeoutMs, fetchImpl, pollMs = 5000, maxPolls = 120) {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const payload = await requestJson(`${config.baseUrl}/assets/${encodeURIComponent(assetId)}`, { method: 'GET', headers: headers(config) }, timeoutMs, fetchImpl);
    const status = String(payload?.status || payload?.asset?.status || '').toLowerCase();
    if (status === 'ready' || status === 'completed') return payload;
    if (status === 'failed' || status === 'error') throw new Error(`Twelve Labs asset processing failed (${status}).`);
    if (attempt + 1 < maxPolls) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Twelve Labs asset processing timed out.');
}

function responseText(payload) {
  if (typeof payload === 'string') return payload;
  if (typeof payload?.data === 'string') return payload.data;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.result?.data === 'string') return payload.result.data;
  if (typeof payload?.result?.text === 'string') return payload.result.text;
  if (payload?.data && typeof payload.data === 'object') return JSON.stringify(payload.data);
  return '';
}

// Twelve Labs validates the request schema against its supported JSON-schema
// subset. Keep the canonical schema strict locally, but omit transport-only
// keywords that the Analyze API rejects (notably numeric bounds on `number`).
function buildProviderSchema(node) {
  if (Array.isArray(node)) return node.map(buildProviderSchema);
  if (!node || typeof node !== 'object') return node;
  const output = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === 'additionalProperties') continue;
    if ((key === 'minimum' || key === 'maximum') && node.type !== 'integer') continue;
    if (key === 'minItems' && node.type !== 'array') continue;
    output[key] = buildProviderSchema(value);
  }
  return output;
}

export function parseStrictReviewJson(value, schema = null) {
  const text = String(value || '').trim();
  if (!text || text.startsWith('```') || !text.startsWith('{') || !text.endsWith('}')) throw new Error('Twelve Labs response was not strict JSON.');
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`Twelve Labs response JSON is invalid: ${error.message}`); }
  validateReviewResult(parsed);
  if (schema?.properties?.rubric_version && parsed.rubric_version !== TWELVELABS_RUBRIC_VERSION) throw new Error('Twelve Labs response rubric version does not match the requested rubric.');
  return parsed;
}

function validateScore(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) throw new Error(`Invalid Twelve Labs score: ${label}.`);
}

function validateTimestamp(value) {
  return typeof value === 'string' && (/^[0-9]+:[0-5][0-9]$/.test(value) || /^[0-9]{2,}:[0-5][0-9]:[0-5][0-9]$/.test(value));
}

export function validateReviewResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Twelve Labs review must be an object.');
  if (result.rubric_version !== TWELVELABS_RUBRIC_VERSION) throw new Error('Twelve Labs review has an unexpected rubric version.');
  validateScore(result.overall_score_10, 'overall_score_10');
  const categories = result.category_scores;
  if (!categories || typeof categories !== 'object') throw new Error('Twelve Labs review is missing category scores.');
  for (const [name, score] of Object.entries(categories)) validateScore(score, name);
  if (!Array.isArray(result.findings)) throw new Error('Twelve Labs review findings must be an array.');
  for (const finding of result.findings) {
    if (!validateTimestamp(finding?.timestamp) || (finding.end_timestamp !== null && !validateTimestamp(finding?.end_timestamp))) throw new Error('Every Twelve Labs finding requires a valid timestamp.');
    if (!['P0', 'P1', 'P2', 'P3'].includes(finding.severity)) throw new Error('Twelve Labs finding has an invalid severity.');
    if (!['high', 'medium', 'low'].includes(finding.confidence)) throw new Error('Twelve Labs finding has an invalid confidence.');
  }
  if (!['not_ready', 'internal_review', 'publishable_with_minor_fixes', 'publishable'].includes(result.release_verdict)) throw new Error('Twelve Labs review has an invalid release verdict.');
  return true;
}

function evaluationKey(videoSha256, rubricVersion, model) { return hashValue({ videoSha256, rubricVersion, model }); }

export async function analyzeProductionVideo({ videoPath, promptPath = DEFAULT_PROMPT, schemaPath = DEFAULT_SCHEMA, cachePath, env = process.env, model, timeoutMs = 180_000, fetchImpl = fetch, pollMs = 5_000, maxPolls = 120, force = false } = {}) {
  const config = getTwelveLabsConfig(env);
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error('Twelve Labs review video does not exist.');
  const videoBytes = await fsPromises.readFile(videoPath);
  const videoSha256 = hashBytes(videoBytes);
  const prompt = await fsPromises.readFile(promptPath, 'utf8');
  const schema = JSON.parse(await fsPromises.readFile(schemaPath, 'utf8'));
  const resolvedModel = String(model || config.model || TWELVELABS_MODEL);
  const rubricVersion = TWELVELABS_RUBRIC_VERSION;
  const key = evaluationKey(videoSha256, rubricVersion, resolvedModel);
  const filePath = cacheFilePath(cachePath);
  const cache = readCache(filePath);
  if (!force && cache.evaluations[key]?.status === 'complete') return { ...cache.evaluations[key], cached: true, cacheKey: key };
  if (!config.configured) return { status: 'unavailable', classification: 'not_configured', configured: false, provider: 'twelvelabs', model: resolvedModel, rubricVersion, videoSha256, cacheKey: key };

  const startedAt = Date.now();
  try {
    let assetId = cache.assets[videoSha256]?.assetId || null;
    if (!assetId) {
      assetId = await uploadAsset(videoPath, config, timeoutMs, fetchImpl);
      cache.assets[videoSha256] = { videoSha256, assetId, uploadedAt: new Date().toISOString() };
      cache.updatedAt = new Date().toISOString();
      await writeCache(filePath, cache);
    }
    await waitForAsset(assetId, config, timeoutMs, fetchImpl, pollMs, maxPolls);
    const payload = await requestJson(`${config.baseUrl}/analyze`, {
      method: 'POST', headers: { ...headers(config), 'content-type': 'application/json' },
      body: JSON.stringify({
        model_name: resolvedModel,
        video: { type: 'asset_id', asset_id: assetId },
        prompt,
        stream: false,
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_schema', json_schema: buildProviderSchema(schema) },
      }),
    }, timeoutMs, fetchImpl);
    const result = parseStrictReviewJson(responseText(payload), schema);
    const entry = {
      status: 'complete', provider: 'twelvelabs', configured: true, model: resolvedModel,
      rubricVersion, videoSha256, assetId, analyzedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt, result,
    };
    cache.evaluations[key] = entry;
    cache.updatedAt = new Date().toISOString();
    await writeCache(filePath, cache);
    return { ...entry, cached: false, cacheKey: key };
  } catch (error) {
    return {
      status: 'unavailable', provider: 'twelvelabs', configured: true, model: resolvedModel,
      rubricVersion, videoSha256, cacheKey: key, classification: classifyTwelveLabsError(error),
      error: redact(error.message), latencyMs: Date.now() - startedAt,
    };
  }
}

export function buildExternalReviewSummary(review) {
  return {
    status: review?.status || 'unavailable', provider: 'twelvelabs', configured: Boolean(review?.configured),
    model: review?.model || TWELVELABS_MODEL, rubricVersion: review?.rubricVersion || TWELVELABS_RUBRIC_VERSION,
    cached: Boolean(review?.cached), videoSha256: review?.videoSha256 || null, cacheKey: review?.cacheKey || null,
    classification: review?.classification || null, analyzedAt: review?.analyzedAt || null,
  };
}
