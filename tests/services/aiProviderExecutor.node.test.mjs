import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProviderError, createAiProviderRun } from '../../src/services/aiProviderExecutor.js';

const response = (content) => ({ model: 'fallback-model', choices: [{ message: { content } }] });

test('quota exhaustion disables one provider for the run and falls through once', async () => {
  let exhaustedCalls = 0;
  let fallbackCalls = 0;
  const run = createAiProviderRun({
    env: {},
    providerOrder: ['openai', 'anthropic'],
    providers: {
      openai: { model: 'quota-model', adapter: async () => { exhaustedCalls += 1; const error = new Error('credit_balance_exhausted'); error.status = 429; error.code = 'credit_balance_exhausted'; throw error; } },
      anthropic: { model: 'working-model', adapter: async () => { fallbackCalls += 1; return response('valid source summary'); } },
    },
  });
  const result = await run.complete({ messages: [{ role: 'user', content: 'rules' }] });
  assert.equal(result.response.choices[0].message.content, 'valid source summary');
  assert.equal(exhaustedCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.deepEqual(run.attempts.map((attempt) => attempt.category), ['quota_exhausted']);
  assert.equal(result.provenance.provider, 'anthropic');
});

test('a single exhausted provider is still reported as provider-unavailable', async () => {
  const run = createAiProviderRun({
    env: {},
    providerOrder: ['openai'],
    providers: {
      openai: { model: 'quota-model', adapter: async () => { throw Object.assign(new Error('credit_balance_exhausted'), { status: 429, code: 'credit_balance_exhausted' }); } },
    },
  });
  await assert.rejects(() => run.complete({ messages: [{ role: 'user', content: 'rules' }] }), (error) => {
    assert.equal(error.code, 'AI_PROVIDER_ALL_FAILED');
    assert.equal(error.classification, 'provider_unavailable');
    assert.deepEqual(error.providerAttempts.map((attempt) => attempt.category), ['quota_exhausted']);
    return true;
  });
});

test('schema-invalid output retries once, then uses the next provider', async () => {
  let firstCalls = 0;
  const run = createAiProviderRun({
    env: {}, providerOrder: ['openai', 'cohere'],
    providers: {
      openai: { adapter: async () => { firstCalls += 1; return response('{bad'); } },
      cohere: { adapter: async () => response('{"ok":true}') },
    },
  });
  const result = await run.complete({
    messages: [{ role: 'user', content: 'json' }],
    validate: (value) => { if (value.choices[0].message.content === '{bad') { const error = new Error('invalid structured output'); error.classification = 'schema_invalid'; throw error; } return { ok: true }; },
  });
  assert.deepEqual(result.value, { ok: true });
  assert.equal(firstCalls, 2);
  assert.equal(run.attempts.filter((attempt) => attempt.category === 'schema_invalid').length, 2);
});

test('all provider failure is normalized without exposing credential material', async () => {
  const run = createAiProviderRun({
    env: {}, providerOrder: ['openai', 'anthropic'],
    providers: {
      openai: { adapter: async () => { throw Object.assign(new Error('invalid api key'), { status: 401, code: 'invalid_api_key' }); } },
      anthropic: { adapter: async () => { throw Object.assign(new Error('invalid api key'), { status: 401, code: 'invalid_api_key' }); } },
    },
  });
  await assert.rejects(() => run.complete({ messages: [{ role: 'user', content: 'rules' }] }), (error) => {
    assert.equal(error.code, 'AI_PROVIDER_ALL_FAILED');
    assert.equal(error.classification, 'provider_unavailable');
    assert.equal(error.providerAttempts[0].category, 'auth_failed');
    assert.equal(JSON.stringify(error).includes('sk-'), false);
    return true;
  });
});

test('provider categories distinguish quota from transient rate limiting', () => {
  assert.equal(classifyProviderError(Object.assign(new Error('credit_balance_exhausted'), { status: 429 })), 'quota_exhausted');
  assert.equal(classifyProviderError(Object.assign(new Error('too many requests'), { status: 429 })), 'rate_limited_transient');
  assert.equal(classifyProviderError(Object.assign(new Error('bad model'), { status: 404 })), 'model_unavailable');
});
