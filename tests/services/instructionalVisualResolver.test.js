const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  evaluateVisualQuality,
  resolveInstructionalVisual,
  resolveVisualPaneAlignment,
  validateVisualCentering,
} = require('../../src/services/instructionalVisualResolver.cjs');

describe('instructional visual resolution and pane alignment', () => {
  let directory; let visual;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-visual-'));
    visual = path.join(directory, 'visual.png'); fs.writeFileSync(visual, Buffer.from('fixture'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  const requirement = {
    requiredObjects: ['card', 'coins'], requiredLabels: ['Pièces'],
    minimumEffectiveResolution: { width: 900, height: 600, maxScalePreferred: 1.15, maxScaleHard: 1.35 },
  };

  test('rejects thumbnails, incomplete crops, contamination and excessive enlargement', () => {
    const asset = { filePath: visual, sourceType: 'THUMBNAIL', visualUtility: 'EXACT_INSTRUCTIONAL', width: 320, height: 200, semanticObjects: ['card', 'coins'], visibleLabels: ['Pièces'], cropCompleteness: false, cropPurity: false };
    const quality = evaluateVisualQuality(asset, requirement, { width: 900, height: 600 });
    expect(quality.valid).toBe(false);
    expect(quality.hardViolations).toEqual(expect.arrayContaining(['thumbnail-final-use', 'incomplete-crop', 'contaminated-crop', 'excessive-raster-enlargement']));
  });

  test('selects a source-grounded vector through a project binding without benchmark logic', () => {
    const asset = { id: 'vector', filePath: visual, sourceType: 'DETERMINISTIC_VECTOR', visualUtility: 'EXACT_INSTRUCTIONAL', width: 1600, height: 900, semanticObjects: ['card', 'coins'], visibleLabels: ['Pièces'], cropCompleteness: 'complete', cropPurity: 'clean', dominantInstructionalLanguage: 'fr-CA' };
    const result = resolveInstructionalVisual({ atom: { id: 'unseen-action', visualRequirement: requirement }, assets: [asset], explicitBindings: { 'unseen-action': ['vector'] }, display: { width: 1200, height: 675 } });
    expect(result.reviewState).toBe('accepted'); expect(result.selectedAsset.id).toBe('vector');
  });

  test.each([
    ['portrait', { width: 400, height: 700 }], ['landscape', { width: 700, height: 400 }],
    ['wide', { width: 900, height: 260 }], ['square', { width: 500, height: 500 }],
    ['multi-object', { width: 760, height: 620 }],
  ])('centers %s visuals by default', (_name, size) => {
    const pane = { x: 900, y: 100, width: 900, height: 800 };
    const ratio = Math.min(pane.width / size.width, pane.height / size.height);
    const visualBounds = { width: size.width * ratio, height: size.height * ratio };
    visualBounds.x = pane.x + (pane.width - visualBounds.width) / 2;
    visualBounds.y = pane.y + (pane.height - visualBounds.height) / 2;
    const alignment = resolveVisualPaneAlignment({});
    expect(alignment).toEqual(expect.objectContaining({ horizontal: 'CENTER', vertical: 'CENTER', fit: 'CONTAIN' }));
    expect(validateVisualCentering({ pane, visual: visualBounds, alignment }).valid).toBe(true);
  });

  test('top alignment requires a declared lower-zone purpose', () => {
    expect(resolveVisualPaneAlignment({ visualPaneAlignment: { vertical: 'TOP' } }).declaredLowerZone).toBe(false);
    expect(resolveVisualPaneAlignment({ visualCaption: 'Étape suivante', visualPaneAlignment: { vertical: 'TOP' } }).declaredLowerZone).toBe(true);
  });
});
