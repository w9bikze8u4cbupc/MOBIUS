import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const AI_ENVIRONMENT_VARIABLES = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'AI_INTEGRATIONS_OPENAI_BASE_URL',
  'AI_INTEGRATIONS_OPENAI_API_KEY',
];

test('the model discovery dependency path exposes its ESM named exports offline', async (t) => {
  const originalDirectory = process.cwd();
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'mobius-ai-models-'));
  const originalEnvironment = new Map(
    AI_ENVIRONMENT_VARIABLES.map((name) => [name, process.env[name]]),
  );

  process.chdir(temporaryDirectory);
  for (const name of AI_ENVIRONMENT_VARIABLES) {
    delete process.env[name];
  }

  t.after(async () => {
    process.chdir(originalDirectory);
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  const { getAiConfig, listAccessibleModelIds } = await import('../src/config/aiConfig.js');

  assert.equal(typeof getAiConfig, 'function');
  assert.equal(typeof listAccessibleModelIds, 'function');
  assert.equal(getAiConfig().apiKey, '');
});
