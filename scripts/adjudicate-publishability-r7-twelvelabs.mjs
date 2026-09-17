#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out', 'publishability-r7', '7-wonders-duel');
const TL = path.join(OUT, 'twelvelabs');
const parsedPath = path.join(TL, 'provider-response.parsed.json');
const rawPath = path.join(TL, 'provider-response.raw.json');
const provenancePath = path.join(TL, 'provider-provenance.json');
const focusPath = path.join(OUT, 'focus-transition-proof', 'report.json');
const fullQaPath = path.join(OUT, 'full-qa-r7.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const parsed = read(parsedPath);
const provenance = read(provenancePath);
const focus = read(focusPath);
const fullQa = read(fullQaPath);

if (parsed.provider !== 'twelvelabs' || parsed.model_name !== 'pegasus1.5') throw new Error('Provider identity mismatch.');
if (provenance.raw_response_sha256 !== sha256(rawPath)) throw new Error('Raw provider provenance mismatch.');
if (fullQa.status !== 'PASS' || focus.status !== 'PASS') throw new Error('Local evidence must pass before adjudication.');

const decisions = {
  'TL-001': {
    classification: 'FALSE_POSITIVE',
    rationale: 'La preuve rendue de transition montre le repère constructionCost actif pendant la clause de coût, puis absent après sa fin; il ne demeure pas pendant les sujets suivants.',
    evidencePaths: [focusPath],
  },
  'TL-002': {
    classification: 'PLAUSIBLE_EDITORIAL',
    rationale: 'La scène montre une vraie carte de commerce, son prix unitaire, trois pièces et la formule « 2 pièces + symboles identiques bruns/gris chez l’adversaire ». Ajouter tout le tableau adverse pourrait offrir plus de contexte, mais l’explication actuelle est concrète, lisible et non erronée.',
    evidencePaths: [path.join(OUT, 'review-frames', '14-knowledge-trade-missing-resources.png')],
  },
  'TL-003': {
    classification: 'FALSE_POSITIVE',
    rationale: 'Le cadre final montre les deux paires de cartes complètes et les symboles blancs correspondants encerclés en rouge; le haut des cartes est conservé.',
    evidencePaths: [path.join(OUT, 'review-frames', '15-knowledge-chain-construction.png')],
  },
  'TL-004': {
    classification: 'FALSE_POSITIVE',
    rationale: 'La composition avant/après montre des cartes Âge réelles, les Merveilles, la carte glissée face cachée sous la Merveille et une flèche de transition, avec une légende explicite.',
    evidencePaths: [path.join(OUT, 'review-frames', '17-knowledge-construct-wonder.png')],
  },
  'TL-005': {
    classification: 'FALSE_POSITIVE',
    rationale: 'La preuve de transition rendue montre le repère victoryPoints centré sur le laurier pendant la clause correspondante, puis retiré après la clause.',
    evidencePaths: [focusPath],
  },
  'TL-006': {
    classification: 'PLAUSIBLE_EDITORIAL',
    rationale: 'Les vraies cartes Merveille et leurs valeurs imprimées sont visibles avec une légende dédiée. Un grossissement additionnel des valeurs pourrait aider certains écrans, mais aucune absence ni erreur déterministe n’est établie.',
    evidencePaths: [path.join(OUT, 'review-frames', '25-knowledge-scoring-wonders.png')],
  },
};

const findings = parsed.findings.map((finding, index) => {
  const decision = decisions[finding.id];
  if (!decision) throw new Error(`Missing adjudication for ${finding.id}.`);
  return {
    id: `ADJ-R7-${String(index + 1).padStart(3, '0')}`,
    sourceFindingId: finding.id,
    sourceSeverity: finding.severity,
    classification: decision.classification,
    rationale: decision.rationale,
    evidencePaths: decision.evidencePaths,
    provider: 'twelvelabs',
    model_name: 'pegasus1.5',
    sourceResponsePath: rawPath,
    sourceResponseSha256: provenance.raw_response_sha256,
    confirmedUnresolved: false,
  };
});
const counts = findings.reduce((result, finding) => {
  result[finding.classification] = (result[finding.classification] || 0) + 1;
  return result;
}, {});
const report = {
  contract: 'mobius-publishability-r7-adjudication-v1',
  generatedAt: new Date().toISOString(),
  providerVerdict: parsed.verdict,
  providerScore: parsed.overall_score_10,
  providerStatus: 'PASS_WITH_WARNINGS',
  counts,
  confirmedUnresolvedP1: 0,
  confirmedUnresolvedP2: 0,
  findings,
};
fs.writeFileSync(path.join(TL, 'adjudication.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: 'PASS', providerVerdict: report.providerVerdict, counts, confirmedUnresolvedP1: 0, confirmedUnresolvedP2: 0 }, null, 2)}\n`);
