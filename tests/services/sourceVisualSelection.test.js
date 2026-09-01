const fs = require('fs');
const os = require('os');
const path = require('path');

let loadSourceVisualCatalog;
let selectSourceVisual;
let inferVisualTypes;

beforeAll(async () => {
  const mod = await import('../../src/services/sourceVisualSelection.js');
  loadSourceVisualCatalog = mod.loadSourceVisualCatalog;
  selectSourceVisual = mod.selectSourceVisual;
  inferVisualTypes = mod.inferVisualTypes;
});

function makeAsset(root, { id, page = 4, classification = 'card', confidence = 0.8, width = 600, height = 800 }) {
  const fileName = `${id}.png`;
  fs.writeFileSync(path.join(root, 'images', 'all', fileName), 'fixture');
  return {
    id,
    file_name: fileName,
    page_index: page - 1,
    classification,
    is_component: true,
    confidence,
    dimensions: { width, height },
  };
}

describe('sourceVisualSelection', () => {
  let root;
  let manifestPath;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-source-visuals-'));
    fs.mkdirSync(path.join(root, 'images', 'all'), { recursive: true });
    manifestPath = path.join(root, 'manifest.json');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('infers visual intent from a French reviewed scene', () => {
    const types = inferVisualTypes({
      section: 'Mise en place du plateau et des jetons',
      narration: 'Placez les cartes et les ressources sur le plateau.',
    });
    expect(types).toEqual(expect.arrayContaining(['board', 'card', 'token']));
  });

  test('chooses a curated on-page component before falling back to the rulebook page', () => {
    const card = makeAsset(root, { id: 'page4-card', classification: 'card' });
    const board = makeAsset(root, { id: 'page4-board', classification: 'board', width: 1200, height: 800 });
    fs.writeFileSync(manifestPath, JSON.stringify({ images: [card, board] }));

    const catalog = loadSourceVisualCatalog(manifestPath);
    const selection = selectSourceVisual({
      id: 'setup-deck',
      source_pages: [4],
      section: 'Mise en place des cartes sur le plateau',
      narration: 'Placez le paquet de cartes dans la rangée.',
    }, catalog, '/fallback/page-4.png');

    expect(selection.kind).toBe('component');
    expect(selection.path).toContain('page4-card.png');
    expect(selection.confidence).toBeGreaterThanOrEqual(0.42);
  });

  test('prefers a usable component on the cited rulebook page over a stronger generic asset', () => {
    const generic = makeAsset(root, { id: 'generic-card', page: 0, classification: 'card', width: 1200, height: 900 });
    const cited = makeAsset(root, { id: 'cited-tile', page: 10, classification: 'tile', width: 520, height: 360 });
    fs.writeFileSync(manifestPath, JSON.stringify({ images: [generic, cited] }));

    const catalog = loadSourceVisualCatalog(manifestPath);
    const selection = selectSourceVisual({
      id: 'explore-site',
      source_pages: [10],
      section: 'Exploration et site',
      narration: 'Explorez le site indiqué.',
    }, catalog, '/fallback/page-10.png');

    expect(selection.kind).toBe('component');
    expect(selection.assetId).toBe('cited-tile');
  });

  test('falls back to the cited rulebook page when vision QA rejects every cited component', () => {
    const decorative = path.join(root, 'decorative.png');
    fs.writeFileSync(decorative, 'decorative');
    const selection = selectSourceVisual({ id: 'clean-up', source_pages: [13] }, {
      qualityReportPath: '/reviewed/asset-quality.json',
      assets: [{
        id: 'decorative-arrow',
        page_index: 12,
        is_component: true,
        renderPath: decorative,
        curation: { lowInformation: false, score: 0.8 },
        visualQuality: { primary_explanatory: false, quality_score: 10 },
      }],
    }, '/fallback/page-13.png');

    expect(selection.kind).toBe('rulebook-page-fallback');
    expect(selection.warning).toContain('cited rule page');
  });

  test('does not allow an unreviewed asset to bypass an enabled visual QA gate', () => {
    const unreviewed = path.join(root, 'unreviewed.png');
    fs.writeFileSync(unreviewed, 'unreviewed');
    const selection = selectSourceVisual({ id: 'unreviewed', source_pages: [8] }, {
      qualityReportPath: '/reviewed/asset-quality.json',
      assets: [{
        id: 'unreviewed-card',
        page_index: 8,
        is_component: true,
        renderPath: unreviewed,
        curation: { lowInformation: false, score: 0.9 },
        visualQuality: null,
      }],
    }, '/fallback/page-8.png');

    expect(selection.kind).toBe('rulebook-page-fallback');
  });

  test('uses an enabled semantic report to select only the scene-relevant asset', () => {
    const relevant = path.join(root, 'relevant.png');
    const other = path.join(root, 'other.png');
    fs.writeFileSync(relevant, 'relevant');
    fs.writeFileSync(other, 'other');
    const catalog = {
      qualityReportPath: '/reviewed/asset-quality.json',
      semanticReportPath: '/reviewed/scene-match.json',
      semanticBySceneId: new Map([['teach-research', { status: 'matched', selected_asset_id: 'research-track', relevance_score: 92 }]]),
      assets: [
        { id: 'research-track', page_index: 13, is_component: true, renderPath: relevant, curation: { lowInformation: false, score: 0.8 }, visualQuality: { primary_explanatory: true, quality_score: 85 } },
        { id: 'other-card', page_index: 13, is_component: true, renderPath: other, curation: { lowInformation: false, score: 0.9 }, visualQuality: { primary_explanatory: true, quality_score: 90 } },
      ],
    };
    const selection = selectSourceVisual({ id: 'teach-research', source_pages: [14] }, catalog, '/fallback/page-14.png');
    expect(selection.kind).toBe('component');
    expect(selection.assetId).toBe('research-track');
    expect(selection.semanticMatch.relevance_score).toBe(92);
  });

  test('preserves focused-page-crop kind, one-based source page, and provenance', () => {
    const crop = path.join(root, 'focused.png');
    fs.writeFileSync(crop, 'focused');
    const selection = selectSourceVisual({ id: 'teach-sell', source_pages: [3] }, {
      qualityReportPath: '/reviewed/asset-quality.json',
      semanticReportPath: '/reviewed/scene-match.json',
      semanticBySceneId: new Map([['teach-sell', { status: 'matched', selected_asset_id: 'sell-panel', relevance_score: 96 }]]),
      assets: [{
        id: 'sell-panel', source_page: 3, page_index: 2, visual_kind: 'focused-page-crop', type: 'focused-crop',
        is_component: true, renderPath: crop, curation: { lowInformation: false, score: 0.92 },
        visualQuality: { primary_explanatory: true, quality_score: 91 },
        provenance: { sourcePdfSha256: 'pdf-sha', sourcePage: 3, bbox: { x: 10, y: 20, width: 100, height: 200 }, assetHash: 'asset-sha' },
      }],
    }, '/fallback/page-3.png');

    expect(selection).toMatchObject({ kind: 'focused-page-crop', assetId: 'sell-panel', sourcePage: 3 });
    expect(selection.provenance).toMatchObject({ sourcePdfSha256: 'pdf-sha', sourcePage: 3, assetHash: 'asset-sha' });
  });

  test('uses explicit one-based source_page instead of confusing zero-based page_index', () => {
    const crop = path.join(root, 'page-2-region.png');
    fs.writeFileSync(crop, 'focused');
    const selection = selectSourceVisual({ id: 'teach-components', source_pages: [2], section: 'Composants du jeu' }, {
      qualityReportPath: '/reviewed/asset-quality.json',
      assets: [{
        id: 'page-2-region', source_page: 2, page_index: 1, visual_kind: 'focused-page-region', type: 'focused-crop',
        is_component: true, renderPath: crop, curation: { lowInformation: false, score: 0.95 },
        visualQuality: { primary_explanatory: true, quality_score: 91 },
      }],
    }, '/fallback/page-2.png');

    expect(selection).toMatchObject({ kind: 'focused-page-region', assetId: 'page-2-region', sourcePage: 2 });
  });

  test('keeps a truthful fallback when a high-quality candidate has no semantic match', () => {
    const unrelated = path.join(root, 'unrelated.png');
    fs.writeFileSync(unrelated, 'unrelated');
    const selection = selectSourceVisual({ id: 'teach-scoring', source_pages: [4] }, {
      qualityReportPath: '/reviewed/asset-quality.json',
      semanticReportPath: '/reviewed/scene-match.json',
      semanticBySceneId: new Map([['teach-scoring', { status: 'no-semantic-match', selected_asset_id: null, relevance_score: 28 }]]),
      assets: [{ id: 'unrelated-card', page_index: 3, is_component: true, renderPath: unrelated, type: 'card', curation: { lowInformation: false, score: 0.98 }, visualQuality: { primary_explanatory: true, quality_score: 98 } }],
    }, '/fallback/page-4.png');

    expect(selection.kind).toBe('rulebook-page-fallback');
    expect(selection.path).toBe('/fallback/page-4.png');
  });

  test('preserves an explicit reviewed visual assignment', () => {
    const explicit = path.join(root, 'reviewed.png');
    fs.writeFileSync(explicit, 'reviewed');
    const selection = selectSourceVisual({ id: 'reviewed', visual_asset: explicit }, { assets: [] }, '/fallback.png');
    expect(selection.kind).toBe('explicit-asset');
    expect(selection.path).toBe(explicit);
  });

  test('labels a rulebook page fallback when no usable component exists', () => {
    const selection = selectSourceVisual({ id: 'missing', source_pages: [9] }, { assets: [] }, '/fallback/page-9.png');
    expect(selection.kind).toBe('rulebook-page-fallback');
    expect(selection.warning).toContain('fell back');
  });
});
