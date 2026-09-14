const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { materializeVisualPlanFrames } = require('../../src/services/visualPlanMaterializer.cjs');

const fixture = path.resolve(__dirname, '../../src/assets/branding/les-jeux-mobius-banner-canonical.png');
const outputDir = path.resolve(__dirname, '../../out/test-visual-plan-materializer');

test('mono-image still uses the real storyboard renderer and never auto-certifies composition', async () => {
  const { materializeInstructionalStill } = require('../../src/services/visualPlanMaterializer.cjs');
  const state = { projectId: 'test-normal-still', assets: [{ id: 'asset', filePath: fixture, width: 1600, height: 900 }],
    sourceSelections: [{ ruleAtomId: 'atom', status: 'AUTO_ACCEPTED' }],
    scenes: [{ id: 'still', atomId: 'atom', section: 'components', narration: 'Un objet', on_screen_text: 'Un objet',
      source_pages: [2], visualRequirement: { requiredObjects: ['object'] }, renderVisual: { assetId: 'asset' } }] };
  const result = await materializeInstructionalStill({ state, sceneId: 'still', outputDir });
  expect(result).toMatchObject({ produced: true, validated: false, sourceAssetId: 'asset' });
  expect(await sharp(result.outputPath).metadata()).toMatchObject({ width: 1920, height: 1080 });
  expect(await sharp(result.phonePath).metadata()).toMatchObject({ width: 390, height: 219 });
  expect(fs.readdirSync(outputDir).some(f => f.endsWith('.mp4'))).toBe(false);
}, 30000);

test('missing transition composition cannot be replaced by a recognized standalone component', async () => {
  const { materializeInstructionalStill } = require('../../src/services/visualPlanMaterializer.cjs');
  const state = { assets: [], sourceSelections: [], scenes: [{ id: 'transition', visualRequirement: { requiredObjects: ['board'], transitionRequired: true } }] };
  expect(await materializeInstructionalStill({ state, sceneId: 'transition', outputDir, allowReviewCandidate: true })).toMatchObject({ produced: false, validated: false });
});

afterAll(() => fs.rmSync(outputDir, { recursive: true, force: true }));

test('normal materializer turns a multi-asset VisualPlan into a provenance-preserving render visual', async () => {
  const assets = ['board', 'token'].map((id) => ({ id, filePath: fixture, sourceRefs: [{ page: 2 }], containsActualGamePixels: true }));
  const state = {
    assets,
    scenes: [{
      id: 'knowledge-setup', atomId: 'setup', source_pages: [2], sourceRefs: [{ page: 2 }],
      canonicalVisualPlan: { compositionType: 'REAL_SETUP_PLACEMENT', actualGameAssetIds: ['board', 'token'], confidence: 0.95 },
    }],
  };
  const result = await materializeVisualPlanFrames({ state, outputDir, width: 800, height: 500 });
  expect(result.records).toHaveLength(1);
  expect(result.scenes[0].renderVisual.kind).toBe('automatic-visual-plan-composite');
  expect(result.scenes[0].renderVisual.provenance.sourceAssetIds).toEqual(['board', 'token']);
  const metadata = await sharp(result.records[0].outputPath).metadata();
  expect(metadata).toMatchObject({ width: 800, height: 500 });
});
