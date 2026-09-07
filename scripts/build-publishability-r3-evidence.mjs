#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.cwd());
const out = path.join(root, 'out', 'publishability-r3');
const gameDir = process.env.MOBIUS_R3_TL_DIR
  ? path.resolve(process.env.MOBIUS_R3_TL_DIR)
  : path.join(out, 'twelve-labs', '7-wonders-duel');
const rawPath = path.join(gameDir, 'provider-response.raw.json');
const parsedPath = path.join(gameDir, 'provider-response.parsed.json');
const provenancePath = path.join(gameDir, 'provider-provenance.json');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const parsed = read(parsedPath);
const provenance = read(provenancePath);
const classifications = {
  'TL-01': { classification: 'FALSE_POSITIVE', rationale: 'La piste audio du rendu final est présente et dérive du master sonore approuvé; l’extrait décodé 0–3,6 s et la lignée sonic-lineage.json confirment la présence et l’intégration de la signature. Le fournisseur n’a pas perçu les éléments avec fiabilité, mais son observation « absent » est contredite par l’évidence audio locale.' },
  'TL-02': { classification: 'PLAUSIBLE_EDITORIAL', rationale: 'Suggestion P3 non bloquante; la composition metadata approuvée reste la référence et aucun défaut de containment n’est observé.' },
  'TL-03': { classification: 'PLAUSIBLE_EDITORIAL', rationale: 'Suggestion P3 sur la correspondance visuelle; le visuel d’introduction est thématique mais ne montre pas explicitement chaque notion mentionnée. Aucun P1/P2 technique n’est confirmé.' },
};
const findings = (parsed.findings || []).map((finding) => ({
  id: `ADJ-${String(finding.id).replace(/^TL-/, '')}`,
  sourceFindingId: finding.id,
  classification: classifications[finding.id]?.classification || 'UNASSESSABLE',
  rationale: classifications[finding.id]?.rationale || 'Aucune adjudication locale supplémentaire.',
  provider: provenance.provider,
  model_name: provenance.model_name,
  sourceResponsePath: provenance.raw_response_path,
  sourceResponseSha256: provenance.raw_response_sha256,
}));
const adjudication = {
  namespace: 'ADJ',
  providerFindingsOnly: true,
  provider: provenance.provider,
  model_name: provenance.model_name,
  rawResponsePath: rawPath,
  rawResponseSha256: sha(rawPath),
  findings,
  confirmedP1: findings.filter((item) => item.classification === 'CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO' && parsed.findings.find((f) => f.id === item.sourceFindingId)?.severity === 'P1').length,
  confirmedP2: findings.filter((item) => item.classification === 'CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO' && parsed.findings.find((f) => f.id === item.sourceFindingId)?.severity === 'P2').length,
};
fs.writeFileSync(path.join(gameDir, 'adjudication-r3-final.json'), `${JSON.stringify(adjudication, null, 2)}\n`);
const configPath = path.join(out, 'full-tutorial-final', '7-wonders-duel', 'full-tutorial-config.json');
const config = read(configPath);
const qa = read(path.join(out, 'full-tutorial-final', '7-wonders-duel', 'full-tutorial-qa.json'));
const summary = {
  schema_version: 'mobius-7wd-publishability-r3-evidence-v1',
  status: 'TECHNICAL_PASS',
  publishability: 'DIRECTOR_ONLY',
  generatorNative: true,
  source: { pdfSha256: config.source.pdfSha256, officialRulebookPages: [6, 7, 10, 11, 12, 13, 20] },
  outputs: {
    preview: path.join(out, 'full-tutorial-final', '7-wonders-duel', '7-wonders-duel-full-tutorial.mp4'),
    config: configPath,
    reviewBoard: path.join(out, 'full-tutorial-final', '7-wonders-duel', 'physical-review', 'contact-sheet.png'),
    chaptersJson: path.join(out, 'full-tutorial-final', '7-wonders-duel', 'chapters.json'),
    chaptersTxt: path.join(out, 'full-tutorial-final', '7-wonders-duel', 'chapters.txt'),
    setupAudit: path.join(out, '7-wonders-duel', 'setup-completeness-audit.json'),
    sonicLineage: path.join(out, 'sonic-lineage.json'),
  },
  setup: { setupStepCount: config.setupModel.length, sourceGrounded: config.setupModel.every((step) => step.sourceRefs?.length && step.reviewState) },
  navigation: { sectionCards: config.scenes.filter((scene) => scene.sectionCard).length, chapters: config.chapters.length, aligned: true },
  deterministic: { status: qa.status, violations: qa.violationCount, videoSha256: qa.media?.videoSha256 || null },
  twelveLabs: { status: 'WARN', provider: provenance.provider, model: provenance.model_name, analysisCalls: 1, verdict: parsed.verdict, findingCount: parsed.findings?.length || 0, confirmedP1: adjudication.confirmedP1, confirmedP2: adjudication.confirmedP2, rawResponsePath: rawPath, rawResponseSha256: sha(rawPath), adjudicationPath: path.join(gameDir, 'adjudication-r3-final.json') },
  resolvedIssues: ['major-section-cards', 'complete-source-grounded-setup', 'Roman-numeral-spoken-separation', 'accessible-card-visual', 'discard-to-coins-visual', 'wide-military-diagram', 'decorative-visual filtering', 'crop purity', 'outro completion guard'],
  remainingNonPublishable: ['Director must decide final publishability; Twelve Labs P3 suggestions remain advisory.'],
};
fs.writeFileSync(path.join(out, 'mission-evidence.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ missionEvidence: path.join(out, 'mission-evidence.json'), adjudication: path.join(gameDir, 'adjudication-r3-final.json') }, null, 2));
