import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const ENV_FILE_PATH = 'C:\\mobius-games-tutorial-generator\\.env';
let client;
let accessCheckCache = null;

function getValue(env, name) {
  return String(env?.[name] || '').trim();
}

export function getAiConfig(env = process.env) {
  const integrationBaseUrl = getValue(env, 'AI_INTEGRATIONS_OPENAI_BASE_URL');
  const integrationApiKey = getValue(env, 'AI_INTEGRATIONS_OPENAI_API_KEY');
  const apiKey = integrationApiKey || getValue(env, 'OPENAI_API_KEY');
  const model = getValue(env, 'OPENAI_MODEL');
  const provider = integrationBaseUrl && integrationApiKey ? 'ai-integrations' : 'openai';

  return {
    provider,
    baseURL: integrationBaseUrl || undefined,
    apiKey,
    model,
    configured: Boolean(apiKey && model),
  };
}

function getSetupMessage(config) {
  if (!config.apiKey) {
    return `AI script generation is unavailable: set OPENAI_API_KEY in ${ENV_FILE_PATH}, restart the server, then try again.`;
  }
  if (!config.model) {
    return `AI script generation is unavailable: set OPENAI_MODEL to an accessible model ID in ${ENV_FILE_PATH}, restart the server, then try again.`;
  }
  return '';
}

function getUnavailableModelMessage(model) {
  return `AI script generation is unavailable: OPENAI_MODEL "${model}" is not accessible to this API key. Set an accessible model in ${ENV_FILE_PATH}, restart the server, then try again.`;
}

export function getAiClient({ requireModel = true } = {}) {
  const config = getAiConfig();
  if (!config.apiKey || (requireModel && !config.model)) {
    const error = new Error(getSetupMessage(config));
    error.code = 'AI_NOT_CONFIGURED';
    error.statusCode = 422;
    throw error;
  }

  if (!client) {
    client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    });
  }
  return client;
}

export function getAiModel() {
  const config = getAiConfig();
  if (!config.model) {
    const error = new Error(getSetupMessage(config));
    error.code = 'AI_NOT_CONFIGURED';
    error.statusCode = 422;
    throw error;
  }
  return config.model;
}

export async function listAccessibleModelIds() {
  const response = await getAiClient({ requireModel: false }).models.list();
  return (response?.data || [])
    .map((model) => model?.id)
    .filter(Boolean)
    .sort();
}

export async function getAiStatus({ checkAccess = false } = {}) {
  const config = getAiConfig();
  const setupMessage = getSetupMessage(config);
  if (setupMessage) {
    return {
      configured: false,
      provider: config.provider,
      model: config.model || null,
      ready: false,
      message: setupMessage,
    };
  }

  if (!checkAccess) {
    return {
      configured: true,
      provider: config.provider,
      model: config.model,
      ready: false,
      message: 'AI configuration is loaded. Refresh AI status before generating to verify model access.',
    };
  }

  if (!accessCheckCache) {
    accessCheckCache = (async () => {
      try {
        await getAiClient().models.retrieve(config.model);
        return { ready: true, message: `AI model "${config.model}" is ready.` };
      } catch (error) {
        return { ready: false, message: getUnavailableModelMessage(config.model) };
      }
    })();
  }

  const result = await accessCheckCache;
  return {
    configured: true,
    provider: config.provider,
    model: config.model,
    ready: result.ready,
    message: result.message,
  };
}

export async function requireAiReady({ checkAccess = true } = {}) {
  const status = await getAiStatus({ checkAccess });
  if (!status.ready) {
    const error = new Error(status.message);
    error.code = status.configured ? 'AI_MODEL_UNAVAILABLE' : 'AI_NOT_CONFIGURED';
    error.statusCode = 422;
    throw error;
  }
  return status;
}

export function setAiClientForTests(testClient) {
  client = testClient;
  accessCheckCache = null;
}

export function resetAiConfigForTests() {
  client = null;
  accessCheckCache = null;
}
