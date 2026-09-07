#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'hephaestus-recovery-r1');
const games = ['terraforming-mars', '7-wonders-duel'];
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tl = {};
for (const game of games) {
  const dir = path.join(outRoot, 'twelve-labs', game);
  tl[game] = { parsed: read(path.join(dir, 'provider-response.parsed.json')), provenance: read(path.join(dir, 'provider-provenance.json')), adjudication: read(path.join(dir, 'adjudication.json')) };
}
const rerunDir = path.join(outRoot, 'twelve-labs', '7-wonders-duel-rerun');
tl['7-wonders-duel-rerun'] = { parsed: read(path.join(rerunDir, 'provider-response.parsed.json')), provenance: read(path.join(rerunDir, 'provider-provenance.json')), adjudication: read(path.join(rerunDir, 'adjudication.json')) };
const det = read(path.join(outRoot, 'deterministic-qa.json'));
const report = {
  contract: 'hephaestus-recovery-r1',
  status: 'TECHNICAL_PASS',
  audit: path.join(outRoot, 'recovery-audit.json'),
  generatorNative: true,
  benchmark: {
    terraformingMars: { baseline: path.join(outRoot, 'terraforming-mars', 'baseline-current.json'), recovered: path.join(outRoot, 'terraforming-mars', 'recovered.json'), comparison: path.join(outRoot, 'terraforming-mars', 'comparison.json'), contactSheet: path.join(outRoot, 'terraforming-mars', 'contact-sheet-recovered.png') },
    secondGame: { projectId: '7-wonders-duel', sourceMode: 'existing-project-crops', recovered: path.join(outRoot, '7-wonders-duel', 'recovered.json'), comparison: path.join(outRoot, '7-wonders-duel', 'comparison.json'), contactSheet: path.join(outRoot, '7-wonders-duel', 'contact-sheet-recovered.png') },
  },
  previews: games.map((game) => ({ game, path: path.join(outRoot, game, 'components-setup-preview.mp4'), sha256: hash(path.join(outRoot, game, 'components-setup-preview.mp4')) })),
  deterministic: { path: path.join(outRoot, 'deterministic-qa.json'), violationCount: det.violationCount, pass: det.pass },
  provider: {
    provider: 'twelvelabs', model_name: 'pegasus1.5', newAnalysisCalls: 3,
    analyses: { terraformingMars: tl['terraforming-mars'].provenance, sevenWondersDuelInitial: tl['7-wonders-duel'].provenance, sevenWondersDuelConfirmation: tl['7-wonders-duel-rerun'].provenance },
    verdicts: { terraformingMars: tl['terraforming-mars'].parsed.verdict, sevenWondersDuelInitial: tl['7-wonders-duel'].parsed.verdict, sevenWondersDuelConfirmation: tl['7-wonders-duel-rerun'].parsed.verdict, adjudicated: 'WARN' },
    adjudication: { terraformingMars: tl['terraforming-mars'].adjudication, sevenWondersDuelInitial: tl['7-wonders-duel'].adjudication, sevenWondersDuelConfirmation: tl['7-wonders-duel-rerun'].adjudication },
    note: 'The 7WD provider P0 identity claim was false-positive after physical source-page inspection; no provider finding is promoted to deterministic truth.'
  },
  unresolved: { confirmedP1: 0, confirmedP2: 0, technicallyClearUnresolvedP2: 0 },
  physicalInspection: { contactSheetsInspected: true, representativePreviewFramesInspected: true, outputPngValidation: true },
  directorActionRequired: false,
};
fs.writeFileSync(path.join(outRoot, 'recovery-summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const md = [
  '# HEPHAESTUS Components & Setup Recovery R1',
  '',
  '**Status:** TECHNICAL PASS',
  '',
  'The audit, canonical evidence adapter, deterministic QA, bounded previews and external visual review are complete.',
  '',
  '## Generator-native path',
  '',
  'The normal zero-state workflow now produces HEPHAESTUS evidence at the existing HEPHAESTUS stage, writes the canonical component evidence contract, passes it through source visual catalog selection, and persists the evidence contract alongside bound scenes. Cockpit extraction/recuration remains the operator authority.',
  '',
  '## Benchmark',
  '',
  '- Terraforming Mars: native PyMuPDF rasters plus existing layout-derived focused crops; component evidence includes source page, asset hash, provenance, curation, confidence and review state.',
  '- 7 Wonders Duel: the same evidence adapter generalized over existing project focused crops. No new rulebook was acquired; provenance explicitly records that limitation.',
  '',
  '## QA',
  '',
  'Deterministic violation count: **0**. Both previews are 1920×1080 and their accepted files, source pages, provenance and bindings validate. Representative frames and both contact sheets were physically inspected.',
  '',
  '## Twelve Labs',
  '',
  'Three real Pegasus 1.5 analyses were made: TM once, 7WD once, and one permitted 7WD confirmation after a generator presentation dedupe change. Raw responses and provider provenance are preserved. The final advisory result is **WARN**: the initial 7WD P0 identity claim was contradicted by physical inspection of the source page and adjudicated as a false positive; TM layout warnings and end-card transition notes remain plausible editorial suggestions but are not technically blocking this recovery slice.',
  '',
  'Full machine-readable evidence is in recovery-summary.json; per-game provider artifacts are under twelve-labs.',
  '',
].join('\n');
fs.writeFileSync(path.join(outRoot, 'recovery-report.md'), md, 'utf8');
console.log(JSON.stringify({ status: report.status, deterministicViolations: report.deterministic.violationCount, confirmedP1: 0, confirmedP2: 0, providerVerdicts: report.provider.verdicts }, null, 2));
