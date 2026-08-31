import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

export const MODEL_DISCOVERY_VERSION = 1;
export const MODEL_DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_MODEL_PROBES = 4;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_PATH = path.join(process.cwd(), 'data', 'provider-model-cache.json');
const FALLBACK_CANDIDATES = Object.freeze({
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-latest'],
  cohere: ['command-r7b-12-2024', 'command-r', 'command-a-03-2025'],
});

const hash = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

function statusOf(error) {
  return Number(error?.status || error?.statusCode || error?.response?.status || 0) || 0;
}

function classify(error) {
  const status = statusOf(error);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (/credit_balance_exhausted|quota[_ -]?exhaust|billing|out of credits/.test(`${code} ${message}`)) return 'quota_exhausted';
  if (status === 401 || status === 403 || /invalid (?:api )?key|authentication|unauthorized|forbidden/.test(message)) return 'auth_failed';
  if (status === 404 || /model .*not found|model.*unavailable|does not exist/.test(message)) return 'model_unavailable';
  if (status === 429 || /rate limit|too many requests/.test(message)) return 'rate_limited_transient';
  if (status >= 500 && status <= 599) return 'provider_5xx';
  if (/timeout|timed out|econn|enotfound|socket|network|fetch failed/.test(message)) return 'network_transient';
  return 'unknown_provider_failure';
}

function cachePath(value) { return path.resolve(value || process.env.MOBIUS_AI_MODEL_CACHE || DEFAULT_CACHE_PATH); }

function readCache(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value?.version === MODEL_DISCOVERY_VERSION && value.providers && typeof value.providers === 'object'
      ? value
      : { version: MODEL_DISCOVERY_VERSION, providers: {} };
  } catch {
    return { version: MODEL_DISCOVERY_VERSION, providers: {} };
  }
}

async function writeCache(filePath, cache) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await fsPromises.writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await fsPromises.rename(temporary, filePath);
}

function cachedModel(cache, provider, explicitModel, now = Date.now()) {
  const entry = cache.providers?.[provider];
  if (!entry || entry.capability !== 'compatible' || !entry.model || (explicitModel && entry.model !== explicitModel)) return null;
  if (!Number.isFinite(Date.parse(entry.discoveredAt)) || now - Date.parse(entry.discoveredAt) > MODEL_DISCOVERY_CACHE_TTL_MS) return null;
  return entry.model;
}

function safeHeaders(provider, env) {
  if (provider === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
  return { 'content-type': 'application/json', authorization: `Bearer ${env.COHERE_API_KEY}` };
}

async function requestJson(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const providerMessage = String(payload?.error?.message || payload?.message || 'provider model request failed')
        .replace(/(?:sk[-_]|api[-_]|ghp_|github_pat_|AKIA|ASIA)[A-Za-z0-9_-]{8,}/gi, '[REDACTED_TOKEN]')
        .replace(/Bearer\s+[A-Za-z0-9._~+\/=\-]{8,}/gi, 'Bearer [REDACTED_TOKEN]');
      const error = new Error(providerMessage);
      error.status = response.status;
      error.code = payload?.error?.type || payload?.error?.code || payload?.code;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function providerBase(provider, env) {
  return String(env[provider === 'anthropic' ? 'ANTHROPIC_BASE_URL' : 'COHERE_BASE_URL']
    || (provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.cohere.com/v1')).replace(/\/$/, '');
}

export async function listProviderModels({ provider, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  if (!['anthropic', 'cohere'].includes(provider)) return { models: [], source: 'unsupported' };
  const url = provider === 'anthropic'
    ? `${providerBase(provider, env)}/models?limit=100`
    : `${providerBase(provider, env)}/models?page_size=100`;
  const payload = await requestJson(url, { method: 'GET', headers: safeHeaders(provider, env) }, timeoutMs, fetchImpl);
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const models = rows.map((row) => typeof row === 'string' ? row : row?.id || row?.name)
    .filter((model) => typeof model === 'string' && model.trim())
    .map((model) => model.trim());
  return { models, source: 'provider-list' };
}

function candidateRank(provider, model) {
  const value = model.toLowerCase();
  const cheap = value.includes('haiku') || value.includes('r7b') || value.includes('flash') || value.includes('mini');
  const chat = value.includes('claude') || value.includes('command') || value.includes('chat');
  const deprecated = value.includes('deprecated') || value.includes('embed') || value.includes('rerank');
  return (deprecated ? 1000 : 0) + (chat ? 0 : 100) + (cheap ? 0 : 10) + value.length / 1000;
}

export function boundModelCandidates(provider, models = []) {
  const source = [...new Set([...models, ...(FALLBACK_CANDIDATES[provider] || [])])];
  return source
    .filter((model) => provider === 'anthropic' ? /claude/i.test(model) : /command|chat|aya/i.test(model))
    .sort((left, right) => candidateRank(provider, left) - candidateRank(provider, right) || left.localeCompare(right))
    .slice(0, MAX_MODEL_PROBES);
}

function responseText(provider, payload) {
  if (provider === 'anthropic') return Array.isArray(payload?.content)
    ? payload.content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('').trim()
    : '';
  return Array.isArray(payload?.message?.content)
    ? payload.message.content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('').trim()
    : String(payload?.text || '').trim();
}

export async function probeProviderModel({ provider, model, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const started = Date.now();
  const messages = [{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }];
  try {
    const payload = provider === 'anthropic'
      ? await requestJson(`${providerBase(provider, env)}/messages`, {
        method: 'POST', headers: safeHeaders(provider, env),
        body: JSON.stringify({ model, max_tokens: 32, system: 'You are a capability probe. Return valid JSON only.', messages }),
      }, timeoutMs, fetchImpl)
      : await requestJson(`${String(env.COHERE_BASE_URL || 'https://api.cohere.com/v2/chat').replace(/\/$/, '')}`, {
        method: 'POST', headers: safeHeaders(provider, env),
        body: JSON.stringify({ model, max_tokens: 32, temperature: 0, messages: [{ role: 'system', content: 'You are a capability probe. Return valid JSON only.' }, ...messages] }),
      }, timeoutMs, fetchImpl);
    const text = responseText(provider, payload);
    const parsed = JSON.parse(text);
    if (parsed?.ok !== true) throw Object.assign(new Error('probe returned invalid structured output'), { code: 'schema_invalid' });
    return { provider, model, compatible: true, classification: null, latencyMs: Date.now() - started };
  } catch (error) {
    const classification = error?.code === 'schema_invalid' || error instanceof SyntaxError ? 'schema_invalid' : classify(error);
    return { provider, model, compatible: false, classification, status: statusOf(error) || null, latencyMs: Date.now() - started };
  }
}

export async function resolveProviderModel({ provider, env = process.env, explicitModel = null, cacheFile, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!['anthropic', 'cohere'].includes(provider)) return { provider, model: explicitModel || null, compatible: Boolean(explicitModel), source: 'explicit' };
  const resolvedCachePath = cachePath(cacheFile);
  const cache = readCache(resolvedCachePath);
  const cached = cachedModel(cache, provider, explicitModel, now);
  if (cached) return { provider, model: cached, compatible: true, source: 'cache', discoveredAt: cache.providers[provider].discoveredAt };

  const attempts = [];
  let listed = [];
  if (!explicitModel) {
    try {
      const result = await listProviderModels({ provider, env, timeoutMs, fetchImpl });
      listed = result.models;
    } catch (error) {
      const category = classify(error);
      attempts.push({ provider, model: null, classification: category, latencyMs: null });
      if (['auth_failed', 'quota_exhausted'].includes(category)) return { provider, model: null, compatible: false, source: 'unavailable', attempts };
    }
  }
  const candidates = explicitModel ? [explicitModel] : boundModelCandidates(provider, listed);
  for (const model of candidates) {
    const result = await probeProviderModel({ provider, model, env, timeoutMs, fetchImpl });
    attempts.push(result);
    if (result.compatible) {
      const discoveredAt = new Date(now).toISOString();
      cache.providers[provider] = { model, capability: 'compatible', discoveredAt, source: explicitModel ? 'explicit-probe' : 'provider-list-probe' };
      await writeCache(resolvedCachePath, { version: MODEL_DISCOVERY_VERSION, updatedAt: discoveredAt, providers: cache.providers });
      return { provider, model, compatible: true, source: explicitModel ? 'explicit-probe' : 'provider-list-probe', discoveredAt, attempts };
    }
    if (['auth_failed', 'quota_exhausted'].includes(result.classification)) break;
  }
  return { provider, model: null, compatible: false, source: 'unavailable', attempts };
}

export async function resolveConfiguredProviderModels({ providers = [], env = process.env, cacheFile, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, now = Date.now() } = {}) {
  const results = [];
  const resolved = [];
  for (const provider of providers) {
    if (provider.name === 'openai' && provider.model) {
      resolved.push(provider);
      results.push({ provider: provider.name, model: provider.model, compatible: true, source: 'explicit' });
      continue;
    }
    const result = await resolveProviderModel({ provider: provider.name, env, explicitModel: provider.model, cacheFile, timeoutMs, fetchImpl, now });
    results.push(result);
    if (result.compatible) resolved.push({ ...provider, model: result.model, modelResolution: result.source });
  }
  return { providers: resolved, results };
}

export function getCachedProviderModel(provider, { cacheFile, now = Date.now() } = {}) {
  return cachedModel(readCache(cachePath(cacheFile)), provider, null, now);
}

export const providerModelHash = (providers) => hash(JSON.stringify(providers.map(({ name, model }) => ({ name, model }))));
