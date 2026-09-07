import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TWELVELABS_RUBRIC_VERSION,
  analyzeProductionVideo,
  getTwelveLabsConfig,
  parseCanonicalEditorialReviewJson,
  runTwelveLabsEditorialAnalysis,
  parseStrictReviewJson,
  safeTwelveLabsConfig,
  validateReviewResult,
} from '../../src/services/twelveLabsVideoReview.js';

const categoryNames = [
  'brand_and_intro', 'audio_identity_and_continuity', 'narration_warmth_and_naturalness',
  'thematic_engagement', 'teaching_clarity', 'visual_relevance_and_variety', 'french_visual_coherence',
  'screen_space_utilization', 'layout_and_legibility', 'motion_and_transitions', 'pacing_and_retention',
  'outro_and_call_to_action', 'professional_finish',
];

function reviewFixture() {
  return {
    rubric_version: TWELVELABS_RUBRIC_VERSION,
    executive_summary: 'Good branded tutorial.',
    overall_score_10: 8.2,
    category_scores: Object.fromEntries(categoryNames.map((name) => [name, 8])),
    findings: [{
      timestamp: '00:08', end_timestamp: null, severity: 'P2', category: 'pacing',
      what_viewer_sees_or_hears: 'A short hold.', observable_evidence: 'The image holds at 00:08.',
      why_it_hurts_or_helps: 'Minor loss of momentum.', specific_fix: 'Trim the hold.', confidence: 'high',
    }],
    three_highest_impact_next_changes: ['Trim hold', 'Keep banner', 'Preserve ambience'],
    strengths_to_preserve: ['Clear banner'],
    moments_that_feel_most_human: [{ timestamp: '00:04', reason: 'Warm welcome.' }],
    moments_that_feel_most_ai_generated: [],
    release_verdict: 'publishable_with_minor_fixes',
  };
}

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: 'test', async text() { return JSON.stringify(value); } };
}

test('configuration is safe and never exposes the credential', () => {
  const config = getTwelveLabsConfig({ TWELVELABS_API_KEY: 'secret-value', TWELVELABS_MODEL: 'pegasus1.5' });
  assert.equal(config.configured, true);
  assert.deepEqual(safeTwelveLabsConfig({ TWELVELABS_API_KEY: 'secret-value' }), {
    configured: true, baseUrl: 'https://api.twelvelabs.io/v1.3', model: 'pegasus1.5', provider: 'twelvelabs',
  });
  assert.equal(JSON.stringify(safeTwelveLabsConfig({ TWELVELABS_API_KEY: 'secret-value' })).includes('secret-value'), false);
});

test('strict response parsing rejects prose and code fences and validates timestamps/scores', () => {
  const value = reviewFixture();
  assert.equal(validateReviewResult(value), true);
  assert.deepEqual(parseStrictReviewJson(JSON.stringify(value)).category_scores.brand_and_intro, 8);
  assert.throws(() => parseStrictReviewJson(`Here is the JSON:\n${JSON.stringify(value)}`), /strict JSON/);
  assert.throws(() => parseStrictReviewJson(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``), /strict JSON/);
  assert.throws(() => validateReviewResult({ ...value, findings: [{ ...value.findings[0], timestamp: 'soon' }] }), /timestamp/);
  assert.throws(() => validateReviewResult({ ...value, overall_score_10: 11 }), /score/);
});

test('analysis uploads once and cached video/rubric/model reuse avoids another upload or analysis', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-'));
  const videoPath = path.join(directory, 'sagrada.mp4');
  const cachePath = path.join(directory, 'cache.json');
  await fs.writeFile(videoPath, 'test-video-bytes');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.endsWith('/assets')) {
      assert.equal(init.body.get('method'), 'direct');
      assert.ok(init.body.get('file'));
      return response({ _id: 'asset-1' }, 201);
    }
    if (url.endsWith('/assets/asset-1')) return response({ status: 'ready' });
    if (url.endsWith('/analyze')) {
      const request = JSON.parse(init.body);
      assert.deepEqual(request.video, { type: 'asset_id', asset_id: 'asset-1' });
      const schemaText = JSON.stringify(request.response_format.json_schema);
      assert.equal(schemaText.includes('"minimum"'), false);
      assert.equal(schemaText.includes('"maximum"'), false);
      return response({ data: JSON.stringify(reviewFixture()) });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const first = await analyzeProductionVideo({ videoPath, cachePath, env: { TWELVELABS_API_KEY: 'secret' }, fetchImpl, pollMs: 0 });
  const second = await analyzeProductionVideo({ videoPath, cachePath, env: { TWELVELABS_API_KEY: 'secret' }, fetchImpl, pollMs: 0 });
  assert.equal(first.status, 'complete');
  assert.equal(first.cached, false);
  assert.equal(second.status, 'complete');
  assert.equal(second.cached, true);
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((call) => call.url.endsWith('/assets')).length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith('/analyze')).length, 1);
});

test('unconfigured access is advisory unavailable and does not make a network request', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-'));
  const videoPath = path.join(directory, 'sagrada.mp4');
  await fs.writeFile(videoPath, 'test-video-bytes');
  let called = false;
  const result = await analyzeProductionVideo({ videoPath, env: {}, fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.classification, 'not_configured');
  assert.equal(called, false);
});

function canonicalReviewFixture() {
  return {
    schema_version: 'mobius-twelvelabs-editorial-qa-v1', provider: 'twelvelabs', model_name: 'pegasus1.5', verdict: 'PASS_WITH_WARNINGS', overall_score_10: 8,
    category_scores: Object.fromEntries(['intro_and_sonic_identity', 'voice_consistency', 'fr_ca_pronunciation', 'script_progression', 'text_containment_and_legibility', 'space_optimization', 'visual_narration_correspondence', 'section_transitions', 'brand_consistency'].map((name) => [name, 8])),
    findings: [{ id: 'TL-001', severity: 'P2', category: 'pacing', start_sec: 4, end_sec: 5, scene_id: 'metadata-card', observation: 'Une pause courte.', evidence: 'Pause audible.', expected_behavior: 'Transition fluide.', recommended_outcome: 'Raccourcir la pause.', confidence: 0.8, requires_human_judgment: false }],
    pronunciation_checks: [], scene_boundary_checks: [], strengths_to_preserve: ['Bannière claire'], human_review_required: true, human_review_reason: 'Avis consultatif seulement.',
  };
}

test('canonical R2 parser enforces provider, model and TL finding provenance shape', () => {
  const parsed = parseCanonicalEditorialReviewJson(JSON.stringify(canonicalReviewFixture()));
  assert.equal(parsed.provider, 'twelvelabs');
  assert.throws(() => parseCanonicalEditorialReviewJson(JSON.stringify({ ...canonicalReviewFixture(), model_name: 'pegasus1.2' })), /unexpected model/);
});

test('canonical v1.1 keeps positive checks out of findings and requires an actionable defect outcome', () => {
  const positive = {
    ...canonicalReviewFixture(),
    schema_version: 'mobius-twelvelabs-editorial-qa-v1.1',
    findings: [],
    pronunciation_checks: [{ term: 'Seven Wonders Duel', timestamp_sec: 7, heard_as: 'Seven Wonders duèl', natural_in_fr_ca: true, awkward_internal_pause: false, recognizable: true, confidence: 0.9 }],
    scene_boundary_checks: [{ from_scene: 'metadata-card', to_scene: 'scene-section-01-1', timestamp_sec: 21, voice_level_change: 'NONE', voice_character_change: 'NONE', transition_quality: 'PASS', evidence: 'La continuité vocale est stable.' }],
    strengths_to_preserve: ['La signature visuelle est cohérente.'],
  };
  assert.equal(parseCanonicalEditorialReviewJson(JSON.stringify(positive)).findings.length, 0);
  const defect = { ...positive, findings: [{ ...canonicalReviewFixture().findings[0], action: 'CORRECT' }] };
  assert.equal(parseCanonicalEditorialReviewJson(JSON.stringify(defect)).findings[0].action, 'CORRECT');
  assert.throws(() => parseCanonicalEditorialReviewJson(JSON.stringify({ ...defect, findings: [{ ...defect.findings[0], action: 'PASS' }] })), /invalid action/);
  assert.throws(() => parseCanonicalEditorialReviewJson(JSON.stringify({ ...defect, findings: [{ ...defect.findings[0], action: undefined }] })), /invalid action/);
});

test('canonical v1.1 response is also validated against the requested strict schema', async () => {
  const schema = JSON.parse(await fs.readFile(path.resolve('config/qa/mobius-twelvelabs-editorial-qa-v1.1.schema.json'), 'utf8'));
  const value = { ...canonicalReviewFixture(), schema_version: 'mobius-twelvelabs-editorial-qa-v1.1', findings: [] };
  assert.equal(parseCanonicalEditorialReviewJson(JSON.stringify(value), schema).schema_version, 'mobius-twelvelabs-editorial-qa-v1.1');
  assert.throws(() => parseCanonicalEditorialReviewJson(JSON.stringify({ ...value, unexpected: true }), schema), /JSON schema/);
  assert.throws(() => parseCanonicalEditorialReviewJson(JSON.stringify({ ...value, human_review_required: 'yes' }), schema), /JSON schema/);
});

test('canonical analysis text is recovered from nested provider payloads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-nested-'));
  const videoPath = path.join(directory, 'preview.mp4');
  await fs.writeFile(videoPath, 'nested-test-video');
  const fetchImpl = async (url) => {
    if (url.endsWith('/assets')) return response({ _id: 'asset-nested' }, 201);
    if (url.endsWith('/assets/asset-nested')) return response({ status: 'ready' });
    if (url.endsWith('/analyze')) return response({ data: { result: { data: JSON.stringify(canonicalReviewFixture()) } } });
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await runTwelveLabsEditorialAnalysis({ videoPath, promptText: 'Review.', schema: {}, cachePath: path.join(directory, 'cache.json'), cacheKey: 'nested-key', promptSha256: 'p', schemaSha256: 's', expectedContextSha256: 'c', env: { TWELVELABS_API_KEY: 'secret' }, fetchImpl, pollMs: 0 });
  assert.equal(result.status, 'complete');
  assert.equal(result.result.provider, 'twelvelabs');
});

test('canonical analysis text is recovered from structured response fragments', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-fragments-'));
  const videoPath = path.join(directory, 'preview.mp4');
  await fs.writeFile(videoPath, 'fragment-test-video');
  const canonical = JSON.stringify(canonicalReviewFixture());
  const splitAt = Math.floor(canonical.length / 2);
  const result = await runTwelveLabsEditorialAnalysis({
    videoPath,
    promptText: 'Review.',
    schema: {},
    cachePath: path.join(directory, 'cache.json'),
    cacheKey: 'fragment-key',
    promptSha256: 'p',
    schemaSha256: 's',
    expectedContextSha256: 'c',
    env: { TWELVELABS_API_KEY: 'secret' },
    fetchImpl: async (url) => {
      if (url.endsWith('/assets')) return response({ _id: 'asset-fragments' }, 201);
      if (url.endsWith('/assets/asset-fragments')) return response({ status: 'ready' });
      if (url.endsWith('/analyze')) return response({ data: [{ text: canonical.slice(0, splitAt) }, { text: canonical.slice(splitAt) }] });
      throw new Error(`unexpected URL ${url}`);
    },
    pollMs: 0,
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.result.provider, 'twelvelabs');
});

test('redacted provider envelope fixture parses while an asset response cannot masquerade as analysis', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-fixtures-'));
  const videoPath = path.join(directory, 'preview.mp4');
  await fs.writeFile(videoPath, 'fixture-test-video');
  const analysisFixture = JSON.parse(await fs.readFile(path.resolve('tests/fixtures/twelvelabs/provider-analysis-envelope-data.redacted.json'), 'utf8'));
  const assetFixture = JSON.parse(await fs.readFile(path.resolve('tests/fixtures/twelvelabs/provider-asset-response.redacted.json'), 'utf8'));
  const call = async (analysisPayload) => runTwelveLabsEditorialAnalysis({
    videoPath,
    promptText: 'Review.',
    schema: {},
    cachePath: path.join(directory, `${analysisPayload === assetFixture ? 'asset' : 'analysis'}.cache.json`),
    cacheKey: `fixture-${analysisPayload === assetFixture ? 'asset' : 'analysis'}`,
    promptSha256: 'p',
    schemaSha256: 's',
    expectedContextSha256: 'c',
    env: { TWELVELABS_API_KEY: 'secret' },
    fetchImpl: async (url) => {
      if (url.endsWith('/assets')) return response({ _id: 'asset-fixture' }, 201);
      if (url.endsWith('/assets/asset-fixture')) return response({ status: 'ready' });
      if (url.endsWith('/analyze')) return response(analysisPayload);
      throw new Error(`unexpected URL ${url}`);
    },
    pollMs: 0,
  });
  const parsed = await call(analysisFixture);
  assert.equal(parsed.status, 'complete');
  const rejected = await call(assetFixture);
  assert.equal(rejected.status, 'unavailable');
  assert.equal(rejected.classification, 'invalid_structured_output');
  assert.equal(rejected.analysisResponse.payload._id, 'asset-id-redacted');
});

test('structured-output rejection preserves the successful analysis envelope separately from asset responses', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-analysis-rejection-'));
  const videoPath = path.join(directory, 'preview.mp4');
  await fs.writeFile(videoPath, 'analysis-rejection-video');
  const result = await runTwelveLabsEditorialAnalysis({
    videoPath,
    promptText: 'Review.',
    schema: {},
    cachePath: path.join(directory, 'cache.json'),
    cacheKey: 'analysis-rejection-key',
    promptSha256: 'p',
    schemaSha256: 's',
    expectedContextSha256: 'c',
    env: { TWELVELABS_API_KEY: 'secret' },
    fetchImpl: async (url) => {
      if (url.endsWith('/assets')) return response({ _id: 'asset-rejection' }, 201);
      if (url.endsWith('/assets/asset-rejection')) return response({ status: 'ready' });
      if (url.endsWith('/analyze')) return response({ id: 'analysis-rejection', data: 'not-json-review' }, 201);
      throw new Error(`unexpected URL ${url}`);
    },
    pollMs: 0,
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.classification, 'invalid_structured_output');
  assert.equal(result.assetCreateResponse.status, 201);
  assert.equal(result.assetFinalResponse.status, 200);
  assert.equal(result.analysisResponse.status, 201);
  assert.match(result.analysisResponse.bodyText, /analysis-rejection/);
  assert.equal(result.analysisResponse.payload.id, 'analysis-rejection');
});

test('R2 analysis sends synchronous Pegasus 1.5 prompt_v2 and preserves cache reuse', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-r2-'));
  const videoPath = path.join(directory, 'preview.mp4');
  const cachePath = path.join(directory, 'cache.json');
  await fs.writeFile(videoPath, 'r2-test-video');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    if (url.endsWith('/assets')) return response({ _id: 'asset-r2' }, 201);
    if (url.endsWith('/assets/asset-r2')) return response({ status: 'ready' });
    if (url.endsWith('/analyze')) {
      const body = JSON.parse(init.body);
      assert.equal(body.model_name, 'pegasus1.5');
      assert.equal(body.analysis_mode, 'general');
      assert.deepEqual(body.video, { type: 'asset_id', asset_id: 'asset-r2' });
      assert.equal(typeof body.prompt_v2.input_text, 'string');
      assert.equal(body.stream, false);
      return response({ id: 'analysis-r2', data: JSON.stringify(canonicalReviewFixture()), usage: { input_tokens: 10, output_tokens: 20 } });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const first = await runTwelveLabsEditorialAnalysis({ videoPath, promptText: 'Review.', schema: {}, cachePath, cacheKey: 'r2-key', promptSha256: 'p', schemaSha256: 's', expectedContextSha256: 'c', env: { TWELVELABS_API_KEY: 'secret' }, fetchImpl, pollMs: 0 });
  const second = await runTwelveLabsEditorialAnalysis({ videoPath, promptText: 'Review.', schema: {}, cachePath, cacheKey: 'r2-key', promptSha256: 'p', schemaSha256: 's', expectedContextSha256: 'c', env: { TWELVELABS_API_KEY: 'secret' }, fetchImpl, pollMs: 0 });
  assert.equal(first.status, 'complete');
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls.filter((call) => call.url.endsWith('/analyze')).length, 1);
});

test('R2 preserves a real authentication error envelope without exposing the key', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-twelvelabs-auth-'));
  const videoPath = path.join(directory, 'preview.mp4');
  await fs.writeFile(videoPath, 'auth-test-video');
  const result = await runTwelveLabsEditorialAnalysis({
    videoPath, promptText: 'Review.', schema: {}, cachePath: path.join(directory, 'cache.json'), cacheKey: 'auth-key',
    env: { TWELVELABS_API_KEY: 'secret-value' },
    fetchImpl: async () => ({ ok: false, status: 401, statusText: 'Unauthorized', headers: { forEach(callback) { callback('0', 'x-ratelimit-remaining'); } }, async text() { return JSON.stringify({ message: 'API key invalid or expired.' }); } }),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.classification, 'auth_failed');
  assert.equal(result.assetCreateResponse.status, 401);
  assert.match(result.assetCreateResponse.bodyText, /invalid or expired/);
  assert.equal(JSON.stringify(result).includes('secret-value'), false);
});
