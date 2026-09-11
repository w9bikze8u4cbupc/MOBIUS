import {
  assertCanonicalStagePrerequisites,
  canonicalStageReady,
  markCanonicalStage,
  markPreEvidenceDraft,
} from '../../src/services/canonicalProductionStages.js';

test('a pre-evidence draft cannot masquerade as a canonical ready stage', () => {
  const checkpoint = { stages: {} };
  markPreEvidenceDraft(checkpoint, 'storyboard', 'draft-hash', [], { scenes: 8 });
  expect(canonicalStageReady(checkpoint, 'storyboard', 'draft-hash', [])).toBe(false);
});

test('canonical compiler stages refuse to proceed before HEPHAESTUS evidence is ready', () => {
  const checkpoint = { stages: {} };
  markCanonicalStage(checkpoint, 'source', 'source', []);
  markCanonicalStage(checkpoint, 'ai-provider', 'ai-provider', []);
  markCanonicalStage(checkpoint, 'extraction', 'extraction', []);
  expect(() => assertCanonicalStagePrerequisites(checkpoint, 'rulebook-knowledge'))
    .toThrow(/requires hephaestus/);
  markCanonicalStage(checkpoint, 'hephaestus', 'hephaestus', []);
  expect(assertCanonicalStagePrerequisites(checkpoint, 'rulebook-knowledge')).toBe(true);
});

test('PDF extraction cannot start before the AI provider readiness stage', () => {
  const checkpoint = { stages: {} };
  markCanonicalStage(checkpoint, 'source', 'source', []);
  expect(() => assertCanonicalStagePrerequisites(checkpoint, 'extraction')).toThrow(/requires ai-provider/);
  markCanonicalStage(checkpoint, 'ai-provider', 'ai-provider', []);
  expect(assertCanonicalStagePrerequisites(checkpoint, 'extraction')).toBe(true);
});

test('canonical order enforces knowledge and coverage before physical state', () => {
  const checkpoint = { stages: {} };
  for (const name of ['source', 'ai-provider', 'extraction', 'hephaestus']) markCanonicalStage(checkpoint, name, name, []);
  expect(() => assertCanonicalStagePrerequisites(checkpoint, 'physical-state')).toThrow(/rulebook-knowledge, coverage/);
  markCanonicalStage(checkpoint, 'rulebook-knowledge', 'knowledge', []);
  markCanonicalStage(checkpoint, 'coverage', 'coverage', []);
  expect(assertCanonicalStagePrerequisites(checkpoint, 'physical-state')).toBe(true);
});

test('a canonical stage cannot be marked ready when its required output is absent', () => {
  const checkpoint = { stages: {} };
  expect(() => markCanonicalStage(checkpoint, 'hephaestus', 'hash', ['Z:/missing/manifest.json']))
    .toThrow(/PRODUCTION_STAGE_OUTPUT_MISSING/);
  expect(checkpoint.stages.hephaestus).toBeUndefined();
});
