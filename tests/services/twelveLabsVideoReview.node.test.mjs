import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TWELVELABS_RUBRIC_VERSION,
  analyzeProductionVideo,
  getTwelveLabsConfig,
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
    if (url.endsWith('/assets')) return response({ id: 'asset-1' });
    if (url.endsWith('/assets/asset-1')) return response({ status: 'ready' });
    if (url.endsWith('/analyze')) return response({ data: JSON.stringify(reviewFixture()) });
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
