import {
  AI_PROVIDER_READINESS_CONTRACT,
  evaluateAiProviderReadiness,
  getAiProviderReadiness,
  preflightAiProviderReadiness,
} from '../../src/services/aiProviderReadiness.js';

function apiResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const readyOpenAiStatus = async () => ({
  configured: true,
  ready: true,
  provider: 'openai',
  model: 'test-model',
  message: 'ready',
});
describe('canonical AI provider readiness', () => {
  test('fully configured provider passes through a non-generative metadata check', async () => {
    const status = await getAiProviderReadiness({
      env: { OPENAI_API_KEY: 'secret-for-test', OPENAI_MODEL: 'test-model' },
      checkAccess: true,
      getOpenAiStatus: readyOpenAiStatus,
    });
    expect(status).toMatchObject({
      contract: AI_PROVIDER_READINESS_CONTRACT,
      configured: true,
      ready: true,
      provider: 'openai',
      model: 'test-model',
      credentialPresent: true,
      accessCheck: 'model-metadata',
    });
    expect(JSON.stringify(status)).not.toContain('secret-for-test');
    expect(evaluateAiProviderReadiness(status).ready).toBe(true);
  });

  test.each([
    [{ OPENAI_API_KEY: 'present' }, 'credential but no model'],
    [{ OPENAI_MODEL: 'test-model' }, 'model but no credential'],
    [{}, 'credential or model'],
  ])('incomplete configuration is blocked: %s', async (env, expectedMessage) => {
    const status = await getAiProviderReadiness({ env, checkAccess: true });
    expect(status).toMatchObject({ configured: false, ready: false, code: 'AI_NOT_CONFIGURED' });
    expect(status.message).toContain(expectedMessage);
  });

  test('unsupported selected provider is blocked structurally', async () => {
    const status = await getAiProviderReadiness({
      env: { MOBIUS_AI_PROVIDER_ORDER: 'unsupported-provider', OPENAI_API_KEY: 'present', OPENAI_MODEL: 'test-model' },
      checkAccess: true,
    });
    expect(status).toMatchObject({ configured: false, ready: false, code: 'AI_PROVIDER_UNSUPPORTED' });
  });

  test('worker accepts only the API runtime readiness contract', async () => {
    await expect(preflightAiProviderReadiness({
      baseUrl: 'http://fixture.local',
      fetchImpl: async () => apiResponse({ configured: true, ready: true, provider: 'openai', model: 'test-model' }),
    })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', classification: 'configuration_required' });
  });
});
