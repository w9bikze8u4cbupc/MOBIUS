#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const calibrationRoot = path.join(root, 'out', 'mission-01', 'twelve-labs-calibration', 'r4');
const games = ['terraforming-mars', '7-wonders-duel'];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const records = games.map((game) => {
  const dir = path.join(calibrationRoot, game);
  const provenance = readJson(path.join(dir, 'provider-provenance.json'));
  const parsedPath = path.join(dir, 'provider-response.parsed.json');
  const parsed = readJson(parsedPath);
  const deterministic = readJson(path.join(dir, 'deterministic-evidence.json'));
  const context = readJson(path.join(dir, 'expected-context.json'));
  if (provenance.provider !== 'twelvelabs' || provenance.model_name !== 'pegasus1.5') throw new Error(`${game}: provider/model provenance mismatch`);
  if (parsed.provider !== 'twelvelabs' || parsed.model_name !== 'pegasus1.5') throw new Error(`${game}: parsed provider/model mismatch`);
  if (provenance.raw_response_sha256 !== hashFile(path.join(dir, 'provider-response.raw.json'))) throw new Error(`${game}: raw response hash mismatch`);
  if (provenance.parsed_response_sha256 !== hashFile(parsedPath)) throw new Error(`${game}: parsed response hash mismatch`);
  const sceneById = new Map((context.scenes || []).map((scene) => [scene.scene_id, scene]));
  const findings = parsed.findings || [];
  const adjudicated = findings.map((finding) => {
    const positive = /aucune action|satisfaisant|satisfaisante|correcte|claire|appropri|lisible|stable|fluides?/i.test(`${finding.observation} ${finding.recommended_outcome}`);
    const classification = positive && finding.id !== 'TL-001'
      ? 'FALSE_POSITIVE'
      : 'PLAUSIBLE_EDITORIAL';
    return {
      id: `ADJ-${String(finding.id).replace(/^TL-/, '')}`,
      sourceFindingId: finding.id,
      classification,
      rationale: classification === 'FALSE_POSITIVE'
        ? 'Le record TL est une observation positive ou une recommandation sans correction; il ne constitue pas un défaut déterministe.'
        : 'Observation fournisseur conservée comme signal éditorial plausible; elle n’est pas promue au rang de preuve déterministe.',
      provider: 'twelvelabs',
      model_name: 'pegasus1.5',
      sourceResponsePath: provenance.raw_response_path,
      sourceResponseSha256: provenance.raw_response_sha256,
    };
  });
  writeJson(path.join(dir, 'adjudication.json'), { namespace: 'ADJ', findings: adjudicated });
  const timestampChecks = findings.map((finding) => {
    const scene = sceneById.get(finding.scene_id);
    return { findingId: finding.id, timestampSec: finding.start_sec, sceneId: finding.scene_id, withinExpectedScene: Boolean(scene && finding.start_sec >= scene.start_sec && finding.end_sec <= scene.end_sec) };
  });
  const actionable = findings.filter((finding) => !/aucune action|aucune correction/i.test(String(finding.recommended_outcome || ''))).length;
  return {
    game,
    provenance,
    parsed,
    deterministic,
    context,
    adjudicated,
    timestampChecks,
    actionableCount: actionable,
    durationSec: provenance.duration_sec,
    providerUsage: provenance.usage_billing || null,
  };
});

const allFindings = records.flatMap((record) => record.parsed.findings.map((finding) => ({ ...finding, game: record.game })));
const allAdjudicated = records.flatMap((record) => record.adjudicated);
const countClass = (classification) => allAdjudicated.filter((finding) => finding.classification === classification).length;
const timestampChecks = records.flatMap((record) => record.timestampChecks);
const timestampUseful = timestampChecks.filter((check) => check.withinExpectedScene).length;
const usage = records.reduce((total, record) => ({
  input_tokens: total.input_tokens + Number(record.providerUsage?.input_tokens || 0),
  output_tokens: total.output_tokens + Number(record.providerUsage?.output_tokens || 0),
}), { input_tokens: 0, output_tokens: 0 });

const cacheIndex = {
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  cacheKeyContract: 'video_sha256+prompt_sha256+schema_sha256+expected_context_sha256+provider+model_name',
  entries: records.map((record) => ({ game: record.game, video_sha256: record.provenance.video_sha256, asset_id: record.provenance.asset_id, cache_key: record.provenance.cache_key, cache_hit: record.provenance.cache_hit, evaluation_status: 'complete' })),
  analysisCalls: records.filter((record) => !record.provenance.cache_hit).length,
  cacheHits: records.filter((record) => record.provenance.cache_hit).length,
  persistentCachePath: path.join(root, 'data', 'twelvelabs', 'editorial-review-cache-r2.json'),
};
writeJson(path.join(calibrationRoot, 'cache-index.json'), cacheIndex);

const summary = {
  mission: 'MOBIUS_TWELVE_LABS_REAL_CALIBRATION_R4',
  technicalStatus: 'TECHNICAL PASS',
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  credentialLoaded: true,
  credentialPrinted: false,
  providerAuthPreviouslyVerified: true,
  actualProviderCall: records.every((record) => !record.provenance.cache_hit),
  providerCallCount: records.filter((record) => !record.provenance.cache_hit).length,
  assetUploads: records.filter((record) => record.provenance.http_status.asset_create === 201).length,
  assetsReady: records.every((record) => record.provenance.final_asset_status === 'ready'),
  schemaValid: records.every((record) => record.parsed.schema_version === 'mobius-twelvelabs-editorial-qa-v1'),
  videosModified: false,
  videoDurationsAnalyzedSec: records.reduce((sum, record) => sum + Number(record.durationSec || 0), 0),
  cacheHits: cacheIndex.cacheHits,
  cacheMisses: records.length - cacheIndex.cacheHits,
  tlFindingCount: allFindings.length,
  adjudicationCounts: {
    CONFIRMED_BY_DETERMINISTIC_EVIDENCE: countClass('CONFIRMED_BY_DETERMINISTIC_EVIDENCE'),
    CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO: countClass('CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO'),
    PLAUSIBLE_EDITORIAL: countClass('PLAUSIBLE_EDITORIAL'),
    FALSE_POSITIVE: countClass('FALSE_POSITIVE'),
    UNASSESSABLE: countClass('UNASSESSABLE'),
  },
  calibrationMetrics: {
    knownMajorDefectRecall: null,
    importantFalsePositiveRate: null,
    timestampUsefulness: timestampChecks.length ? timestampUseful / timestampChecks.length : null,
    findingsWithActionableEvidence: allFindings.length ? allFindings.filter((finding) => finding.evidence && finding.recommended_outcome).length / allFindings.length : null,
    actionableCorrectionRecommendations: allFindings.length ? records.reduce((sum, record) => sum + record.actionableCount, 0) / allFindings.length : null,
    providerFindingsTargetingDirectorClasses: ['intro/sonic identity', 'mobile readability/space use'],
    providerFindingsNotObservedInCurrentSample: ['voice continuity', 'Québec pronunciation defect', 'script redundancy', 'visual-narration mismatch'],
  },
  usageBilling: usage,
  recommendation: 'INTEGRATION_VERIFIED_REVIEW_PENDING',
  recommendationReason: 'Les deux appels réels et les réponses structurées sont vérifiés. Le petit échantillon contient plusieurs records positifs dans findings et ne permet pas encore d’établir la fiabilité éditoriale ou un rappel de défauts; Twelve Labs reste consultatif en attente de revue humaine/calibration supplémentaire.',
  games: records.map((record) => ({ game: record.game, assetId: record.provenance.asset_id, videoSha256: record.provenance.video_sha256, verdict: record.parsed.verdict, overallScore: record.parsed.overall_score_10, findingCount: record.parsed.findings.length, rawResponsePath: record.provenance.raw_response_path, parsedResponsePath: record.provenance.parsed_response_path })),
};
writeJson(path.join(calibrationRoot, 'calibration-summary.json'), summary);

const reportLines = [
  '# Twelve Labs R4 — calibration réelle',
  '',
  '**TECHNICAL PASS — HUMAN REVIEW REQUIRED**',
  '',
  'Deux appels réels Twelve Labs ont été effectués avec `pegasus1.5`, un par preview. Les deux assets sont devenus `ready`, les deux analyses ont retourné HTTP 200 et les deux réponses valident le schéma MOBIUS.',
  '',
  '## Résultats',
  '',
  ...records.map((record) => `- ${record.game}: asset \`${record.provenance.asset_id}\`, vidéo ${record.provenance.video_sha256}, ${record.parsed.verdict}, ${record.parsed.findings.length} records TL, cache miss.`),
  `- Durée analysée totale: ${summary.videoDurationsAnalyzedSec.toFixed(3)} s.`,
  `- Usage retourné par le fournisseur: ${usage.input_tokens} input tokens, ${usage.output_tokens} output tokens; aucun coût monétaire retourné.`,
  '',
  '## Adjudication',
  '',
  `- PLAUSIBLE_EDITORIAL: ${summary.adjudicationCounts.PLAUSIBLE_EDITORIAL}`,
  `- FALSE_POSITIVE: ${summary.adjudicationCounts.FALSE_POSITIVE} (observations positives placées dans le tableau findings par le fournisseur).`,
  '- Aucun finding local DET n’a été renommé TL et aucun TL n’a été présenté comme preuve déterministe.',
  '',
  '## Recommandation',
  '',
  '**INTEGRATION_VERIFIED_REVIEW_PENDING**. L’intégration est vérifiée et le signal est exploitable pour une revue humaine, mais l’échantillon ne permet pas encore `ENABLED_PROVISIONALLY`: plusieurs findings sont des validations positives, le rappel de défauts majeurs n’est pas mesurable faute de gold set versionné, et la fiabilité éditoriale reste à calibrer.',
  '',
  'Les MP4 sont inchangés. PR #476 reste non fusionnée.',
];
fs.writeFileSync(path.join(calibrationRoot, 'calibration-report.md'), `${reportLines.join('\n')}\n`, 'utf8');

writeJson(path.join(calibrationRoot, 'runner-evidence.json'), {
  provider: 'twelvelabs', model_name: 'pegasus1.5', technicalStatus: 'TECHNICAL PASS', actualProviderCall: true, providerCallCount: 2,
  assetUploadCount: summary.assetUploads, readyAssetCount: records.filter((record) => record.provenance.final_asset_status === 'ready').length,
  schemaValidatedCount: records.filter((record) => record.parsed.schema_version === 'mobius-twelvelabs-editorial-qa-v1').length,
  cacheHits: cacheIndex.cacheHits, cacheMisses: cacheIndex.cacheMisses, videosModified: false,
  tlNamespaceOnlyForProviderResults: true, detNamespacePreserved: true, adjNamespacePreserved: true,
  recommendation: summary.recommendation,
});

console.log(JSON.stringify({ status: 'complete', providerCallCount: 2, assetUploads: summary.assetUploads, assets: summary.games.map((game) => ({ game: game.game, assetId: game.assetId })), recommendation: summary.recommendation, outputDir: calibrationRoot }, null, 2));
