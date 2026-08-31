import crypto from 'node:crypto';
import { getAiClient, getAiConfig } from '../config/aiConfig.js';

export const PROVIDER_ERROR_CATEGORIES = Object.freeze([
  'quota_exhausted', 'auth_failed', 'model_unavailable', 'rate_limited_transient',
  'network_transient', 'provider_5xx', 'empty_response', 'schema_invalid',
  'content_validation_failed', 'unknown_provider_failure',
]);

const DEFAULT_PROVIDER_ORDER = ['openai', 'anthropic', 'cohere'];
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_RETRIES = 1;

const hash = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const textOf = (response) => {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('').trim();
  return '';
};

function statusOf(error) {
  return Number(error?.status || error?.statusCode || error?.response?.status || error?.cause?.status || 0) || 0;
}

function errorMessage(error) {
  return String(error?.message || error?.error?.message || error?.response?.data?.error?.message || error || '');
}

export function classifyProviderError(error, provider = null) {
  const status = statusOf(error);
  const code = String(error?.code || error?.error?.type || error?.response?.data?.error?.code || '').toLowerCase();
  const message = errorMessage(error).toLowerCase();
  if (error?.providerCategory && PROVIDER_ERROR_CATEGORIES.includes(error.providerCategory)) return error.providerCategory;
  if (error?.code === 'SCRIPT_PACKAGE_WORD_CAP_EXCEEDED' || error?.classification === 'content_validation_failed') return 'content_validation_failed';
  if (['provider_empty_content', 'reasoning_budget_exhausted', 'output_budget_exhausted', 'malformed_provider_payload'].includes(error?.classification)) return 'empty_response';
  if (error?.code === 'SCRIPT_PACKAGE_INVALID' || error?.classification === 'schema_invalid') return 'schema_invalid';
  if (/credit_balance_exhausted|quota[_ -]?exhaust|insufficient[_ -]?quota|billing|billing_hard_limit|out of credits/.test(`${code} ${message}`)) return 'quota_exhausted';
  if (status === 401 || status === 403 || /invalid (?:api )?key|authentication|unauthorized|forbidden/.test(message)) return 'auth_failed';
  if (status === 404 || /model .*not found|model.*unavailable|does not exist/.test(message)) return 'model_unavailable';
  if (status === 429 || /rate limit|too many requests/.test(message)) return 'rate_limited_transient';
  if (status >= 500 && status <= 599) return 'provider_5xx';
  if (/timeout|timed out|econn|enotfound|socket|network|fetch failed/.test(message)) return 'network_transient';
  if (/empty response|no usable|no content/.test(message)) return 'empty_response';
  return 'unknown_provider_failure';
}

function safeProviderError(provider, category, error) {
  const normalized = new Error(`${provider} ${category}: ${errorMessage(error)}`.trim());
  normalized.provider = provider;
  normalized.providerCategory = category;
  normalized.status = statusOf(error);
  normalized.cause = error;
  return normalized;
}

function configuredModel(env, names) {
  for (const name of names) {
    const value = String(env?.[name] || '').trim();
    if (value) return value;
  }
  return null;
}

function configuredProviders(env = process.env) {
  const openai = getAiConfig(env);
  const providers = [];
  if (openai.apiKey && openai.model) providers.push({
    name: 'openai', model: openai.model, configured: true, baseURL: openai.baseURL,
    adapter: async ({ messages, options }) => getAiClient().chat.completions.create({ model: openai.model, messages, ...(options || {}) }),
  });

  // These native adapters are opt-in only when both credentials and a model are
  // explicitly configured. A legacy API key alone must never cause production to
  // make an unbounded or surprising external request.
  const anthropicModel = configuredModel(env, ['ANTHROPIC_MODEL', 'CLAUDE_MODEL']);
  if (env?.ANTHROPIC_API_KEY && anthropicModel) providers.push({
    name: 'anthropic', model: anthropicModel, configured: true,
    adapter: ({ messages, options, timeoutMs }) => nativeAnthropic({ env, model: anthropicModel, messages, options, timeoutMs }),
  });
  const cohereModel = configuredModel(env, ['COHERE_MODEL']);
  if (env?.COHERE_API_KEY && cohereModel) providers.push({
    name: 'cohere', model: cohereModel, configured: true,
    adapter: ({ messages, options, timeoutMs }) => nativeCohere({ env, model: cohereModel, messages, options, timeoutMs }),
  });
  return providers;
}

export function listConfiguredProviders(env = process.env) {
  const order = String(env?.MOBIUS_AI_PROVIDER_ORDER || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const preferred = order.length ? order : DEFAULT_PROVIDER_ORDER;
  const providers = configuredProviders(env);
  return [...preferred, ...providers.map((provider) => provider.name)]
    .filter((name, index, values) => values.indexOf(name) === index)
    .map((name) => providers.find((provider) => provider.name === name))
    .filter(Boolean);
}

function requestBodyOptions(options = {}) {
  const maxTokens = options.max_tokens ?? options.max_completion_tokens ?? 4096;
  const body = { max_tokens: maxTokens };
  if (typeof options.temperature === 'number') body.temperature = options.temperature;
  return body;
}

async function fetchJson(url, init, provider, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let payload = null;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `${response.status} ${response.statusText}`);
      error.status = response.status;
      error.code = payload?.error?.type || payload?.error?.code || payload?.code;
      error.provider = provider;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function nativeAnthropic({ env, model, messages, options, timeoutMs }) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const body = { model, messages: messages.filter((message) => message.role !== 'system'), ...requestBodyOptions(options) };
  if (system) body.system = system;
  const base = String(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/$/, '');
  const payload = await fetchJson(`${base}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
  }, 'anthropic', timeoutMs);
  const content = Array.isArray(payload.content) ? payload.content.filter((part) => part.type === 'text').map((part) => part.text).join('') : '';
  return { id: payload.id, model: payload.model || model, usage: payload.usage, choices: [{ finish_reason: payload.stop_reason, message: { role: 'assistant', content } }] };
}

async function nativeCohere({ env, model, messages, options, timeoutMs }) {
  const base = String(env.COHERE_BASE_URL || 'https://api.cohere.com/v2/chat').replace(/\/$/, '');
  const payload = await fetchJson(base.endsWith('/chat') ? base : `${base}/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: JSON.stringify({ model, messages, ...requestBodyOptions(options) }),
  }, 'cohere', timeoutMs);
  const content = Array.isArray(payload.message?.content)
    ? payload.message.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
    : String(payload.text || '');
  return { id: payload.id, model: payload.model || model, usage: payload.usage, choices: [{ finish_reason: payload.finish_reason, message: { role: 'assistant', content } }] };
}

function validationCategory(error) {
  if (error?.code === 'SCRIPT_PACKAGE_WORD_CAP_EXCEEDED') return 'content_validation_failed';
  return 'schema_invalid';
}

export function createAiProviderRun({ env = process.env, providerOrder, providers: overrides = {}, maxRetries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const configured = listConfiguredProviders(env).map((provider) => ({ ...provider, ...(overrides[provider.name] || {}) }));
  const overrideOnly = Object.entries(overrides)
    .filter(([name]) => !configured.some((provider) => provider.name === name))
    .map(([name, provider]) => ({ name, model: provider.model || 'test-model', configured: provider.configured !== false, ...provider }));
  const available = [...configured, ...overrideOnly].filter((provider) => provider.configured !== false);
  const order = (Array.isArray(providerOrder) ? providerOrder : String(providerOrder || env?.MOBIUS_AI_PROVIDER_ORDER || '').split(','))
    .map((name) => String(name).trim().toLowerCase()).filter(Boolean);
  const ordered = [...(order.length ? order : DEFAULT_PROVIDER_ORDER), ...available.map((provider) => provider.name)]
    .filter((name, index, values) => values.indexOf(name) === index)
    .map((name) => available.find((provider) => provider.name === name)).filter(Boolean);
  const disabled = new Set();
  const attempts = [];

  const assertConfigured = () => {
    if (!ordered.length) {
      const error = new Error('No configured MOBIUS AI provider can execute this generation task.');
      error.code = 'AI_NOT_CONFIGURED'; error.statusCode = 422; throw error;
    }
  };

  const complete = async ({ messages, options = {}, validate, maxRetries: requestMaxRetries, disableOnFailure = true, inputHash = hash(JSON.stringify(messages)), promptTemplateVersion = 'unknown', schemaContractVersion = 'unknown' } = {}) => {
    assertConfigured();
    const retries = requestMaxRetries === undefined ? Number(maxRetries) : Number(requestMaxRetries);
    let lastFailure = null;
    for (const provider of ordered) {
      if (disabled.has(provider.name)) continue;
      const attemptsForProvider = Math.max(0, retries) + 1;
      for (let attempt = 1; attempt <= attemptsForProvider; attempt += 1) {
        try {
          const response = await provider.adapter({ messages, options, timeoutMs, model: provider.model });
          let value = response;
          if (validate) {
            try { value = await validate(response, provider); }
            catch (error) { throw safeProviderError(provider.name, validationCategory(error), error); }
          }
          if (!textOf(response)) throw safeProviderError(provider.name, 'empty_response', new Error('provider returned no usable content'));
          const output = textOf(response);
          const provenance = {
            provider: provider.name, model: provider.model, promptTemplateVersion, schemaContractVersion,
            inputHash, outputHash: hash(output), generatedAt: new Date().toISOString(),
          };
          return { response, value, model: provider.model, provenance, attempts: [...attempts] };
        } catch (error) {
          lastFailure = error;
          const category = classifyProviderError(error, provider.name);
          attempts.push({ provider: provider.name, model: provider.model, attempt, category, status: statusOf(error) || null });
          const terminalModelOutput = [
            'reasoning_budget_exhausted',
            'output_budget_exhausted',
            'malformed_provider_payload',
          ].includes(error?.cause?.classification);
          const terminalContentValidation = [
            'SCRIPT_PACKAGE_INVALID',
            'SCRIPT_PACKAGE_WORD_CAP_EXCEEDED',
          ].includes(error?.cause?.code);
          const retryable = !terminalModelOutput && !terminalContentValidation
            && ['rate_limited_transient', 'network_transient', 'provider_5xx', 'empty_response', 'schema_invalid'].includes(category);
          if (!retryable || attempt >= attemptsForProvider) {
            if (disableOnFailure) disabled.add(provider.name);
            break;
          }
        }
      }
    }
    if (ordered.length === 1 && lastFailure) {
      const finalCategory = classifyProviderError(lastFailure);
      const providerUnavailable = [
        'quota_exhausted',
        'auth_failed',
        'model_unavailable',
        'rate_limited_transient',
        'network_transient',
        'provider_5xx',
        'unknown_provider_failure',
      ].includes(finalCategory);
      if (!providerUnavailable) throw lastFailure.cause || lastFailure;
    }
    const error = new Error('All configured MOBIUS AI providers failed for this generation task.');
    error.code = 'AI_PROVIDER_ALL_FAILED'; error.statusCode = 503; error.classification = 'provider_unavailable';
    error.providerAttempts = attempts.map(({ provider, model, attempt, category, status }) => ({ provider, model, attempt, category, status }));
    throw error;
  };

  return {
    providers: ordered.map(({ name, model }) => ({ name, model })),
    providerContractHash: hash(JSON.stringify(ordered.map(({ name, model }) => ({ name, model })))),
    attempts,
    disabledProviders: disabled,
    hasConfiguredProvider: () => ordered.length > 0,
    assertConfigured,
    complete,
  };
}
