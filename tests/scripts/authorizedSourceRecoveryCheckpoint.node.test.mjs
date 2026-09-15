import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automaticAuthorizedSourceRecoveryInput,
  automaticAuthorizedSourceRecoveryInputHash,
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
  assert.equal(current.contract, 'mobius-automatic-authorized-source-recovery-v3');
  assert.equal(current.publisherCandidateRecoveryContract, resolver.OFFICIAL_PUBLISHER_SOURCE_RECOVERY_CONTRACT);

  const legacyHash = automaticAuthorizedSourceRecoveryInputHash({
    ...fixture,
    publisherCandidateRecoveryContract: 'mobius-official-publisher-source-recovery-v1',
  });
  const currentHash = automaticAuthorizedSourceRecoveryInputHash(fixture);
  assert.notEqual(currentHash, legacyHash);
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
  assert.equal(withPublisher.pipeline, 'focused-source-visuals-v18-authorized-external-caption-preservation');
  assert.equal(withPublisher.authorizedCandidateManifests.length, 1);
  assert.notDeepEqual(withPublisher, localOnly);
});
