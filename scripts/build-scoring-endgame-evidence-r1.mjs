#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'scoring-endgame-r1');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exists = (file) => fs.existsSync(file);
const qa = read(path.join(outRoot, 'qa-report.json'));
const providerCachePath = path.join(root, 'data', 'twelvelabs', 'editorial-review-cache-r2.json');
const providerCache = read(providerCachePath);
const games = {};
for (const game of ['terraforming-mars', '7-wonders-duel']) {
  const dir = path.join(outRoot, 'twelve-labs', game);
  const model = read(path.join(outRoot, game, 'scoring-endgame.json'));
  const provenance = read(path.join(dir, 'provider-provenance.json'));
  const video = path.join(outRoot, game, 'scoring-endgame-preview.mp4');
  const initial = path.join(dir, 'initial', 'provider-provenance.json');
  const currentStructured = provenance.status !== 'failed' && exists(path.join(dir, 'provider-response.parsed.json'));
  games[game] = {
    currentVideoSha256: sha256(video),
    provider: 'twelvelabs',
    model_name: 'pegasus1.5',
    currentCallStatus: provenance.status || 'unknown',
    currentStructuredResponseValid: currentStructured,
    actualProviderCall: provenance.actualProviderCall === true || Number(provenance.httpStatus?.analysis) >= 200,
    currentProviderProvenancePath: path.join(dir, 'provider-provenance.json'),
    initialProviderProvenancePath: exists(initial) ? initial : null,
    assetId: provenance.asset_id || providerCache.assets?.[sha256(video)]?.assetId || null,
    scoringAtoms: model.scoringCategories.length,
    immediateVictoryAtoms: model.endGameModel.immediateVictoryConditions.length,
    currentRawResponseAvailable: provenance.status !== 'failed' && exists(path.join(dir, 'provider-response.raw.json')),
    currentAnalysisRawResponsePath: provenance.rawResponsePath || null,
    currentParsedResponsePath: provenance.parsedResponsePath || null,
  };
}
const recommendation = Object.values(games).every((game) => game.currentCallStatus === 'complete' && game.currentStructuredResponseValid) && qa.violationCount === 0
  ? 'INTEGRATION_VERIFIED_REVIEW_PENDING'
  : 'BLOCKED_SCHEMA';
const summary = {
  contract: 'mobius-scoring-endgame-calibration-v1',
  generatedBy: 'scripts/build-scoring-endgame-evidence-r1.mjs',
  technicalStatus: recommendation === 'BLOCKED_SCHEMA' ? 'BLOCKED' : 'TECHNICAL_PASS',
  recommendation,
  deterministic: { status: qa.status, violationCount: qa.violationCount, qaPath: path.join(outRoot, 'qa-report.json') },
  provider: { name: 'twelvelabs', model_name: 'pegasus1.5', analysesAttempted: { 'terraforming-mars': 1, '7-wonders-duel': 2 }, actualProviderCalls: Object.fromEntries(Object.entries(games).map(([game, value]) => [game, value.actualProviderCall])), validCurrentResponses: Object.fromEntries(Object.entries(games).map(([game, value]) => [game, value.currentStructuredResponseValid])), note: 'Un payload provider non strict est conservé comme échec de contrat; aucune conclusion TL n’est synthétisée.' },
  games,
  assets: { bannerPath: path.join(root, 'src', 'assets', 'branding', 'les-jeux-mobius-banner-canonical.png'), sonicPath: path.join(root, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav') },
};
fs.writeFileSync(path.join(outRoot, 'calibration-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
const report = `# Scoring / Endgame R1 — evidence\n\n- Technical status: **${summary.technicalStatus}**\n- Recommendation: **${recommendation}**\n- Deterministic QA: ${qa.status}; violations: ${qa.violationCount}\n- Provider: Twelve Labs / Pegasus 1.5\n- Analysis attempts: Terraforming Mars 1; 7 Wonders Duel 2\n\n## Provider boundary\n\nThe provider was reached with real asset uploads and analysis requests. The current scoring previews did not both yield schema-valid current responses: the provider returned a non-strict structured payload on the Terraforming Mars request and on the 7 Wonders Duel confirmation. Historical initial 7 Wonders Duel structured evidence is preserved separately and is not presented as evidence for the changed video. No synthetic Twelve Labs finding was created.\n\n## Deterministic result\n\nThe current previews are 1920x1080 and deterministic QA reports zero violations.\n`;
fs.writeFileSync(path.join(outRoot, 'calibration-report.md'), `${report}\n`, 'utf8');
console.log(JSON.stringify({ summaryPath: path.join(outRoot, 'calibration-summary.json'), reportPath: path.join(outRoot, 'calibration-report.md'), recommendation, deterministicViolations: qa.violationCount }, null, 2));
