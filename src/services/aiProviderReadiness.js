import crypto from 'node:crypto';
import { getAiStatus } from '../config/aiConfig.js';
import { listProviderModels } from './aiModelDiscovery.js';

export const AI_PROVIDER_READINESS_CONTRACT = 'mobius-ai-provider-readiness-v1';
export const SUPPORTED_AI_PROVIDERS = Object.freeze(['openai', 'anthropic', 'cohere']);

const DEFAULT_PROVIDER_ORDER = SUPPORTED_AI_PROVIDERS;

function value(env, name) {
  return String(env?.[name] || '').trim();
}

function hash(valueToHash) {
  return crypto.createHash('sha256').update(JSON.stringify(valueToHash)).digest('hex');
}

function providerOrder(env) {
  const configured = value(env, 'MOBIUS_AI_PROVIDER_ORDER')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : [...DEFAULT_PROVIDER_ORDER];
}

function safeProviderConfiguration(env = process.env) {
  const integrationCredential = value(env, 'AI_INTEGRATIONS_OPENAI_API_KEY');
  const openAiCredential = integrationCredential || value(env, 'OPENAI_API_KEY');
  return {
    openai: {
      provider: 'openai',
      model: value(env, 'OPENAI_MODEL') || null,
      credentialPresent: Boolean(openAiCredential),
    },
    anthropic: {
      provider: 'anthropic',
      model: value(env, 'ANTHROPIC_MODEL') || value(env, 'CLAUDE_MODEL') || null,
      credentialPresent: Boolean(value(env, 'ANTHROPIC_API_KEY')),
    },
    cohere: {
      provider: 'cohere',
      model: value(env, 'COHERE_MODEL') || null,
      credentialPresent: Boolean(value(env, 'COHERE_API_KEY')),
    },
  };
}

function unavailableResult({ env, providers, code, message, classification = 'configuration_required' }) {
  const selected = providers.find((provider) => provider.credentialPresent || provider.model) || providers[0] || null;
  return {
    contract: AI_PROVIDER_READINESS_CONTRACT,
    configured: false,
    ready: false,
    provider: selected?.provider || null,
    model: selected?.model || null,
    credentialPresent: Boolean(selected?.credentialPresent),
    modelConfigured: Boolean(selected?.model),
    accessCheck: 'not-run',
    code,
    classification,
    message,
    providers,
    configurationFingerprint: hash({
      order: providerOrder(env),
      providers: providers.map(({ provider, model, credentialPresent }) => ({ provider, model, credentialPresent })),
    }),
  };
}

/**
 * Checks the provider used by the API without issuing a completion. OpenAI uses
 * model metadata retrieval; Anthropic and Cohere use their model-list endpoint.
 * No credential value is returned or included in the public fingerprint.
 */
export async function getAiProviderReadiness({
  env = process.env,
  checkAccess = false,
  getOpenAiStatus = getAiStatus,
  listModels = listProviderModels,
} = {}) {
  const configurations = safeProviderConfiguration(env);
  const order = providerOrder(env);
  const unsupported = order.filter((provider) => !SUPPORTED_AI_PROVIDERS.includes(provider));
  const providers = order
    .filter((provider) => SUPPORTED_AI_PROVIDERS.includes(provider))
    .map((provider) => configurations[provider]);

  if (unsupported.length) {
    return unavailableResult({
      env,
      providers,
      code: 'AI_PROVIDER_UNSUPPORTED',
      message: `Unsupported MOBIUS AI provider in MOBIUS_AI_PROVIDER_ORDER: ${unsupported.join(', ')}.`,
    });
  }

  const complete = providers.filter((provider) => provider.credentialPresent && provider.model);
  if (!complete.length) {
    const partial = providers.find((provider) => provider.credentialPresent || provider.model);
    const message = !partial
      ? 'No MOBIUS AI provider credential or model is configured in the canonical runtime.'
      : !partial.credentialPresent
        ? `MOBIUS AI provider "${partial.provider}" has a model but no credential in the canonical runtime.`
        : `MOBIUS AI provider "${partial.provider}" has a credential but no model in the canonical runtime.`;
    return unavailableResult({ env, providers, code: 'AI_NOT_CONFIGURED', message });
  }

  if (!checkAccess) {
    const selected = complete[0];
    return {
      ...unavailableResult({ env, providers, code: null, message: 'AI configuration is loaded; access has not been checked.' }),
      configured: true,
      provider: selected.provider,
      model: selected.model,
      credentialPresent: true,
      modelConfigured: true,
    };
  }

  const failures = [];
  for (const selected of complete) {
    try {
      let ready = false;
      let detail = '';
      if (selected.provider === 'openai') {
        const status = await getOpenAiStatus({ checkAccess: true });
        ready = Boolean(status.ready && status.model === selected.model);
        detail = status.message || '';
      } else {
        const result = await listModels({ provider: selected.provider, env });
        ready = result.models.includes(selected.model);
        detail = ready
          ? `AI model "${selected.model}" is listed by ${selected.provider}.`
          : `AI model "${selected.model}" is not listed by ${selected.provider}.`;
      }
      if (ready) {
        return {
          contract: AI_PROVIDER_READINESS_CONTRACT,
          configured: true,
          ready: true,
          provider: selected.provider,
          model: selected.model,
          credentialPresent: true,
          modelConfigured: true,
          accessCheck: selected.provider === 'openai' ? 'model-metadata' : 'model-list',
          code: null,
          classification: null,
          message: detail,
          providers,
          configurationFingerprint: hash({
            order,
            providers: providers.map(({ provider, model, credentialPresent }) => ({ provider, model, credentialPresent })),
          }),
        };
      }
      failures.push({ provider: selected.provider, model: selected.model, reason: detail });
    } catch (error) {
      failures.push({ provider: selected.provider, model: selected.model, reason: String(error?.message || error) });
    }
  }

  const selected = complete[0];
  const failureDetail = failures.map((failure) => failure.reason).filter(Boolean).join(' ');
  return {
    ...unavailableResult({
      env,
      providers,
      code: 'AI_MODEL_UNAVAILABLE',
      classification: 'provider_unavailable',
      message: `No configured MOBIUS AI model passed the non-generative access check.${failureDetail ? ` ${failureDetail}` : ''}`,
    }),
    configured: true,
    provider: selected.provider,
    model: selected.model,
    credentialPresent: true,
    modelConfigured: true,
    accessCheck: 'failed',
    failures,
  };
}

export class AiProviderReadinessError extends Error {
  constructor(status) {
    super(status?.message || 'MOBIUS AI provider is not ready.');
    this.name = 'AiProviderReadinessError';
    this.code = status?.code || 'AI_NOT_CONFIGURED';
    this.statusCode = 422;
    this.classification = status?.classification || 'configuration_required';
    this.readiness = status;
  }
}

export function evaluateAiProviderReadiness(status) {
  const reasons = [];
  if (!status || status.contract !== AI_PROVIDER_READINESS_CONTRACT) reasons.push('legacy-or-missing-ai-readiness-contract');
  if (!status?.configured) reasons.push(status?.code || 'ai-not-configured');
  if (!status?.ready) reasons.push(status?.code || 'ai-access-not-verified');
  if (!status?.credentialPresent) reasons.push('credential-missing');
  if (!status?.model) reasons.push('model-missing');
  return { ready: reasons.length === 0, reasons };
}

export async function preflightAiProviderReadiness({ baseUrl, apiKey, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/api/ai/status?check=1`, {
      headers: apiKey ? { 'x-api-key': apiKey, 'x-mobius-api-key': apiKey } : {},
    });
  } catch (cause) {
    throw new AiProviderReadinessError({
      code: 'AI_RUNTIME_UNAVAILABLE',
      classification: 'retryable_runtime',
      message: `MOBIUS AI readiness endpoint is unavailable: ${cause.message}`,
    });
  }
  const status = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AiProviderReadinessError({
      code: status?.code || 'AI_READINESS_CHECK_FAILED',
      classification: status?.classification || 'provider_unavailable',
      message: status?.message || status?.error || `MOBIUS AI readiness check failed (${response.status}).`,
    });
  }
  const evaluation = evaluateAiProviderReadiness(status);
  if (!evaluation.ready) throw new AiProviderReadinessError({ ...status, message: status?.message || evaluation.reasons.join(', ') });
  return { status, evaluation };
}
