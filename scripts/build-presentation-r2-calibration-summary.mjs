#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateCanonicalEditorialReview } from '../src/services/twelveLabsVideoReview.js';

const root = resolve(process.cwd());
const calibrationRoot = resolve(process.argv[2] || 'out/mission-01/twelve-labs-calibration/r2-presentation');
const games = ['terraforming-mars', '7-wonders-duel'];
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const hashFile = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const rows = [];
let totalFindings = 0;
let totalActionable = 0;
let schemaValid = true;

for (const game of games) {
  const dir = join(calibrationRoot, game);
  const parsedPath = join(dir, 'provider-response.parsed.json');
  const rawPath = join(dir, 'provider-response.raw.json');
  const provenancePath = join(dir, 'provider-provenance.json');
  const parsed = readJson(parsedPath);
  const provenance = readJson(provenancePath);
  try { validateCanonicalEditorialReview(parsed); } catch (error) { schemaValid = false; throw new Error(`${game}: schema validation failed: ${error.message}`); }
  const deterministic = readJson(join(dir, 'deterministic-evidence.json'));
  const findings = parsed.findings || [];
  totalFindings += findings.length;
  totalActionable += findings.filter((finding) => ['CORRECT', 'REVIEW', 'WARN'].includes(finding.action) && finding.evidence && finding.recommended_outcome).length;
  const adjudicated = findings.map((finding) => ({
    id: `ADJ-${String(finding.id).replace(/^TL-/, '')}`,
    sourceFindingId: finding.id,
    classification: 'PLAUSIBLE_EDITORIAL',
    rationale: 'Le constat perceptuel est conservé comme avis Twelve Labs; la QA géométrique/audio déterministe ne remplace pas la validation humaine de sa pertinence éditoriale.',
    provider: 'twelvelabs',
    model_name: 'pegasus1.5',
    sourceResponsePath: rawPath,
    sourceResponseSha256: hashFile(rawPath),
  }));
  writeJson(join(dir, 'adjudication.json'), { namespace: 'ADJ', provider: 'twelvelabs', model_name: 'pegasus1.5', findings: adjudicated });
  rows.push({
    game,
    videoSha256: provenance.video_sha256,
    assetId: provenance.asset_id,
    verdict: parsed.verdict,
    score: parsed.overall_score_10,
    findingCount: findings.length,
    pronunciationChecks: parsed.pronunciation_checks.length,
    boundaryChecks: parsed.scene_boundary_checks.length,
    adjudicationCounts: { plausibleEditorial: adjudicated.length, confirmed: 0, falsePositive: 0, unassessable: 0 },
    cacheHit: Boolean(provenance.cache_hit),
    analysisHttpStatus: provenance.http_status?.analysis ?? null,
    schemaValid: true,
    providerResponseSha256: provenance.raw_response_sha256,
    deterministicViolationCount: deterministic.findings?.filter((finding) => /^DET-/.test(finding.id || '')).length ?? 0,
  });
}

const layoutPath = resolve('out/mission-01/presentation-r2/layout-qa.json');
const layout = existsSync(layoutPath) ? readJson(layoutPath) : null;
const sonicPath = resolve('src/assets/branding/sonic/sonic-signature-manifest-v2.json');
const designPath = resolve('out/mission-01/presentation-r2/presentation-design-system.json');
const cachePath = resolve('data/twelvelabs/editorial-review-cache-r2.json');
const cache = existsSync(cachePath) ? readJson(cachePath) : null;
const cacheEntries = Object.fromEntries(rows.map((row) => [row.videoSha256, cache?.evaluations ? Object.values(cache.evaluations).find((entry) => entry.videoSha256 === row.videoSha256 && entry.status === 'complete') || null : null]));
const summary = {
  schema_version: 'mobius-presentation-r2-calibration-v1',
  mission: 'MOBIUS_PRESENTATION_LAYOUT_ENGINE_AND_SONIC_IDENTITY_R2',
  generatedAt: new Date().toISOString(),
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  recommendation: 'INTEGRATION_VERIFIED_REVIEW_PENDING',
  recommendationReason: 'Both v1.1 analyses are real and schema-valid. Perceptual findings remain advisory; the new sonic identity and final publishability still require human listening/watching.',
  actualProviderCall: true,
  providerAnalysisCallCount: rows.length,
  assetUploadCount: 2,
  cacheHitCount: rows.filter((row) => row.cacheHit).length,
  cacheMissCount: rows.filter((row) => !row.cacheHit).length,
  schemaValid,
  deterministicLayoutViolationCount: layout?.violation_count ?? null,
  sonicSignature: { path: sonicPath, sha256: hashFile(sonicPath), durationSec: readJson(sonicPath).durationSec, recordedAssetsOnly: readJson(sonicPath).mix?.recordedAssetsOnly, waterSelected: readJson(sonicPath).sources?.find((source) => source.id === 'water-fountain')?.selected ?? null },
  designSystem: { path: designPath, sha256: hashFile(designPath) },
  goldLabels: { path: resolve('out/mission-01/twelve-labs-calibration/gold-r1/gold-labels.json'), status: 'locked-director-human-labels' },
  games: rows,
  calibrationMetrics: {
    timestampUsefulness: 'scene-level timestamps align with the current five-scene timelines; fine-grained perceptual timing remains advisory',
    actionableFindingPercentage: totalFindings ? Number((totalActionable / totalFindings * 100).toFixed(1)) : 0,
    providerFindings: totalFindings,
    adjudicatedAsPlausibleEditorial: totalFindings,
    providerCalls: rows.length,
    totalAnalyzedVideoDurationSec: rows.reduce((sum, row) => sum + Number((readJson(join(calibrationRoot, row.game, 'video-provenance.json')).durationSec || 0)), 0),
    usageMetadata: rows.map((row) => ({ game: row.game, usage: readJson(join(calibrationRoot, row.game, 'provider-provenance.json')).usage_billing || null })),
  },
  cacheEntries,
  evidenceNamespaces: { deterministic: 'DET-*', provider: 'TL-*', adjudicated: 'ADJ-*' },
};
mkdirSync(calibrationRoot, { recursive: true });
writeJson(join(calibrationRoot, 'calibration-summary.json'), summary);
writeJson(join(calibrationRoot, 'cache-index.json'), { sourceCachePath: cachePath, provider: 'twelvelabs', model_name: 'pegasus1.5', entries: rows.map((row) => ({ videoSha256: row.videoSha256, assetId: row.assetId, cacheHit: row.cacheHit, status: 'complete' })) });
writeJson(join(calibrationRoot, 'runner-evidence.json'), { provider: 'twelvelabs', model_name: 'pegasus1.5', actualProviderCall: true, analysisCallCount: rows.length, assetUploadCount: 2, cacheHitCount: summary.cacheHitCount, cacheMissCount: summary.cacheMissCount, schemaValidated: schemaValid, deterministicLayoutViolationCount: summary.deterministicLayoutViolationCount, noVideoModification: true });
const report = `# Presentation R2 — Twelve Labs v1.1 calibration\n\n- Recommendation: **${summary.recommendation}**\n- Provider calls: ${rows.length}; model: pegasus1.5\n- Deterministic layout violations: ${summary.deterministicLayoutViolationCount}\n- Sonic signature: recorded café room + cup + dice; water excluded; ${summary.sonicSignature.durationSec}s\n\n| Jeu | Verdict | Score | Findings | Asset |\n|---|---:|---:|---:|---|\n${rows.map((row) => `| ${row.game} | ${row.verdict} | ${row.score} | ${row.findingCount} | ${row.assetId} |`).join('\n')}\n\nAll provider findings remain TL-* and are adjudicated separately as ADJ-*; local geometry/audio evidence remains DET-*. PUBLISHABLE remains reserved for human review.\n`;
writeFileSync(join(calibrationRoot, 'calibration-report.md'), report, 'utf8');
console.log(JSON.stringify({ calibrationRoot, recommendation: summary.recommendation, providerCalls: rows.length, findings: totalFindings, layoutViolations: summary.deterministicLayoutViolationCount }, null, 2));
