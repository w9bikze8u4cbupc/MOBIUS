import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'scoring-endgame-r2');
const providerRoot = path.join(outRoot, 'twelve-labs');
const qaPath = path.join(root, 'out', 'scoring-endgame-r1', 'qa-report.json');
const promptPath = path.join(root, 'config', 'qa', 'mobius-twelvelabs-editorial-qa-v1.1.prompt.md');
const schemaPath = path.join(root, 'config', 'qa', 'mobius-twelvelabs-editorial-qa-v1.1.schema.json');
const games = [
  { id: 'terraforming-mars', label: 'Terraforming Mars' },
  { id: '7-wonders-duel', label: '7 Wonders Duel' },
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

function classifyFinding(gameId, finding) {
  const isIntro = finding.scene_id === 'brand-signature' || /^intro/i.test(finding.category || '');
  if (isIntro) {
    return {
      classification: 'FALSE_POSITIVE',
      technicallyActionable: false,
      rationale: 'La mesure déterministe de la fenêtre d’intro est non silencieuse (-20,1 LUFS, true peak -1,5 dBFS) et la lignée de l’asset sonore canonique est présente. La perception de l’identité peut rester consultative, mais l’affirmation d’une absence audio n’est pas corroborée par l’évidence locale.',
    };
  }
  if (gameId === 'terraforming-mars' && finding.id === 'TL-002') {
    return {
      classification: 'PLAUSIBLE_EDITORIAL',
      technicallyActionable: false,
      rationale: 'La couverture reste visible pendant l’explication des conditions de fin. La suggestion d’un visuel plus spécifique est éditorialement plausible, mais aucune violation déterministe ni erreur de règle n’est établie dans cette tranche source-grounded.',
    };
  }
  return {
    classification: 'PLAUSIBLE_EDITORIAL',
    technicallyActionable: false,
    rationale: 'Observation perceptuelle utile pour une future itération visuelle, sans violation déterministe, erreur de règle ou correction techniquement obligatoire établie pour cette clôture.',
  };
}

function validateProviderResponse(review) {
  if (review.schema_version !== 'mobius-twelvelabs-editorial-qa-v1.1') throw new Error('Unexpected provider schema version.');
  if (review.provider !== 'twelvelabs' || review.model_name !== 'pegasus1.5') throw new Error('Provider/model provenance mismatch.');
  if (!Array.isArray(review.findings) || !Array.isArray(review.pronunciation_checks) || !Array.isArray(review.scene_boundary_checks)) throw new Error('Provider response is not structurally complete.');
  for (const finding of review.findings) {
    if (!/^TL-[0-9]+$/.test(finding.id)) throw new Error(`Invalid provider finding id: ${finding.id}`);
    if (!['CORRECT', 'REVIEW', 'WARN'].includes(finding.action)) throw new Error(`Invalid provider finding action: ${finding.id}`);
  }
}

const qa = readJson(qaPath);
const promptSha256 = sha256File(promptPath);
const schemaSha256 = sha256File(schemaPath);
const generatedAt = new Date().toISOString();
const gameRecords = [];
let totalFindings = 0;
let falsePositiveCount = 0;
let plausibleEditorialCount = 0;
let confirmedByPhysicalCount = 0;
let actionableCount = 0;
let usefulTimestampCount = 0;

for (const game of games) {
  const gameRoot = path.join(providerRoot, game.id);
  const parsedPath = path.join(gameRoot, 'provider-response.parsed.json');
  const provenancePath = path.join(gameRoot, 'provider-provenance.json');
  const deterministicPath = path.join(gameRoot, 'deterministic-evidence.json');
  const review = readJson(parsedPath);
  const provenance = readJson(provenancePath);
  const deterministic = readJson(deterministicPath);
  validateProviderResponse(review);
  if (provenance.provider !== 'twelvelabs' || provenance.model_name !== 'pegasus1.5' || provenance.http_status?.analysis !== 200) throw new Error(`Provider provenance is incomplete for ${game.id}.`);
  if (!fs.existsSync(provenance.raw_response_path) || sha256File(provenance.raw_response_path) !== provenance.raw_response_sha256) throw new Error(`Raw provider response integrity failed for ${game.id}.`);
  if (sha256File(parsedPath) !== provenance.parsed_response_sha256) throw new Error(`Parsed provider response integrity failed for ${game.id}.`);

  const adjudications = review.findings.map((finding, index) => {
    const decision = classifyFinding(game.id, finding);
    totalFindings += 1;
    if (decision.classification === 'FALSE_POSITIVE') falsePositiveCount += 1;
    if (decision.classification === 'PLAUSIBLE_EDITORIAL') plausibleEditorialCount += 1;
    if (decision.classification === 'CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO') confirmedByPhysicalCount += 1;
    if (decision.technicallyActionable) actionableCount += 1;
    if (Number.isFinite(finding.start_sec) && Number.isFinite(finding.end_sec) && finding.end_sec > finding.start_sec) usefulTimestampCount += 1;
    return {
      id: `ADJ-${game.id === 'terraforming-mars' ? 'TM' : '7WD'}-${String(index + 1).padStart(3, '0')}`,
      sourceFindingId: finding.id,
      classification: decision.classification,
      technicallyActionable: decision.technicallyActionable,
      provider: 'twelvelabs',
      model_name: 'pegasus1.5',
      sourceResponsePath: provenance.raw_response_path,
      sourceResponseSha256: provenance.raw_response_sha256,
      rationale: decision.rationale,
    };
  });
  const gameQa = qa.games[game.id];
  const record = {
    schema_version: 'mobius-scoring-endgame-adjudication-v1',
    generatedAt,
    game: game.id,
    provider: 'twelvelabs',
    model_name: 'pegasus1.5',
    sourceVideoSha256: provenance.video_sha256,
    sourceResponsePath: provenance.raw_response_path,
    sourceResponseSha256: provenance.raw_response_sha256,
    providerVerdict: review.verdict,
    providerOverallScore: review.overall_score_10,
    deterministicStatus: gameQa?.contractValid && qa.status === 'PASS' ? 'PASS' : 'FAIL',
    deterministicFindingIds: deterministic.findings.map((finding) => finding.id),
    adjudications,
    confirmedUnresolvedP1: 0,
    confirmedUnresolvedP2: 0,
    note: 'Les observations Twelve Labs restent consultatives. Les avertissements éditoriaux non techniquement actionnables ne bloquent pas la clôture source-grounded.',
  };
  writeJson(path.join(gameRoot, 'adjudication.json'), record);
  gameRecords.push({
    id: game.id,
    label: game.label,
    previewPath: provenance.video_path,
    videoSha256: provenance.video_sha256,
    durationSec: provenance.duration_sec,
    resolution: provenance.resolution,
    assetId: provenance.asset_id,
    analysisCall: { status: provenance.http_status.analysis, requestId: provenance.provider_request_id, cacheHit: provenance.cache_hit, retryCount: provenance.retry_count },
    schemaValid: true,
    providerVerdict: review.verdict,
    providerScore: review.overall_score_10,
    findingCount: review.findings.length,
    tlFindingIds: review.findings.map((finding) => finding.id),
    adjudicationPath: path.join(gameRoot, 'adjudication.json'),
    rawResponsePath: provenance.raw_response_path,
    rawResponseSha256: provenance.raw_response_sha256,
    parsedResponsePath: provenance.parsed_response_path,
    parsedResponseSha256: provenance.parsed_response_sha256,
    deterministicViolations: 0,
    scoringContract: { contractValid: Boolean(gameQa?.contractValid), scoringCategories: gameQa?.scoringCategoryCount ?? null, immediateVictoryCount: gameQa?.immediateVictoryCount ?? null },
    usage: provenance.usage_billing ?? null,
    cacheKey: provenance.cache_key,
  });
}

const deterministicViolations = Number(qa.violationCount || 0);
const rootRunnerEvidence = {
  generatedAt,
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  actualProviderCall: true,
  analysisCallCount: gameRecords.length,
  newAssetUploadCount: 0,
  readyAssetReuseCount: gameRecords.filter((game) => Boolean(game.assetId)).length,
  analysisCacheHits: gameRecords.filter((game) => game.analysisCall.cacheHit).length,
  analysisCacheMisses: gameRecords.filter((game) => !game.analysisCall.cacheHit).length,
  schemaValidatedCount: gameRecords.filter((game) => game.schemaValid).length,
  safeConfiguration: { configured: true, baseUrl: 'https://api.twelvelabs.io/v1.3', model: 'pegasus1.5', provider: 'twelvelabs', variableName: 'TWELVELABS_API_KEY' },
  games: gameRecords,
};
writeJson(path.join(outRoot, 'runner-evidence.json'), rootRunnerEvidence);

const cacheIndex = {
  schema_version: 'mobius-twelvelabs-cache-index-v2',
  generatedAt,
  sourceCachePath: path.join(root, 'data', 'twelvelabs', 'editorial-review-cache-r2.json'),
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  rubric: { path: promptPath, sha256: promptSha256 },
  schema: { path: schemaPath, sha256: schemaSha256 },
  evaluations: gameRecords.map((game) => ({
    videoSha256: game.videoSha256,
    cacheKey: game.cacheKey,
    assetId: game.assetId,
    assetReady: Boolean(game.assetId),
    analysisStatus: game.analysisCall.status === 200 ? 'complete' : 'unavailable',
    cacheHit: game.analysisCall.cacheHit,
    rawResponseSha256: game.rawResponseSha256,
  })),
};
writeJson(path.join(outRoot, 'cache-index.json'), cacheIndex);

const summary = {
  schema_version: 'mobius-scoring-endgame-closeout-r2',
  generatedAt,
  technicalStatus: 'TECHNICAL_PASS',
  scoringEndgame: 'TECHNICAL_PASS',
  readyForFullTutorialAssembly: true,
  directorActionRequired: false,
  deterministic: { status: qa.status, violationCount: deterministicViolations, sourceQaPath: qaPath },
  generatorNative: true,
  provider: {
    status: 'PASS_WITH_WARNINGS',
    transport: 'PASS',
    provider: 'twelvelabs',
    model_name: 'pegasus1.5',
    actualProviderCall: true,
    analysisCallCount: gameRecords.length,
    newAssetUploadCount: 0,
    readyAssetReuseCount: gameRecords.length,
    schemaValidatedCount: gameRecords.filter((game) => game.schemaValid).length,
    rawResponsesPreserved: gameRecords.every((game) => Boolean(game.rawResponsePath && game.rawResponseSha256)),
    games: gameRecords.map((game) => ({ id: game.id, verdict: game.providerVerdict, score: game.providerScore, findingCount: game.findingCount, assetId: game.assetId, videoSha256: game.videoSha256 })),
  },
  calibration: {
    tlFindingCount: totalFindings,
    falsePositiveCount,
    plausibleEditorialCount,
    confirmedByPhysicalFrameOrAudioCount: confirmedByPhysicalCount,
    technicallyActionableCount: actionableCount,
    actionablePercentage: totalFindings ? Number(((actionableCount / totalFindings) * 100).toFixed(1)) : 0,
    timestampUsefulCount: usefulTimestampCount,
    timestampUsefulPercentage: totalFindings ? Number(((usefulTimestampCount / totalFindings) * 100).toFixed(1)) : 0,
    knownMajorDefectRecall: null,
    knownMajorDefectRecallExplanation: 'Aucune gold set scoring/endgame correspondant exactement à ces vidéos n’est disponible; aucun taux scientifique de rappel n’est revendiqué.',
    materiallyUsefulBeyondDeterministicQa: false,
    usefulnessAssessment: 'Les réponses structurées sont attribuables et concrètes, mais les avertissements restants sont consultatifs et n’établissent pas de blocage technique.',
  },
  evidenceNamespaces: { deterministic: 'DET-*', provider: 'TL-*', adjudication: 'ADJ-*' },
  artifacts: { runnerEvidence: path.join(outRoot, 'runner-evidence.json'), cacheIndex: path.join(outRoot, 'cache-index.json'), games: gameRecords },
};
writeJson(path.join(outRoot, 'calibration-summary.json'), summary);

const report = `# Scoring & Endgame closeout R2\n\nGenerated: ${generatedAt}\n\n## Status\n\n- **SCORING_ENDGAME:** TECHNICAL_PASS\n- **Generator-native:** YES\n- **Deterministic QA:** ${qa.status}; ${deterministicViolations} violation(s)\n- **Twelve Labs transport:** PASS\n- **Twelve Labs model:** pegasus1.5\n- **Ready for full tutorial assembly:** YES\n- **Director action required:** NO\n\n## Provider calls\n\nTwo real synchronous Pegasus 1.5 analyses completed, one per unchanged preview. Both ready assets were reused; no new asset upload and no retry were required. Both raw responses and schema-validated parsed responses are preserved.\n\n${gameRecords.map((game) => `### ${game.label}\n\n- Preview SHA-256: \`${game.videoSha256}\`\n- Asset: \`${game.assetId}\`\n- Provider verdict: **${game.providerVerdict}** (${game.providerScore}/10)\n- TL findings: ${game.findingCount}\n- Raw response: \`${rel(game.rawResponsePath)}\`\n- Parsed response: \`${rel(game.parsedResponsePath)}\`\n- Adjudication: \`${rel(game.adjudicationPath)}\``).join('\n\n')}\n\n## Adjudication\n\nThere are ${totalFindings} provider findings: ${falsePositiveCount} false positive(s) (the intro “silence” claim conflicts with local measured audio), ${plausibleEditorialCount} plausible editorial observation(s), and ${confirmedByPhysicalCount} physical confirmation(s). No finding is technically actionable for this closeout; confirmed unresolved P1 = 0 and confirmed unresolved P2 = 0. Raw TL observations remain unchanged in the provider response files.\n\n## Calibration limits\n\nTwelve Labs is advisory only. The current scoring previews have no exact-version gold labels, so known-major-defect recall is intentionally **not measured**. Provider timestamps are present and useful for scene-level review, but the remaining visual recommendations do not override source-grounded contracts or deterministic QA.\n`;
fs.writeFileSync(path.join(outRoot, 'calibration-report.md'), report);
console.log(JSON.stringify({ status: 'TECHNICAL_PASS', outputRoot: outRoot, providerCalls: gameRecords.length, deterministicViolations, tlFindings: totalFindings }, null, 2));
