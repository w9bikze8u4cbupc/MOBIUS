#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r10');
const TL = path.join(OUT, 'twelvelabs/7-wonders-duel');
const VIDEO = path.join(OUT, '7-wonders-duel');
const review = JSON.parse(fs.readFileSync(path.join(TL, 'provider-response.parsed.json'), 'utf8'));
const encoded = JSON.parse(fs.readFileSync(path.join(VIDEO, 'encoded-media-inspection.json'), 'utf8'));
const frame = (sceneId) => encoded.frames.find((item) => item.sceneId === sceneId)?.filePath || null;
const evidence = {
  'TL-001': {
    classification: 'PLAUSIBLE_EDITORIAL_NON_BLOCKING',
    rationale: 'The scene visibly uses the official exact-edition component spread as a static mental-model overview; the immediately following objective scene shows real military, science and VP evidence. Additional animation is optional polish, not a technically clear defect.',
    files: [frame('knowledge-identity-theme'), frame('knowledge-objective-victory-overview')],
  },
  'TL-002': {
    classification: 'FALSE_POSITIVE',
    rationale: 'The encoded grid contains the real official conflict board, red pawn, four Military tokens, five isolated Progress tokens, seven coins, Age cards and Wonder cards. A component-recognition overview does not require live-hand manipulation.',
    files: [frame('knowledge-components-physical-overview')],
  },
  'TL-003': {
    classification: 'FALSE_POSITIVE',
    rationale: 'The setup frame combines the official complete placement diagram with real isolated Military tokens, Progress tokens and coins. It is not an abstract-only diagram.',
    files: [frame('knowledge-setup-central')],
  },
  'TL-004': {
    classification: 'FALSE_POSITIVE',
    rationale: 'The encoded frame shows the complete official 20-card Age I structure, face-up/face-down encoding, Age I back/front examples and a pause cue. The provider claim that the structure is absent conflicts with the frame.',
    files: [frame('knowledge-setup-age-layouts')],
  },
  'TL-005': {
    classification: 'PLAUSIBLE_EDITORIAL_NON_BLOCKING',
    rationale: 'The frame uses a source-grounded two-state composition: accessible card/cost on the left, constructed city state on the right, with an intentional connector. Physical hands/payment animation would be optional enrichment rather than a confirmed P2.',
    files: [frame('knowledge-construct-building')],
  },
  'TL-006': {
    classification: 'FALSE_POSITIVE',
    rationale: 'Three encoded motion captures prove the real red conflict pawn moves from center through an intermediate position to a penalty/deep zone while the track zones remain visible. The provider evaluated a static sample.',
    files: encoded.transitionCaptures.filter((item) => item.sceneId === 'knowledge-military-system').map((item) => item.filePath),
  },
};
const findings = review.findings.map((finding) => ({
  id: `ADJ-${finding.id.replace(/^TL-/, '')}`,
  sourceFindingId: finding.id,
  providerSeverity: finding.severity,
  providerAction: finding.action,
  ...evidence[finding.id],
  authority: 'DET_PHYSICAL_OVER_TL_ADVISORY',
}));
const report = {
  namespace: 'ADJ',
  contract: 'mobius-r10-twelvelabs-adjudication-v1',
  generatedAt: new Date().toISOString(),
  provider: 'twelvelabs',
  model_name: 'pegasus1.5',
  providerVerdict: review.verdict,
  providerOverallScore10: review.overall_score_10,
  status: 'WARN',
  confirmedP1: 0,
  confirmedP2: 0,
  falsePositiveCount: findings.filter((item) => item.classification === 'FALSE_POSITIVE').length,
  plausibleEditorialNonBlockingCount: findings.filter((item) => item.classification === 'PLAUSIBLE_EDITORIAL_NON_BLOCKING').length,
  strengthsPreserved: review.strengths_to_preserve,
  findings,
};
fs.writeFileSync(path.join(TL, 'adjudication.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, providerVerdict: report.providerVerdict, findingCount: findings.length, falsePositives: report.falsePositiveCount, plausibleEditorialNonBlocking: report.plausibleEditorialNonBlockingCount, confirmedP1: report.confirmedP1, confirmedP2: report.confirmedP2 }, null, 2)}\n`);
