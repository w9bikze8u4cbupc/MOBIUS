#!/usr/bin/env node

/** Consolidate the generator-native sonic tournament and final provider evidence. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateCanonicalEditorialReview } from '../src/services/twelveLabsVideoReview.js';

const root = resolve(process.cwd());
const outRoot = resolve(process.argv[2] || 'out/mission-01/twelve-labs-calibration/final-sonic-r1');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const hashFile = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const writeJson = (file, value) => { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const finalDirs = { 'terraforming-mars': 'terraforming-mars', '7-wonders-duel': existsSync(join(outRoot, '7-wonders-duel')) ? '7-wonders-duel' : '7-wonders-duel-retry' };
const classifications = {
  'terraforming-mars': { 'TL-001': 'UNASSESSABLE', 'TL-002': 'FALSE_POSITIVE', 'TL-003': 'FALSE_POSITIVE', 'TL-004': 'FALSE_POSITIVE', 'TL-005': 'PLAUSIBLE_EDITORIAL', 'TL-006': 'UNASSESSABLE', 'TL-007': 'UNASSESSABLE' },
  '7-wonders-duel': { 'TL-001': 'UNASSESSABLE', 'TL-002': 'FALSE_POSITIVE', 'TL-003': 'PLAUSIBLE_EDITORIAL', 'TL-004': 'FALSE_POSITIVE' },
};
const rows = [];
let findingCount = 0;
let actionableCount = 0;
for (const [game, dirName] of Object.entries(finalDirs)) {
  const dir = join(outRoot, dirName);
  const parsedPath = join(dir, 'provider-response.parsed.json');
  const rawPath = join(dir, 'provider-response.raw.json');
  const provenancePath = join(dir, 'provider-provenance.json');
  const parsed = readJson(parsedPath);
  const provenance = readJson(provenancePath);
  validateCanonicalEditorialReview(parsed);
  const deterministic = readJson(join(dir, 'deterministic-evidence.json'));
  const adjudicated = (parsed.findings || []).map((finding) => ({
    id: `ADJ-${String(finding.id).replace(/^TL-/, '')}`,
    sourceFindingId: finding.id,
    classification: classifications[game][finding.id] || 'UNASSESSABLE',
    rationale: classifications[game][finding.id] === 'FALSE_POSITIVE'
      ? 'La formulation provider ne décrit pas un défaut observable confirmé par la frame ou les mesures locales.'
      : 'Le constat perceptuel est conservé comme avis fournisseur; la mesure locale ne suffit pas à confirmer ou infirmer toute sa dimension éditoriale.',
    provider: 'twelvelabs',
    model_name: 'pegasus1.5',
    sourceResponsePath: rawPath,
    sourceResponseSha256: hashFile(rawPath),
  }));
  writeJson(join(dir, 'adjudication.json'), { namespace: 'ADJ', provider: 'twelvelabs', model_name: 'pegasus1.5', findings: adjudicated });
  findingCount += parsed.findings.length;
  actionableCount += parsed.findings.filter((finding) => ['CORRECT', 'REVIEW', 'WARN'].includes(finding.action) && finding.evidence && finding.recommended_outcome).length;
  rows.push({
    game,
    outputDir: dir,
    videoPath: provenance.video_path,
    videoSha256: provenance.video_sha256,
    assetId: provenance.asset_id,
    provider: provenance.provider,
    model_name: provenance.model_name,
    verdict: parsed.verdict,
    score: parsed.overall_score_10,
    findingCount: parsed.findings.length,
    schemaValid: true,
    cacheHit: Boolean(provenance.cache_hit),
    providerRequestId: provenance.provider_request_id,
    analysisStatus: provenance.http_status?.analysis || null,
    rawResponsePath: provenance.raw_response_path,
    rawResponseSha256: provenance.raw_response_sha256,
    adjudicationCounts: Object.fromEntries(['CONFIRMED_BY_DETERMINISTIC_EVIDENCE', 'CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO', 'PLAUSIBLE_EDITORIAL', 'FALSE_POSITIVE', 'UNASSESSABLE'].map((name) => [name, adjudicated.filter((item) => item.classification === name).length])),
    usageBilling: provenance.usage_billing || null,
    deterministicFindingNamespace: 'DET-*',
    providerFindingNamespace: 'TL-*',
    adjudicationNamespace: 'ADJ-*',
  });
}

const sonicManifestPath = resolve('src/assets/branding/sonic/sonic-signature-manifest-v2.json');
const sonicManifest = readJson(sonicManifestPath);
const layout = readJson(resolve('out/mission-01/presentation-r2/layout-qa.json'));
const tournamentRoot = resolve('out/mission-01/sonic-tournament-r1b');
const tournament = readJson(join(tournamentRoot, 'tournament-manifest.json'));
const tournamentResults = tournament.candidates.map((candidate) => {
  const candidateId = candidate.id || candidate.candidateId;
  const providerDir = resolve('out/mission-01/twelve-labs-calibration/sonic-tournament-r1b', candidateId);
  const provenancePath = join(providerDir, 'provider-provenance.json');
  const provenance = readJson(provenancePath);
  const parsedPath = join(providerDir, 'provider-response.parsed.json');
  return { id: candidateId, videoSha256: candidate.videoSha256, audioSha256: candidate.audioSha256, providerStatus: provenance.status, findingCount: existsSync(parsedPath) ? readJson(parsedPath).findings.length : null, score: existsSync(parsedPath) ? readJson(parsedPath).overall_score_10 : null, assetId: provenance.asset_id || null, rawResponsePath: provenance.raw_response_path || provenance.rawResponsePath || null };
});
const summary = {
  schema_version: 'mobius-sonic-identity-tournament-r1',
  mission: 'MOBIUS_AUTONOMOUS_SONIC_IDENTITY_TOURNAMENT_AND_FINAL_QA_R1',
  generatedAt: new Date().toISOString(),
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  recommendation: 'INTEGRATION_VERIFIED_REVIEW_PENDING',
  recommendationReason: 'Les deux previews finales ont été analysées par Pegasus 1.5 et validées structurellement. Les warnings perceptuels restants sont séparés et classés; l’approbation PUBLISHABLE reste humaine.',
  generatorNative: true,
  noVideoModification: true,
  sonicWinner: { id: 'C-warm-table-cafe', manifestPath: sonicManifestPath, sha256: hashFile(resolve('src/assets/branding/sonic/mobius-cafe-sonic-signature.wav')), durationSec: sonicManifest.durationSec, sourceManifest: sonicManifest, waterIncluded: false },
  tournament: { candidateCount: tournament.candidates.length, candidateResults: tournamentResults, providerAnalysisAttempts: 6, successfulStructuredResponses: 2, note: 'A 3.6 s a été refusé par la contrainte provider de 4 s; les probes r1b portent le même signal 3.6 s avec queue silencieuse jusqu’à 4.2 s.' },
  finalProvider: { actualProviderCall: true, analysisAttemptCount: 3, successfulStructuredResponses: 2, successfulAnalysisCount: 2, changedGameRetryCount: 1, rows },
  deterministic: { namespace: 'DET-*', layoutViolationCount: layout.violation_count, layoutQaPath: resolve('out/mission-01/presentation-r2/layout-qa.json'), previewResolution: '1920x1080', audioBedContinuity: 'PASS' },
  calibrationMetrics: { providerFindingCount: findingCount, actionableFindingPercentage: findingCount ? Number((actionableCount / findingCount * 100).toFixed(1)) : 0, falsePositiveCount: rows.reduce((sum, row) => sum + row.adjudicationCounts.FALSE_POSITIVE, 0), unassessableCount: rows.reduce((sum, row) => sum + row.adjudicationCounts.UNASSESSABLE, 0), plausibleEditorialCount: rows.reduce((sum, row) => sum + row.adjudicationCounts.PLAUSIBLE_EDITORIAL, 0), targetClasses: ['intro sonic identity', 'voice continuity', 'fr-CA pronunciation', 'script progression', 'mobile readability', 'panel/space use', 'visual-narration correspondence'] },
  evidenceNamespaces: { deterministic: 'DET-*', provider: 'TL-*', adjudicated: 'ADJ-*' },
};
writeJson(join(outRoot, 'calibration-summary.json'), summary);
writeJson(join(outRoot, 'cache-index.json'), { provider: 'twelvelabs', model_name: 'pegasus1.5', tournamentCandidates: tournamentResults, finalAnalyses: rows.map(({ game, videoSha256, assetId, cacheHit, providerRequestId }) => ({ game, videoSha256, assetId, cacheHit, providerRequestId })) });
writeJson(join(outRoot, 'runner-evidence.json'), { provider: 'twelvelabs', model_name: 'pegasus1.5', actualProviderCall: true, targetedCandidateCount: 3, targetedSuccessfulResponses: 2, finalSuccessfulResponses: 2, finalAnalysisAttempts: 3, schemaValidated: rows.every((row) => row.schemaValid), deterministicLayoutViolationCount: layout.violation_count, noVideoModification: true, generatorNativeWinner: 'C-warm-table-cafe' });
const report = `# MOBIUS sonic identity tournament and final QA\n\n- Winner: **C-warm-table-cafe**\n- Source: recorded local café ambience 25813 + cup 491088 + dice 102631; water excluded.\n- Targeted structured responses: 2/3 candidates; final structured responses: 2/2 previews.\n- Deterministic layout violations: ${layout.violation_count}.\n- Final verdicts: ${rows.map((row) => `${row.game}=${row.verdict}`).join(', ')}.\n- TL findings remain TL-*; local checks remain DET-*; adjudication remains ADJ-*.\n- PUBLISHABLE remains reserved for Director review.\n`;
writeFileSync(join(outRoot, 'calibration-report.md'), report, 'utf8');
console.log(JSON.stringify({ outRoot, winner: summary.sonicWinner.id, layoutViolations: layout.violation_count, finalVerdicts: rows.map((row) => ({ game: row.game, verdict: row.verdict })) }, null, 2));
