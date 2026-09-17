import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalVisualProviderEnvironment,
  ensureCanonicalVisualProviderBudget,
} from '../../scripts/run-rulebook-production.mjs';

const PROJECT_ID = 'fixture-visual-budget';
const SOURCE_SHA = 'a'.repeat(64);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-visual-budget-'));
  const projectDir = path.join(root, PROJECT_ID);
  await fs.mkdir(path.join(projectDir, 'production', 'source'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'production', 'composition'), { recursive: true });
  await fs.writeFile(path.join(projectDir, 'production', 'source', 'one.response.json'), JSON.stringify({ identity: { contract: 'mobius-object-visual-evidence-v2' }, candidate: 'one' }));
  await fs.writeFile(path.join(projectDir, 'production', 'composition', 'two.response.json'), JSON.stringify({ identity: { contract: 'mobius-object-visual-evidence-v1' }, candidate: 'two' }));
  await fs.writeFile(path.join(projectDir, 'production', 'source', 'rule-text.response.json'), JSON.stringify({ contract: 'mobius-rulebook-domain-synthesis-v1' }));
  return { root, projectDir };
}

test('canonical visual budget imports project receipts once and reserves separate future source/composition capacity', async (t) => {
  const { root, projectDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = await ensureCanonicalVisualProviderBudget({
    projectId: PROJECT_ID,
    projectDir,
    sourceSha256: SOURCE_SHA,
    env: { MOBIUS_VISUAL_SOURCE_INITIAL_ALLOWANCE: '3', MOBIUS_VISUAL_COMPOSITION_INITIAL_ALLOWANCE: '5' },
  });
  assert.equal(first.initialized, true);
  assert.equal(first.ledger.contract, 'mobius-project-visual-provider-budget-v1');
  assert.equal(first.ledger.historicalReceiptCount, 2);
  assert.equal(first.ledger.calls.length, 2);
  assert.deepEqual(first.ledger.groupCaps, { historical: 2, source: 3, composition: 5 });
  assert.equal(first.ledger.maxTotal, 10);
  assert.ok(first.ledger.calls.every((call) => /^[a-f0-9]{64}$/.test(call.identity.receiptSha256)));
  assert.ok(first.ledger.calls.every((call) => !Object.hasOwn(call.identity, 'response')));

  const second = await ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: SOURCE_SHA });
  assert.equal(second.initialized, false);
  assert.deepEqual(second.ledger, first.ledger);
});

test('canonical visual budget rejects a project or source identity mismatch', async (t) => {
  const { root, projectDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: SOURCE_SHA });
  await assert.rejects(
    () => ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: crypto.randomBytes(32).toString('hex') }),
    /CANONICAL_VISUAL_PROVIDER_BUDGET_INVALID/,
  );
  await assert.rejects(
    () => ensureCanonicalVisualProviderBudget({ projectId: 'other-project', projectDir, sourceSha256: SOURCE_SHA }),
    /CANONICAL_VISUAL_PROVIDER_BUDGET_INVALID/,
  );
});

test('source and composition subprocesses receive the same durable ledger explicitly', async (t) => {
  const { root, projectDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const budget = await ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: SOURCE_SHA });
  const source = canonicalVisualProviderEnvironment({ root, budget, group: 'source', env: { OPENAI_MODEL: 'gpt-5.6-sol' } });
  const composition = canonicalVisualProviderEnvironment({ root, budget, group: 'composition', env: { OPENAI_MODEL: 'gpt-5.6-sol' } });
  assert.equal(source.MOBIUS_VISUAL_BUDGET_LEDGER, budget.path);
  assert.equal(composition.MOBIUS_VISUAL_BUDGET_LEDGER, budget.path);
  assert.equal(source.MOBIUS_VISUAL_BUDGET_GROUP, 'source');
  assert.equal(composition.MOBIUS_VISUAL_BUDGET_GROUP, 'composition');
  assert.equal(source.MOBIUS_VISUAL_REQUIRE_BUDGET_LEDGER, 'true');
  assert.equal(composition.MOBIUS_VISUAL_COMPOSITION_BUDGET_GROUP, 'composition');
});

test('canonical source subprocess configuration takes its bounded referent mandate from the durable ledger', async (t) => {
  const { root, projectDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const budget = await ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: SOURCE_SHA });
  const ledger = JSON.parse(await fs.readFile(budget.path, 'utf8'));
  ledger.sourceAnalysisMandates = [{
    id: 'fixture-source-slice', contract: 'mobius-source-visual-analysis-mandate-v1',
    referents: [{ id: 'capture-token', maxCalls: 1, allowedRoles: ['COMPONENT'] }],
  }];
  ledger.activeSourceAnalysisMandateId = 'fixture-source-slice';
  await fs.writeFile(budget.path, JSON.stringify(ledger));
  const source = canonicalVisualProviderEnvironment({
    root, budget: { ...budget, ledger }, group: 'source',
    env: { MOBIUS_VISUAL_SOURCE_ALLOWED_REFERENTS: 'stale-terminal-value' },
  });
  assert.equal(source.MOBIUS_VISUAL_SOURCE_MANDATE_ID, 'fixture-source-slice');
  assert.equal(source.MOBIUS_VISUAL_SOURCE_ALLOWED_REFERENTS, 'capture-token');
  assert.equal(source.MOBIUS_VISUAL_SOURCE_PRIORITY_REFERENTS, 'capture-token');
});

test('canonical composition subprocess configuration takes its bounded scene scope from the durable ledger', async (t) => {
  const { root, projectDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const budget = await ensureCanonicalVisualProviderBudget({ projectId: PROJECT_ID, projectDir, sourceSha256: SOURCE_SHA });
  const ledger = JSON.parse(await fs.readFile(budget.path, 'utf8'));
  ledger.compositionReviewMandates = [{
    id: 'fixture-composition-slice', contract: 'mobius-composition-review-mandate-v1',
    sceneIds: ['prepared-scene'], maxCalls: 1,
  }];
  ledger.activeCompositionReviewMandateId = 'fixture-composition-slice';
  await fs.writeFile(budget.path, JSON.stringify(ledger));
  const composition = canonicalVisualProviderEnvironment({
    root, budget: { ...budget, ledger }, group: 'composition',
    env: { MOBIUS_VISUAL_COMPOSITION_SCENE_IDS: 'stale-terminal-value' },
  });
  assert.equal(composition.MOBIUS_VISUAL_COMPOSITION_SCENE_IDS, 'prepared-scene');
  assert.equal(composition.MOBIUS_VISUAL_COMPOSITION_MAX_PROVIDER_CALLS, '1');
});

test('a production-marked visual subprocess fails closed before a provider call without its ledger', () => {
  const result = spawnSync(process.execPath, ['scripts/prepare-source-visuals.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, MOBIUS_VISUAL_REQUIRE_BUDGET_LEDGER: 'true', MOBIUS_VISUAL_BUDGET_LEDGER: '' },
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /VISUAL_BUDGET_LEDGER_REQUIRED_BEFORE_PROVIDER_CALL/);
});
