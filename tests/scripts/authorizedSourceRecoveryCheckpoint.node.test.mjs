import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  automaticAuthorizedSourceRecoveryInput,
  automaticAuthorizedSourceRecoveryInputHash,
  authorizedRecoveryManifestPlan,
  sourceVisualReviewInput,
} from '../../scripts/run-rulebook-production.mjs';
import resolver from '../../src/services/sourceAssetResolver.cjs';

const fixture = {
  sourceSha256: 'a'.repeat(64),
  identity: { displayName: 'Fixture Game' },
  targetProvenance: { 'component-1': { sourceRefs: [{ page: 4, evidenceId: 'fixture' }] } },
  documentMap: { pages: [{ humanPageNumber: 4, textHash: 'page-four' }] },
};

test('authorized publisher recovery checkpoint depends on its nested recovery contract', () => {
  const current = automaticAuthorizedSourceRecoveryInput(fixture);
  assert.equal(current.contract, 'mobius-automatic-authorized-source-recovery-v4');
  assert.equal(current.publisherCandidateRecoveryContract, resolver.OFFICIAL_PUBLISHER_SOURCE_RECOVERY_CONTRACT);

  const legacyHash = automaticAuthorizedSourceRecoveryInputHash({
    ...fixture,
    publisherCandidateRecoveryContract: 'mobius-official-publisher-source-recovery-v1',
  });
  const currentHash = automaticAuthorizedSourceRecoveryInputHash(fixture);
  assert.notEqual(currentHash, legacyHash);
});

test('measured exact-game recovery supplements rather than suppresses an early publisher gallery', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-recovery-cascade-'));
  const publisher = path.join(directory, 'publisher.json');
  const measured = path.join(directory, 'bgg.json');
  fs.writeFileSync(publisher, '{}');
  fs.writeFileSync(measured, '{}');
  const plan = authorizedRecoveryManifestPlan({
    earlyRecovery: { status: 'RECOVERED', originalManifest: publisher },
    measuredRecovery: { status: 'RECOVERED', originalManifest: measured },
  });
  assert.equal(plan.contract, 'mobius-authorized-source-recovery-cascade-v1');
  assert.deepEqual(plan.manifests, [path.resolve(publisher), path.resolve(measured)]);
  assert.deepEqual(plan.deferredManifests, [path.resolve(measured)]);
});

test('the same replayed manifest is not reviewed twice', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-recovery-replay-'));
  const manifest = path.join(directory, 'same.json');
  fs.writeFileSync(manifest, '{}');
  const plan = authorizedRecoveryManifestPlan({
    earlyRecovery: { status: 'RECOVERED', originalManifest: manifest },
    measuredRecovery: { status: 'RECOVERED', originalManifest: manifest },
  });
  assert.deepEqual(plan.manifests, [path.resolve(manifest)]);
  assert.deepEqual(plan.deferredManifests, []);
});

test('authorized publisher recovery checkpoint replays only unchanged dependencies', () => {
  const first = automaticAuthorizedSourceRecoveryInputHash(fixture);
  const replay = automaticAuthorizedSourceRecoveryInputHash(structuredClone(fixture));
  const changedDocument = automaticAuthorizedSourceRecoveryInputHash({
    ...fixture,
    documentMap: { pages: [{ humanPageNumber: 4, textHash: 'changed-page-four' }] },
  });
  assert.equal(replay, first);
  assert.notEqual(changedDocument, first);
});

test('initial visual review incorporates recovered publisher candidates in its single bounded input', () => {
  const common = {
    visualScriptHash: 'script', hephHash: 'hephaestus', sourceSha256: 'a'.repeat(64),
    matchModel: 'fixture-model', providerConfiguration: 'fixture-config',
  };
  const localOnly = sourceVisualReviewInput(common);
  const withPublisher = sourceVisualReviewInput({
    ...common,
    authorizedCandidateManifests: [{ contract: 'publisher-v2', candidates: [{ id: 'official-image' }] }],
  });
  assert.equal(withPublisher.pipeline, 'focused-source-visuals-v26-derived-candidate-replay');
  assert.equal(withPublisher.authorizedCandidateManifests.length, 1);
  assert.notDeepEqual(withPublisher, localOnly);
});
