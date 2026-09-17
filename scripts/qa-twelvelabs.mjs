#!/usr/bin/env node

import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import {
  TWELVELABS_DEFAULT_BASE_URL,
  TWELVELABS_MODEL,
  getTwelveLabsConfig,
  safeTwelveLabsConfig,
  runTwelveLabsEditorialAnalysis,
} from '../src/services/twelveLabsVideoReview.js';

const root = resolve(process.cwd());
const EXPECTED_ROOT = 'C:\\mobius-games-tutorial-generator-quality-fix';
if (root !== EXPECTED_ROOT) throw new Error(`Twelve Labs runner must execute from ${EXPECTED_ROOT}.`);

const envPath = resolve(root, '.env');
if (!existsSync(envPath)) throw new Error(`Missing ${envPath}.`);
dotenv.config({ path: envPath, override: false });

function argsToObject(argv = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    values[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return values;
}

const args = argsToObject();
const requireArg = (name) => {
  const value = args[name];
  if (!value || value === true) throw new Error(`Missing --${name}.`);
  return resolve(String(value));
};
const videoPath = requireArg('video');
const contextPath = requireArg('context');
const outputDir = requireArg('out');
const promptPath = resolve(String(args.prompt || 'config/qa/mobius-twelvelabs-editorial-qa-v1.prompt.md'));
const schemaPath = resolve(String(args.schema || 'config/qa/mobius-twelvelabs-editorial-qa-v1.schema.json'));
const cachePath = resolve(String(args.cache || 'data/twelvelabs/editorial-review-cache-r2.json'));
const provider = 'twelvelabs';
const modelName = TWELVELABS_MODEL;
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sha256File(filePath) { return sha256Bytes(readFileSync(filePath)); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
function stableHash(value) { return sha256Bytes(Buffer.from(stable(value))); }
function writeJson(filePath, value) { mkdirSync(dirname(filePath), { recursive: true }); writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function writeRaw(filePath, bodyText) { mkdirSync(dirname(filePath), { recursive: true }); writeFileSync(filePath, String(bodyText ?? ''), 'utf8'); }
function ignoredEnv() {
  try { execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; }
}
function probeVideo(filePath) {
  const media = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels', '-of', 'json', filePath], { encoding: 'utf8' }));
  const video = (media.streams || []).find((stream) => stream.codec_type === 'video');
  const audio = (media.streams || []).find((stream) => stream.codec_type === 'audio');
  return { durationSec: Number(media.format?.duration || 0), resolution: video ? `${video.width}x${video.height}` : null, video, audio };
}
function parseLoudness(filePath, startSec, endSec) {
  const duration = Math.max(0.1, endSec - startSec);
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'info', '-ss', String(startSec), '-t', String(duration), '-i', filePath, '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true });
  const text = result.stderr || '';
  const loudnessMatches = [...text.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)];
  const peakMatches = [...text.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)];
  const integrated = loudnessMatches.at(-1)?.[1];
  const truePeak = peakMatches.at(-1)?.[1];
  return { integratedLufs: integrated === undefined ? null : Number(integrated), truePeakDbfs: truePeak === undefined ? null : Number(truePeak), measurementStatus: integrated !== undefined && truePeak !== undefined ? 'measured' : 'unavailable' };
}
function deterministicEvidence(context) {
  const sceneAudio = (context.scenes || []).map((scene) => ({ sceneId: scene.scene_id, startSec: scene.start_sec, endSec: scene.end_sec, ...parseLoudness(videoPath, scene.start_sec, scene.end_sec) }));
  const narrationScenes = (context.scenes || []).filter((scene) => scene.exact_narration_text && scene.exact_narration_text !== 'NONE');
  const textSimilarity = narrationScenes.slice(1).map((scene, index) => {
    const previous = narrationScenes[index];
    const a = new Set(String(previous.exact_narration_text).toLowerCase().split(/\W+/).filter((word) => word.length > 3));
    const b = new Set(String(scene.exact_narration_text).toLowerCase().split(/\W+/).filter((word) => word.length > 3));
    const intersection = [...a].filter((word) => b.has(word)).length;
    const union = new Set([...a, ...b]).size;
    return { id: `DET-${index + 10}`, fromScene: previous.scene_id, toScene: scene.scene_id, jaccardSimilarity: union ? Number((intersection / union).toFixed(3)) : 0 };
  });
  return {
    namespace: 'DET', provider: 'local-deterministic', videoPath, videoSha256: sha256File(videoPath),
    media: probeVideo(videoPath), sceneAudio, textSimilarity,
    findings: [
      { id: 'DET-001', category: 'media_integrity', observation: `Résolution ${context.video.resolution}; durée ${context.video.duration_sec} secondes selon le contexte attendu.` },
      { id: 'DET-002', category: 'audio_windows', observation: 'Mesures LUFS intégrées et true peak calculées indépendamment par fenêtres de scène FFmpeg.' },
      { id: 'DET-003', category: 'narration_similarity', observation: 'Similarité lexicale entre scènes adjacentes calculée sans la présenter comme un jugement du fournisseur.' },
    ],
  };
}
function validateContext(context, videoSha256, media) {
  if (!context?.video || !Array.isArray(context.scenes) || !context.identity || !context.intentional_intro_silence) throw new Error('Expected context is missing required sections.');
  if (context.video.sha256 !== videoSha256) throw new Error('Expected context video SHA-256 does not match the immutable input.');
  if (context.video.resolution !== media.resolution) throw new Error('Expected context resolution does not match the video.');
  if (!context.scenes.every((scene) => scene.scene_id && Number.isFinite(scene.start_sec) && Number.isFinite(scene.end_sec) && scene.end_sec >= scene.start_sec)) throw new Error('Expected context contains invalid scene bounds.');
}
function redactRequest(body, baseUrl) {
  return { endpoint: `${baseUrl}/analyze`, method: 'POST', headers: { 'x-api-key': '[REDACTED]', 'content-type': 'application/json' }, body };
}
function envelopeInfo(envelope) {
  if (!envelope) return null;
  return { status: envelope.status ?? null, statusText: envelope.statusText ?? null, headers: envelope.headers || {}, bodyText: envelope.bodyText ?? '' };
}

const safeConfig = { ...safeTwelveLabsConfig(process.env), variableName: process.env.TWELVELABS_API_KEY?.trim() ? 'TWELVELABS_API_KEY' : process.env.TWELVE_LABS_API_KEY?.trim() ? 'TWELVE_LABS_API_KEY' : null };
console.log(JSON.stringify({ cwd: root, envExists: true, gitIgnoresEnv: ignoredEnv(), configuration: safeConfig }));
if (!safeConfig.configured) throw new Error('Twelve Labs credential is not configured after explicit root .env loading.');
if (safeConfig.model !== modelName) throw new Error(`Twelve Labs model must be ${modelName}.`);
if (!existsSync(videoPath) || !existsSync(contextPath) || !existsSync(promptPath) || !existsSync(schemaPath)) throw new Error('Video, context, prompt or schema path does not exist.');

const context = JSON.parse(readFileSync(contextPath, 'utf8'));
const videoSha256 = sha256File(videoPath);
const media = probeVideo(videoPath);
validateContext(context, videoSha256, media);
const promptText = readFileSync(promptPath, 'utf8');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const promptSha256 = sha256File(promptPath);
const schemaSha256 = sha256File(schemaPath);
const expectedContextSha256 = sha256File(contextPath);
const cacheKey = stableHash({ video_sha256: videoSha256, prompt_sha256: promptSha256, schema_sha256: schemaSha256, expected_context_sha256: expectedContextSha256, provider, model_name: modelName });
const deterministic = deterministicEvidence(context);
const startedAt = Date.now();
const review = await runTwelveLabsEditorialAnalysis({ videoPath, promptText: `${promptText}\n\nEXPECTED CONTEXT (context only; verify the video independently):\n${JSON.stringify(context)}`, schema, cachePath, cacheKey, promptSha256, schemaSha256, expectedContextSha256, env: process.env, model: modelName });
const gameDir = outputDir;
mkdirSync(gameDir, { recursive: true });
writeJson(resolve(gameDir, 'video-provenance.json'), { provider, videoPath, videoSha256, durationSec: media.durationSec, resolution: media.resolution, codec: media.video?.codec_name || null });
writeJson(resolve(gameDir, 'expected-context.json'), context);
writeJson(resolve(gameDir, 'deterministic-evidence.json'), deterministic);

if (review.status !== 'complete') {
  // Prefer the latest/failed stage so a structured-output rejection preserves
  // the actual provider analysis body rather than masking it with upload JSON.
  const failedEnvelope = review.analysisResponse || review.assetFinalResponse || review.assetCreateResponse || null;
  const failedRawPath = resolve(gameDir, review.analysisResponse ? 'provider-response.raw.json' : review.assetFinalResponse ? 'asset-final-response.raw.json' : 'asset-create-response.raw.json');
  if (failedEnvelope) writeRaw(failedRawPath, failedEnvelope.bodyText || JSON.stringify(failedEnvelope.payload || {}));
  writeJson(resolve(gameDir, 'request.redacted.json'), { provider, endpoint: failedEnvelope ? 'request endpoint returned an error before analysis' : null, method: null, headers: { 'x-api-key': '[REDACTED]' }, body: null });
  writeJson(resolve(gameDir, 'provider-provenance.json'), { provider, baseUrl: safeConfig.baseUrl || TWELVELABS_DEFAULT_BASE_URL, model_name: modelName, status: 'failed', classification: review.classification || null, error: review.error || null, videoPath, videoSha256, asset_id: review.assetId || null, cacheKey, cacheHit: false, retryCount: 0, requestTimestamp: review.requestTimestamp || null, responseTimestamp: review.responseTimestamp || null, latencyMs: review.latencyMs || Date.now() - startedAt, httpStatus: failedEnvelope?.status || null, responseHeaders: failedEnvelope?.headers || {}, attemptedStage: review.analysisResponse ? 'analysis' : review.assetFinalResponse ? 'asset-final' : 'asset-create', rawResponsePath: failedEnvelope ? failedRawPath : null, rawResponseSha256: failedEnvelope ? sha256File(failedRawPath) : null });
  writeJson(resolve(outputDir, '..', 'runner-evidence.json'), { provider, model_name: modelName, providerRequestAttempted: Boolean(failedEnvelope), actualProviderCall: Boolean(review.analysisResponse), analysisCallCount: review.analysisResponse ? 1 : 0, status: 'BLOCK', authenticationResult: review.classification === 'auth_failed' ? 'failed_401_or_403' : null, error: review.error || review.classification || 'provider call failed', safeConfiguration: safeConfig });
  throw new Error(`Twelve Labs provider call failed: ${review.classification || review.error || 'unknown error'}`);
}

const rawAnalysisPath = resolve(gameDir, 'provider-response.raw.json');
const parsedAnalysisPath = resolve(gameDir, 'provider-response.parsed.json');
const createRawPath = resolve(gameDir, 'asset-create-response.raw.json');
const finalRawPath = resolve(gameDir, 'asset-final-response.raw.json');
const requestBody = review.requestBody || {};
writeJson(resolve(gameDir, 'request.redacted.json'), redactRequest({ ...requestBody, prompt_v2: { input_text: '[PRESENT IN VERSIONED PROMPT + EXPECTED CONTEXT; REDACTED FROM REQUEST ARTIFACT]' } }, safeConfig.baseUrl || TWELVELABS_DEFAULT_BASE_URL));
writeRaw(createRawPath, review.assetCreateResponse?.bodyText || JSON.stringify(review.assetCreateResponse?.payload || { cached: true, assetId: review.assetId }));
writeRaw(finalRawPath, review.assetFinalResponse?.bodyText || JSON.stringify(review.assetFinalResponse?.payload || { cached: true, assetId: review.assetId }));
writeRaw(rawAnalysisPath, review.analysisResponse?.bodyText || JSON.stringify({ data: review.analysisText }));
writeJson(parsedAnalysisPath, review.result);
const provenance = {
  provider, baseUrl: safeConfig.baseUrl || TWELVELABS_DEFAULT_BASE_URL, model_name: modelName, rest_api_version: 'v1.3', adapter_file: 'src/services/twelveLabsVideoReview.js',
  asset_id: review.assetId, asset_creation_status: review.assetCreateResponse?.payload?.status || null, final_asset_status: review.assetFinalResponse?.payload?.status || review.assetFinalResponse?.payload?.asset?.status || 'ready',
  provider_request_id: review.analysisResponse?.payload?.id || review.analysisResponse?.headers?.['request-id'] || review.analysisResponse?.headers?.['x-request-id'] || null,
  request_timestamp: review.requestTimestamp || null, response_timestamp: review.responseTimestamp || null,
  http_status: { asset_create: review.assetCreateResponse?.status || null, asset_final: review.assetFinalResponse?.status || null, analysis: review.analysisResponse?.status || null },
  rate_limit_headers: review.analysisResponse?.headers || {}, video_path: videoPath, video_sha256: videoSha256, duration_sec: media.durationSec, resolution: media.resolution,
  prompt_path: promptPath, prompt_sha256: promptSha256, schema_path: schemaPath, schema_sha256: schemaSha256, expected_context_path: contextPath, expected_context_sha256: expectedContextSha256,
  raw_response_path: rawAnalysisPath, raw_response_sha256: sha256File(rawAnalysisPath), parsed_response_path: parsedAnalysisPath, parsed_response_sha256: sha256File(parsedAnalysisPath),
  cache_key: cacheKey, cache_hit: Boolean(review.cached), retry_count: 0, latency_ms: review.latencyMs || Date.now() - startedAt, usage_billing: review.analysisResponse?.payload?.usage || null,
};
writeJson(resolve(gameDir, 'provider-provenance.json'), provenance);
const adjudication = (review.result.findings || []).map((finding) => ({ id: `ADJ-${String(finding.id).replace(/^TL-/, '')}`, sourceFindingId: finding.id, classification: 'PLAUSIBLE_EDITORIAL', rationale: 'Le constat provient du fournisseur; une confirmation physique/déterministe séparée reste requise pour cette calibration.', provider: 'twelvelabs', model_name: modelName, sourceResponsePath: rawAnalysisPath, sourceResponseSha256: provenance.raw_response_sha256 }));
writeJson(resolve(gameDir, 'adjudication.json'), { namespace: 'ADJ', findings: adjudication });

const cacheIndex = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { version: 1, assets: {}, evaluations: {} };
writeJson(resolve(outputDir, '..', 'cache-index.json'), { sourceCachePath: cachePath, version: cacheIndex.version, updatedAt: cacheIndex.updatedAt || null, videoSha256, cacheKey, assetId: review.assetId, cacheHit: Boolean(review.cached), evaluationStatus: review.status, provider, model_name: modelName });
writeJson(resolve(outputDir, '..', 'runner-evidence.json'), { provider, model_name: modelName, actualProviderCall: !review.cached, cacheHit: Boolean(review.cached), assetId: review.assetId, analysisCallCount: review.cached ? 0 : 1, schemaValidated: true, rawResponsePath: rawAnalysisPath, rawResponseSha256: provenance.raw_response_sha256, safeConfiguration: safeConfig, cacheKey });
console.log(JSON.stringify({ status: 'complete', provider, model_name: modelName, videoPath, assetId: review.assetId, cached: Boolean(review.cached), analysisCallCount: review.cached ? 0 : 1, outputDir: gameDir, findingCount: review.result.findings.length }, null, 2));
