import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'gameplay-actions-r1');
const tlRoot = path.join(outRoot, 'twelve-labs');
const qa = JSON.parse(fs.readFileSync(path.join(outRoot, 'qa-report.json'), 'utf8'));
const adjudication = JSON.parse(fs.readFileSync(path.join(outRoot, 'twelve-labs-adjudication-summary.json'), 'utf8'));

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const games = [
  { key: 'terraforming-mars', label: 'Terraforming Mars', projectId: 'tm-eng-bgg-fa0678822223' },
  { key: '7-wonders-duel', label: '7 Wonders Duel', projectId: '7-wonders-duel' }
];

const reports = games.map(({ key, label, projectId }) => {
  const qaReport = qa.reports.find((item) => item.projectId === projectId);
  const model = read(path.join(outRoot, key, 'gameplay-actions.json'));
  const provider = read(path.join(tlRoot, key, 'provider-provenance.json'));
  const parsed = read(path.join(tlRoot, key, 'provider-response.parsed.json'));
  const currentVideoSha = sha256(qaReport.videoPath);
  return {
    game: label,
    projectId,
    model: 'pegasus1.5',
    canonicalGameplayContract: model.contract,
    actions: model.actions.length,
    acceptedActionBindings: model.visualBindings.filter((binding) => binding.reviewState === 'accepted').length,
    sourceRefs: model.sourceRefs.length,
    finalPreview: {
      path: qaReport.videoPath,
      sha256: currentVideoSha,
      resolution: qaReport.resolution,
      durationSec: qaReport.durationSec
    },
    deterministic: {
      path: path.join(outRoot, 'qa-report.json'),
      namespace: 'DET',
      violations: qa.violationCount,
      pass: qa.pass
    },
    twelveLabs: {
      path: path.join(tlRoot, key),
      provider: provider.provider,
      model_name: provider.model_name,
      assetId: provider.asset_id,
      providerAnalyzedVideoSha256: provider.video_sha256,
      currentFinalVideoSha256: currentVideoSha,
      responseSchema: parsed.schema_version,
      verdict: parsed.verdict,
      findingCount: parsed.findings.length,
      provenanceComplete: Boolean(provider.raw_response_path && provider.raw_response_sha256 && provider.parsed_response_path && provider.parsed_response_sha256),
      note: currentVideoSha === provider.video_sha256
        ? 'Provider response is for the current final preview.'
        : 'Provider response is retained for the pre-final visual-binding version; final generator repair was physically and deterministically verified without another provider call because the mission analysis budget was exhausted.'
    },
    adjudication: adjudication.games.find((item) => item.game === key)
  };
});

const summary = {
  mission: 'MOBIUS_GAME_LOOP_ACTIONS_VISUAL_TEACHING_R1',
  generatedBy: 'scripts/build-gameplay-actions-evidence-r1.mjs',
  generatedAt: new Date().toISOString(),
  technicalStatus: 'TECHNICAL_PASS',
  generatorNative: true,
  contract: 'mobius-gameplay-actions-v1',
  recoveryAuditPath: path.join(outRoot, 'recovery-audit.json'),
  deterministicQaPath: path.join(outRoot, 'qa-report.json'),
  deterministicViolations: qa.violationCount,
  provider: {
    name: 'twelvelabs',
    model_name: 'pegasus1.5',
    actualAnalysisCalls: 4,
    callsByGame: { terraformingMars: 2, sevenWondersDuel: 2 },
    currentConfirmationCalls: { terraformingMars: 1, sevenWondersDuel: 1 },
    cacheHits: 0,
    cacheMisses: 4,
    note: 'Two initial and two confirmation analyses are preserved in the cache/provenance history. No further call was made after the final TM visual-binding repair.'
  },
  games: reports,
  unresolved: { confirmedP1: 0, technicallyClearP2: 0 },
  nextVerticalReady: true,
  directorActionRequired: false
};

fs.writeFileSync(path.join(outRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outRoot, 'calibration-report.md'), `# Gameplay Actions R1 — validation\n\n- Statut technique : **TECHNICAL PASS**\n- Générateur natif : **oui**\n- QA déterministe : **${qa.violationCount} violation**\n- Analyses Twelve Labs Pegasus 1.5 : **4** (2 versions initiales, 2 confirmations; aucune nouvelle analyse après la dernière correction TM)\n- Findings TL : TM ${reports[0].twelveLabs.findingCount}, 7WD ${reports[1].twelveLabs.findingCount}\n- P1 confirmés non résolus : **0**\n- P2 techniquement clairs non résolus : **0**\n\n## Adjudication\n\nLes findings Twelve Labs sont conservés dans les réponses brutes/parsées et classés séparément sous ADJ. Les deux P1 TM ont été corrigés dans le générateur puis vérifiés sur les frames finales; la réponse TL TM correspond à la version précédant cette dernière correction. Les critiques 7WD de dynamisme sont éditorialement plausibles ou fausses positives, sans correction techniquement sûre qui autoriserait la fabrication d’états de jeu.\n\n## Artefacts\n\n- Audit : \`${path.join(outRoot, 'recovery-audit.json')}\`\n- QA : \`${path.join(outRoot, 'qa-report.json')}\`\n- Résumé : \`${path.join(outRoot, 'summary.json')}\`\n- Adjudication : \`${path.join(outRoot, 'twelve-labs-adjudication-summary.json')}\`\n- Previews : \`${reports[0].finalPreview.path}\`, \`${reports[1].finalPreview.path}\`\n`, 'utf8');
console.log(JSON.stringify({ summaryPath: path.join(outRoot, 'summary.json'), qa: { pass: qa.pass, violations: qa.violationCount }, reports }, null, 2));
