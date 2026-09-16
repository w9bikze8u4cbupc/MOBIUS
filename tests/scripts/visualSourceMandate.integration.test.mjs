import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import {
  canonicalVisualProviderEnvironment,
  ensureCanonicalVisualProviderBudget,
} from '../../scripts/run-rulebook-production.mjs';

const PROJECT_ID = 'fixture-visual-source-mandate';
const SOURCE_SHA = 'b'.repeat(64);
const root = process.cwd();

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stdout}\n${stderr}`));
    });
  });
}

function responseFor(body) {
  const text = body.messages?.[0]?.content?.[0]?.text || '';
  const packet = JSON.parse(text.slice(text.lastIndexOf('\n') + 1));
  const requiredObject = packet.requiredObjects?.[0]?.id;
  return JSON.stringify({
    id: 'fixture-response', object: 'chat.completion', model: 'fixture-model',
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ objects: [{
      requiredObject, present: false, confidence: 0.99, complete: false, isolated: false,
      stateCompatible: false, bbox: [], reason: 'fixture source pixels intentionally rejected',
    }] }) } }],
  });
}

test('normal preparation routes a durable source mandate to Python reservation and blocks an unlisted referent across a new process', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-source-mandate-'));
  const projectDir = path.join(temp, PROJECT_ID);
  const output = path.join(projectDir, 'production', 'source-review');
  await fs.mkdir(projectDir, { recursive: true });
  t.after(() => fs.rm(temp, { recursive: true, force: true }));

  let requests = 0;
  const seenReferents = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      requests += 1;
      const body = JSON.parse(raw);
      const prompt = body.messages?.[0]?.content?.[0]?.text || '';
      seenReferents.push(prompt.includes('allowed-token') ? 'allowed-token' : 'unexpected');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(responseFor(body));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const port = server.address().port;

  const config = path.join(temp, '.env');
  await fs.writeFile(config, [
    'OPENAI_MODEL=fixture-model',
    `AI_INTEGRATIONS_OPENAI_BASE_URL=http://127.0.0.1:${port}/v1`,
    'AI_INTEGRATIONS_OPENAI_API_KEY=fixture-test-key',
  ].join('\n'));
  const script = path.join(temp, 'script.json');
  const manifest = path.join(temp, 'manifest.json');
  // Use an actual production-style raster rather than a synthetic 100px
  // fixture: local screening deliberately refuses assets below its real
  // detail floor, which would leave the reservation path unexercised.
  const pixels = path.join(root, 'tests', 'golden', 'sushi-go', 'frames', 'frame_5s.png');
  await fs.writeFile(script, JSON.stringify({
    scenes: [
      { id: 'allowed-scene', source_pages: [2], visualRequirement: { requiredObjects: ['allowed-token'], componentDiscovery: true } },
      { id: 'unlisted-scene', source_pages: [2], visualRequirement: { requiredObjects: ['comp-5'], componentDiscovery: true } },
    ],
    componentTerms: {
      'allowed-token': { canonicalTerm: 'Allowed token', evidence: [{ page: 2, quote: 'Allowed token.' }] },
      'comp-5': { canonicalTerm: 'Character board', evidence: [{ page: 2, quote: 'Character board.' }] },
    },
  }));
  await fs.writeFile(manifest, JSON.stringify({ images: [{
    id: 'fixture-pixels', file_path: pixels, page_index: 1, source_page: 2,
    dimensions: { width: 960, height: 540 }, semanticObjects: ['Allowed token', 'Character board'],
  }] }));

  const budget = await ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: SOURCE_SHA });
  const requestPath = path.join(temp, 'mandate.json');
  await fs.writeFile(requestPath, JSON.stringify({
    id: 'fixture-source-mandate', model: 'fixture-model', authorization: 'fixture only',
    reason: 'prove durable source routing', additionalCallsByGroup: { source: 1 },
    sourceAnalysisMandate: { contract: 'mobius-source-visual-analysis-mandate-v1', referents: [
      { id: 'allowed-token', maxCalls: 1, allowedRoles: ['COMPONENT'] },
    ] },
  }));
  const authorized = spawnSync('python', ['scripts/match-scene-visuals.py', '--authorize-continuation', budget.path, requestPath], {
    cwd: root, env: { ...process.env, OPENAI_MODEL: 'fixture-model' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(authorized.status, 0, authorized.stderr);
  budget.ledger = JSON.parse(await fs.readFile(budget.path, 'utf8'));
  const env = canonicalVisualProviderEnvironment({ root: temp, budget, group: 'source', env: {
    MOBIUS_CONFIG_PATH: config, PYTHON: 'python', MOBIUS_VISUAL_MATCH_MAX_CALLS: '2',
    MOBIUS_VISUAL_SOURCE_ALLOWED_REFERENTS: 'stale-ignored-value',
  } });
  assert.equal(env.MOBIUS_VISUAL_SOURCE_MANDATE_ID, 'fixture-source-mandate');
  assert.equal(env.MOBIUS_VISUAL_SOURCE_ALLOWED_REFERENTS, 'allowed-token');

  const args = ['scripts/prepare-source-visuals.mjs', '--script', script, '--asset-manifest', manifest, '--output-dir', output];
  await run(process.execPath, args, { cwd: root, env });
  const firstReport = JSON.parse(await fs.readFile(path.join(output, 'source-visual-semantic-matches.json'), 'utf8'));
  const qualityReport = JSON.parse(await fs.readFile(path.join(output, 'source-visual-quality.json'), 'utf8'));
  assert.equal(requests, 1, JSON.stringify({ summary: firstReport.summary, scenes: firstReport.scenes?.map((scene) => ({
    id: scene.scene_id, candidates: scene.candidates?.map((candidate) => candidate.reason),
  })), quality: qualityReport.summary }));
  assert.deepEqual(seenReferents, ['allowed-token']);
  let ledger = JSON.parse(await fs.readFile(budget.path, 'utf8'));
  assert.equal(ledger.calls.length, 1);
  assert.deepEqual(ledger.calls[0].sourceReservation, {
    contract: 'mobius-source-visual-analysis-mandate-v1', mandateId: 'fixture-source-mandate',
    referent: 'allowed-token', role: 'COMPONENT',
  });

  // A new Node/Python process rehydrates the exact cache and cannot reserve a
  // second call for the same referent; the out-of-scope scene remains local.
  await run(process.execPath, args, { cwd: root, env });
  assert.equal(requests, 1);
  ledger = JSON.parse(await fs.readFile(budget.path, 'utf8'));
  assert.equal(ledger.calls.length, 1);
});
