#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeVisualPlan, validateVisualPlan } = require('../src/services/visualPlan.cjs');
const { compileObjectAwareCrop, auditOpticalCenter } = require('../src/services/objectAwareCrop.cjs');
const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r9/terraforming-mars/generalization-proof.json');

const asset = (id, overrides = {}) => ({
  id,
  containsActualGamePixels: true,
  visualClassification: 'REAL_COMPONENT',
  cropPurity: 'clean',
  cropCompleteness: 'complete',
  reviewState: 'accepted',
  sourceRefs: [{ page: 1 }],
  ...overrides,
});
const assets = [
  asset('tm-central-board', { representedComponent: 'board', visualClassification: 'REAL_BOARD_OR_TRACK' }),
  asset('tm-player-mats', { representedComponent: 'player mats', representedQuantity: 2 }),
  asset('tm-resource-cubes', { representedComponent: 'resource cubes', representedQuantity: 6 }),
  asset('tm-card-family-brown', { representedComponent: 'automated project cards' }),
  asset('tm-card-family-blue', { representedComponent: 'active project cards' }),
  asset('tm-card-family-green', { representedComponent: 'event cards' }),
];
const setup = normalizeVisualPlan({
  ruleAtomId: 'tm-bounded-setup',
  compositionType: 'REAL_SETUP_PLACEMENT',
  actualGameAssetIds: ['tm-central-board', 'tm-player-mats', 'tm-resource-cubes'],
  reviewState: 'accepted',
  requiredReferents: ['plateau central', 'plateaux individuels', 'cubes de ressources'],
  referentGroundingRequired: true,
  referentEvidence: [
    { referent: 'plateau central', assetId: 'tm-central-board', visibleAtNarration: true },
    { referent: 'plateaux individuels', assetId: 'tm-player-mats', visibleAtNarration: true },
    { referent: 'cubes de ressources', assetId: 'tm-resource-cubes', visibleAtNarration: true },
  ],
  setupPlacementEvidenceRequired: true,
  setupPlacements: [
    { referent: 'plateau central', destination: 'centre de table', visibleRelationship: true },
    { referent: 'plateaux individuels', destination: 'devant chaque joueur', visibleRelationship: true },
    { referent: 'cubes de ressources', destination: 'réserves correspondantes', visibleRelationship: true },
  ],
}, { id: 'tm-bounded-setup', domain: 'setup', componentRefs: ['board', 'player mats', 'resource cubes'] });
const families = normalizeVisualPlan({
  ruleAtomId: 'tm-card-families',
  compositionType: 'REAL_CARD_FAMILY_TABLEAU',
  actualGameAssetIds: ['tm-card-family-brown', 'tm-card-family-blue', 'tm-card-family-green'],
  minimumRepresentativeAssets: 3,
  reviewState: 'accepted',
  requiredReferents: ['projets automatisés', 'projets actifs', 'événements'],
  referentGroundingRequired: true,
  referentEvidence: [
    { referent: 'projets automatisés', assetId: 'tm-card-family-brown', visibleAtNarration: true },
    { referent: 'projets actifs', assetId: 'tm-card-family-blue', visibleAtNarration: true },
    { referent: 'événements', assetId: 'tm-card-family-green', visibleAtNarration: true },
  ],
}, { id: 'tm-card-families', domain: 'components', componentRefs: ['cards'] });

const setupValidation = validateVisualPlan(setup, assets);
const familyValidation = validateVisualPlan(families, assets);
const deliberatelyMissing = validateVisualPlan({ ...setup, referentEvidence: setup.referentEvidence.slice(0, 2) }, assets);
const rejectedReuse = validateVisualPlan({ ...families, actualGameAssetIds: ['tm-rejected-matte'] }, [asset('tm-rejected-matte', { invalidated: true, directorRejectedForSameDefect: true })]);
const crop = compileObjectAwareCrop({
  sourceWidth: 1400,
  sourceHeight: 900,
  intendedObjects: [{ id: 'tm-resource-cube', bounds: { x: 510, y: 260, width: 260, height: 260 } }],
  forbiddenObjects: [{ id: 'unrelated-card', bounds: { x: 1100, y: 80, width: 220, height: 340 } }],
  paddingPx: 42,
});
const center = auditOpticalCenter({ objectBounds: { x: 1120, y: 330, width: 360, height: 360 }, paneBounds: { x: 900, y: 150, width: 800, height: 720 } });
const genericFiles = [
  'src/services/visualPlan.cjs',
  'src/services/objectAwareCrop.cjs',
  'scripts/build-real-component-assets-r5.mjs',
  'scripts/build-visual-storyboard-r5.mjs',
].map((file) => path.join(ROOT, file));
const forbidden = /(?:7-wonders-duel|seven\s+wonders\s+duel|\bxref\s*[:=]\s*\d+)/ig;
const hardcodes = genericFiles.flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(forbidden)].map((match) => ({ file: path.relative(ROOT, file), token: match[0], index: match.index })));
const checks = {
  setupReferentGroundingGeneralizes: setupValidation.valid,
  setupPlacementEvidenceGeneralizes: setup.setupPlacements.every((entry) => entry.visibleRelationship),
  absentNarratedComponentFails: deliberatelyMissing.violations.some((entry) => entry.startsWith('physical-referent-absent:')),
  rejectedDerivativeInvalidationGeneralizes: rejectedReuse.violations.includes('rejected-asset-reused'),
  cardFamilyTaxonomyGeneralizes: familyValidation.valid && families.actualGameAssetIds.length === 3,
  objectAwareCropGeneralizes: crop.cropCompleteness === 'complete' && crop.cropPurity === 'clean',
  opticalCenteringGeneralizes: center.valid,
  noSevenWondersLogicInSharedCode: hardcodes.length === 0,
};
const report = {
  contract: 'mobius-publishability-r9-generalization-proof-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'tm-eng-bgg-fa0678822223',
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  checks,
  evidence: { setup, setupViolations: setupValidation.violations, families, familyViolations: familyValidation.violations, deliberatelyMissing: deliberatelyMissing.violations, rejectedReuse: rejectedReuse.violations, crop, center, hardcodes },
  note: 'Bounded Terraforming Mars fixture exercises shared learner-grounding, setup-placement, rejected-derivative, crop, centering and taxonomy contracts without a full render or provider call.',
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, checks, output: OUT }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
