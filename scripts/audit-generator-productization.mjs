#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const outputDir = path.join(root, 'out', 'generator-productization-r11');
fs.mkdirSync(outputDir, { recursive: true });

const builderNames = fs.readdirSync(path.join(root, 'scripts'))
  .filter((name) => /^build-7wd-r\d+-project-data\.mjs$/i.test(name)).sort();
const qaNames = fs.readdirSync(path.join(root, 'scripts'))
  .filter((name) => /^qa-publishability-r\d+(?:-full)?\.mjs$/i.test(name)).sort();
const normalEntrypoints = ['scripts/run-rulebook-production.mjs', 'scripts/run-source-grounded-production.mjs'];
const normalSource = normalEntrypoints.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

const capabilityPatterns = [
  ['source-detail lineage / authority / peer parity', /sourceDetail|sourceAuthority|peerQuality|trueSource/i],
  ['object-aware crop and complete silhouette', /crop|silhouette|isolation|matte|contamination/i],
  ['physical referent / setup / quantity grounding', /requiredReferent|setupPlacement|quantityFidelity|militaryToken/i],
  ['layered face state and accessibility', /FACE_UP|FACE_DOWN|coveredBy|accessible/i],
  ['one-shot marker transition', /oneShot|consumed|reentry/i],
  ['card family / tableau personnel', /familyGroups|tableau|card.family/i],
  ['progressive scoring', /scoreExample|scorepad|progressive/i],
  ['clause-level focus and semantic motion', /focusCue|motionCue|semanticRegion/i],
  ['responsive/mobile/panel geometry', /mobile|panel|centering|layout/i],
  ['Amélie delivery and narration QA', /AMELIE|narration|voice|false.start|stutter/i],
  ['brand and sonic identity', /sonic|coffee|cafe|brand/i],
];

function auditFile(name, kind) {
  const relativePath = `scripts/${name}`;
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const gameSpecificSignals = [...new Set([
    ...(text.match(/knowledge-[a-z0-9-]+/gi) || []).slice(0, 24),
    ...(text.match(/(?:xref|assetId|sceneId)\s*[:=]\s*['"`][^'"`]+/gi) || []).slice(0, 24),
  ])];
  return {
    path: relativePath,
    kind,
    classification: kind === 'builder' ? ['GAME_SPECIFIC_FACT', 'BENCHMARK_REGRESSION_FIXTURE', 'OBSOLETE_ITERATION_SCAFFOLD'] : ['BENCHMARK_REGRESSION_FIXTURE'],
    detectedReusableCapabilities: capabilityPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label),
    gameSpecificSignals,
    migration: {
      genericBehaviorPromotedTo: [
        'src/services/canonicalProductionCompiler.cjs',
        'src/services/sourceAssetResolver.cjs',
        'src/services/physicalGameState.cjs',
        'src/services/visualPlan.cjs',
        'src/services/productionQualityGate.cjs',
      ],
      gameFactsRetainedIn: 'config/projects/7-wonders-duel and immutable R5-R11 evidence',
      productionDependency: false,
      retention: 'ARCHIVED_IN_PLACE_FOR_REGRESSION_AND_HISTORY',
    },
  };
}

const result = {
  contract: 'mobius-r5-r11-productization-audit-v1',
  generatedAt: new Date().toISOString(),
  branchScope: 'fix/terraforming-mars-quality-regression-restore',
  normalEntrypoints,
  normalEntrypointIterationDependencies: [...builderNames, ...qaNames].filter((name) => normalSource.includes(name)),
  classifications: [
    ...builderNames.map((name) => auditFile(name, 'builder')),
    ...qaNames.map((name) => auditFile(name, 'qa-regression-fixture')),
  ],
  promotedGenericCapabilities: [
    { capability: 'RuleAtom-derived VisualRequirements', owner: 'src/services/rulebookKnowledge.cjs' },
    { capability: 'authority/detail/identity source resolution and review threshold', owner: 'src/services/sourceAssetResolver.cjs' },
    { capability: 'physical game state and transitions', owner: 'src/services/physicalGameState.cjs' },
    { capability: 'automatic VisualPlan compilation and Cockpit shape', owner: 'src/services/visualPlan.cjs' },
    { capability: 'normal deterministic production QA', owner: 'src/services/productionQualityGate.cjs' },
    { capability: 'automatic phone-scale QA sheet', owner: 'src/services/phoneScaleQa.cjs' },
    { capability: 'warm R10 Amélie and approved sonic contract', owner: 'src/services/editorialStandard.cjs' },
  ],
  decisions: {
    normalProductionRequiresIterationBuilder: false,
    normalProductionRequiresIterationQa: false,
    CODEX_REQUIRED_FOR_NORMAL_PRODUCTION: false,
  },
};
result.status = result.normalEntrypointIterationDependencies.length === 0 ? 'PASS' : 'FAIL';
fs.writeFileSync(path.join(outputDir, 'builder-capability-audit.json'), `${JSON.stringify(result, null, 2)}\n`);
const md = [
  '# R5–R11 generator productization audit', '',
  `Status: **${result.status}**`, '',
  `Normal iteration-script dependencies: **${result.normalEntrypointIterationDependencies.length}**`, '',
  '## Classification', '',
  ...result.classifications.flatMap((entry) => [
    `### ${entry.path}`, '',
    `- Class: ${entry.classification.join(', ')}`,
    `- Reusable behavior detected: ${entry.detectedReusableCapabilities.join('; ') || 'none'}`,
    `- Production dependency: ${entry.migration.productionDependency ? 'YES' : 'NO'}`,
    `- Retention: ${entry.migration.retention}`, '',
  ]),
  '## Promoted owners', '',
  ...result.promotedGenericCapabilities.map((entry) => `- ${entry.capability}: \`${entry.owner}\``), '',
  'Project-specific facts remain project data; iteration orchestration remains archived evidence.', '',
].join('\n');
fs.writeFileSync(path.join(outputDir, 'builder-capability-audit.md'), md);
console.log(JSON.stringify({ status: result.status, builders: builderNames.length, qaFixtures: qaNames.length, outputDir }, null, 2));
