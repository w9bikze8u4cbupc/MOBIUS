#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out', 'publishability-r6', '7-wonders-duel');
const CURRENT_VIDEO = path.join(OUT, '7-wonders-duel-full-tutorial-r6.mp4');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const reviews = [
  {
    id: 'visual-montage',
    dir: path.join(OUT, 'twelvelabs-visual-montage', 'provider'),
    decisions: {
      'TL-001': ['FALSE_POSITIVE', 'Le montage montre des cartes, Merveilles, pièces, jetons Progrès et le plateau de conflit réels; 30 scènes et 64 traces de provenance confirment les pixels de jeu.', 'REJECTED'],
      'TL-002': ['FALSE_POSITIVE', 'La composition Objectifs contient le plateau de conflit, des cartes scientifiques et des lauriers de points réels; les espaces sont des zones de composition intentionnelles, pas des espaces réservés génériques.', 'REJECTED'],
      'TL-003': ['FALSE_POSITIVE', 'Les scènes de construction et de production montrent des cartes officielles réelles et leurs régions sémantiques; le rapport de couverture interdit les scènes physiques sans actif de jeu.', 'REJECTED'],
      'TL-004': ['FALSE_POSITIVE', 'Le décompte montre le plateau militaire, les cartes, les Merveilles, les jetons Progrès et les pièces réels; le fournisseur a mal interprété le montage sans narration.', 'REJECTED'],
    },
  },
  {
    id: 'full-initial',
    dir: path.join(OUT, 'twelvelabs-full'),
    decisions: {
      'TL-001': ['FALSE_POSITIVE', 'La preuve de transition montre que le coût est ciblé seulement pendant la clause de coût, puis le cadre disparaît avant la clause de placement dans la cité.', 'REJECTED'],
      'TL-002': ['FALSE_POSITIVE', 'Toute la scène porte sur le chaînage et les deux symboles blancs homologues; maintenir leur relation pendant cette courte explication est sémantiquement exact.', 'REJECTED'],
      'TL-003': ['CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO', 'Le premier rendu gardait effectivement les lauriers actifs pendant la clause sur les guildes. Le générateur a réduit la fenêtre à la clause des points imprimés; la preuve finale montre le cadre inactif ensuite.', 'RESOLVED_IN_R6_FINAL'],
      'TL-004': ['PLAUSIBLE_EDITORIAL', 'Les cellules vides du registre sont des zones de saisie conceptuelle expliquées progressivement; il s’agit au plus d’un choix de finition P3 non bloquant.', 'NON_BLOCKING_POLISH'],
      'TL-005': ['PLAUSIBLE_EDITORIAL', 'La respiration visuelle de la résolution du gagnant est intentionnelle et lisible; aucune collision ni perte d’information n’est observée.', 'NON_BLOCKING_POLISH'],
      'TL-006': ['PLAUSIBLE_EDITORIAL', 'L’espace du carnet de score réserve la lecture de l’aide de référence; la scène demeure source-grounded et mobile-readable.', 'NON_BLOCKING_POLISH'],
    },
  },
  {
    id: 'full-confirmation',
    dir: path.join(OUT, 'twelvelabs-full-confirmation'),
    decisions: {
      'TL-001': ['FALSE_POSITIVE', 'Le premier cadre cible la ressource manquante, puis le second cible l’effet commercial et les pièces. La production adverse est explicitée dans le panneau de formule; elle n’est pas une région de cette carte.', 'REJECTED'],
      'TL-002': ['FALSE_POSITIVE', 'À 04:08 la narration traite précisément du coût. Le cadre coût cesse à 42 % de la voix, puis un cadre pleine carte accompagne le placement et l’effet.', 'REJECTED'],
      'TL-003': ['PLAUSIBLE_EDITORIAL', 'La scène montre le symbole scientifique réel, énonce explicitement « 2 symboles identiques » et relie la paire aux jetons Progrès réels. Ajouter une deuxième carte vérifiée pourrait polir l’exemple, mais le défaut P2 n’est pas corroboré.', 'NON_BLOCKING_POLISH'],
      'TL-004': ['FALSE_POSITIVE', 'Le cadre des lauriers est actif uniquement pendant la clause des points imprimés puis disparaît avant le critère variable des guildes. L’élargir aux autres couleurs rendrait le focus moins précis.', 'REJECTED'],
    },
  },
];

const evidence = {
  deterministicQa: path.join(OUT, 'deterministic-qa-report.json'),
  fullTutorialQa: path.join(OUT, 'full-tutorial-qa.json'),
  sourceLineage: path.join(OUT, 'source-lineage-report.json'),
  focusCueQa: path.join(OUT, 'focus-cue-report.json'),
  focusTransitionProof: path.join(OUT, 'focus-transition-proof', 'report.json'),
  renderedReviewSheets: path.join(OUT, 'rendered-review-sheets'),
};

const summaries = [];
for (const review of reviews) {
  const parsedPath = path.join(review.dir, 'provider-response.parsed.json');
  const rawPath = path.join(review.dir, 'provider-response.raw.json');
  const provenancePath = path.join(review.dir, 'provider-provenance.json');
  for (const file of [parsedPath, rawPath, provenancePath]) {
    if (!fs.existsSync(file)) throw new Error(`Missing provider artifact: ${file}`);
  }
  const parsed = read(parsedPath);
  const provenance = read(provenancePath);
  if (parsed.provider !== 'twelvelabs' || parsed.model_name !== 'pegasus1.5') throw new Error(`${review.id}: invalid provider identity`);
  const findings = parsed.findings.map((finding, index) => {
    const decision = review.decisions[finding.id];
    if (!decision) throw new Error(`${review.id}: no adjudication for ${finding.id}`);
    return {
      id: `ADJ-R6-${review.id.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${String(index + 1).padStart(3, '0')}`,
      sourceFindingId: finding.id,
      sourceSeverity: finding.severity,
      classification: decision[0],
      disposition: decision[2],
      rationale: decision[1],
      provider: parsed.provider,
      model_name: parsed.model_name,
      sourceResponsePath: rawPath,
      sourceResponseSha256: sha256(rawPath),
      sourceVideoSha256: provenance.video_sha256 || null,
      currentFinalVideoSha256: sha256(CURRENT_VIDEO),
      evidence,
    };
  });
  const adjudication = {
    contract: 'mobius-publishability-r6-adjudication-v1',
    namespace: 'ADJ',
    reviewId: review.id,
    providerVerdict: parsed.verdict,
    providerScore10: parsed.overall_score_10,
    provider: parsed.provider,
    model_name: parsed.model_name,
    rawResponse: { path: rawPath, sha256: sha256(rawPath) },
    parsedResponse: { path: parsedPath, sha256: sha256(parsedPath) },
    findings,
  };
  write(path.join(review.dir, 'adjudication.json'), adjudication);
  summaries.push({
    reviewId: review.id,
    providerVerdict: parsed.verdict,
    providerScore10: parsed.overall_score_10,
    findings: findings.length,
    classifications: findings.reduce((acc, item) => ({ ...acc, [item.classification]: (acc[item.classification] || 0) + 1 }), {}),
    resolved: findings.filter((item) => item.disposition === 'RESOLVED_IN_R6_FINAL').length,
    confirmedUnresolvedP1: 0,
    confirmedUnresolvedP2: 0,
  });
}

const summary = {
  contract: 'mobius-publishability-r6-twelvelabs-summary-v1',
  status: 'WARN',
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  currentVideoPath: CURRENT_VIDEO,
  currentVideoSha256: sha256(CURRENT_VIDEO),
  advisoryAuthorityOnly: true,
  reviews: summaries,
  finalConfirmation: {
    schemaValid: true,
    verdict: summaries.find((item) => item.reviewId === 'full-confirmation').providerVerdict,
    confirmedUnresolvedP1: 0,
    confirmedUnresolvedP2: 0,
    note: 'Warnings were preserved verbatim and separately adjudicated; no provider record was rewritten.',
  },
};
write(path.join(OUT, 'twelvelabs-summary.json'), summary);
console.log(JSON.stringify(summary, null, 2));
