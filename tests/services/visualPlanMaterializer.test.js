const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { materializeVisualPlanFrames } = require('../../src/services/visualPlanMaterializer.cjs');

const fixture = path.resolve(__dirname, '../../src/assets/branding/les-jeux-mobius-banner-canonical.png');
const outputDir = path.resolve(__dirname, '../../out/test-visual-plan-materializer');

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
