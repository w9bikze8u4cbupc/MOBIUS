import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildRulebookKnowledgeModel, buildTutorialCoverageMatrix } = require('../src/services/rulebookKnowledge.cjs');
const { evaluateVisualQuality, resolveVisualPaneAlignment, validateVisualCentering } = require('../src/services/instructionalVisualResolver.cjs');

function args(argv = process.argv.slice(2)) {
  const out = {}; for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  return out;
}
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }

async function main() {
  const values = args();
  if (!values.gameplay || !values.endgame || !values.out || !values.project || !values.sha) throw new Error('Usage: --project <id> --sha <pdf-sha> --gameplay <json> --endgame <json> --out <json>');
  const gameplayModel = read(values.gameplay); const endgameModel = read(values.endgame);
  const model = buildRulebookKnowledgeModel({ projectSeed: { projectId: values.project, sourcePdfSha256: values.sha, gameIdentity: gameplayModel.gameIdentity, coverageApplicability: { mandatory_actions: true, final_scoring: true, complete_setup: true } }, gameplayModel, endgameModel });
  const coverage = buildTutorialCoverageMatrix(model);
  const alignment = resolveVisualPaneAlignment({});
  const pane = { x: 900, y: 100, width: 900, height: 800 };
  const visual = { x: 1000, y: 100, width: 700, height: 800 };
  const centered = validateVisualCentering({ pane, visual, alignment });
  const knownFile = gameplayModel.visualBindings?.find((binding) => binding.sourceRefs?.[0]?.sourceImage)?.sourceRefs?.[0]?.sourceImage;
  const lowResolutionGate = evaluateVisualQuality({ filePath: knownFile, sourceType: 'THUMBNAIL', visualUtility: 'EXACT_INSTRUCTIONAL', width: 240, height: 160, semanticObjects: ['component'], visibleLabels: [], cropCompleteness: 'complete', cropPurity: 'clean' }, { requiredObjects: ['component'], minimumEffectiveResolution: { width: 900, height: 600 } }, { width: 900, height: 600 });
  const checks = {
    ruleAtomsGenerated: model.ruleAtoms.length > 0,
    actionAtomsGenerated: model.actions.length === gameplayModel.actions.length,
    scoringAtomsGenerated: model.scoringRules.length === endgameModel.scoringCategories.length,
    visualRequirementsGenerated: model.ruleAtoms.every((atom) => atom.visualRequirement?.purpose && atom.visualRequirement.requiredObjects.length),
    missingSetupDetected: coverage.missingHighPriorityDomains.includes('complete_setup'),
    splitCenterDefault: alignment.horizontal === 'CENTER' && alignment.vertical === 'CENTER' && alignment.fit === 'CONTAIN',
    lowResolutionRejected: !lowResolutionGate.valid && lowResolutionGate.hardViolations.includes('thumbnail-final-use'),
    genericProjectIdentity: model.projectId === values.project,
  };
  const result = { contract: 'mobius-rulebook-knowledge-generalization-r4-v1', generatedAt: new Date().toISOString(), projectId: values.project, sourcePdfSha256: values.sha, status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', checks, atomCounts: { total: model.ruleAtoms.length, actions: model.actions.length, scoring: model.scoringRules.length }, coverage: { status: coverage.status, missingHighPriorityDomains: coverage.missingHighPriorityDomains }, centeringProbe: centered, note: 'A missing applicable domain is a successful gate detection, not an accepted tutorial.' };
  const target = path.resolve(values.out); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
