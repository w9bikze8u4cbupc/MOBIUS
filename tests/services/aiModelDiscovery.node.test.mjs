import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MAX_MODEL_PROBES,
  boundModelCandidates,
  probeProviderModel,
  resolveProviderModel,
} from '../../src/services/aiModelDiscovery.js';

const jsonResponse = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return value; } });

test('explicit model is probed directly and has precedence over discovery', async () => {
  const calls = [];
  const result = await resolveProviderModel({
    provider: 'anthropic', explicitModel: 'configured-model', env: { ANTHROPIC_API_KEY: 'secret' },
    cacheFile: path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-model-')), 'cache.json'),
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      return jsonResponse({ id: 'message-1', content: [{ type: 'text', text: '{"ok":true}' }] });
    },
  });
  assert.equal(result.model, 'configured-model');
  assert.equal(result.source, 'explicit-probe');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /messages$/);
});

test('successful discovery is cached and reused without another provider request', async () => {
  const cacheFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-model-')), 'cache.json');
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    return url.includes('/models')
      ? jsonResponse({ data: [{ id: 'claude-3-5-haiku-latest' }] })
      : jsonResponse({ id: 'message-1', content: [{ type: 'text', text: '{"ok":true}' }] });
  };
  const first = await resolveProviderModel({ provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'secret' }, cacheFile, fetchImpl, now: 1700000000000 });
  const second = await resolveProviderModel({ provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'secret' }, cacheFile, fetchImpl, now: 1700000000000 });
  assert.equal(first.compatible, true);
  assert.equal(second.source, 'cache');
  assert.equal(calls, 2);
});

test('candidate probing is bounded and structured output is required', async () => {
  const candidates = boundModelCandidates('cohere', Array.from({ length: 30 }, (_, index) => `command-${index}`));
  assert.ok(candidates.length <= MAX_MODEL_PROBES);
  const valid = await probeProviderModel({
    provider: 'cohere', model: 'command-r', env: { COHERE_API_KEY: 'secret' },
    fetchImpl: async () => jsonResponse({ message: { content: [{ type: 'text', text: '{"ok":true}' }] } }),
  });
  const invalid = await probeProviderModel({
    provider: 'cohere', model: 'command-r', env: { COHERE_API_KEY: 'secret' },
    fetchImpl: async () => jsonResponse({ message: { content: [{ type: 'text', text: 'not json' }] } }),
  });
  assert.equal(valid.compatible, true);
  assert.equal(invalid.classification, 'schema_invalid');
  assert.equal(JSON.stringify(invalid).includes('secret'), false);
});
