import fs from 'fs';
import path from 'path';
import { curateHephaestusAssets } from '../../src/services/hephaestusCuration.js';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'hephaestus', 'duplicate-assets.json');
const fixtureAssets = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

describe('HEPHAESTUS deterministic curation', () => {
  test('preserves raw assets, groups exact duplicates, and marks low-information fragments', () => {
    const result = curateHephaestusAssets(fixtureAssets);
    expect(result.stats).toMatchObject({ rawCount: 4, duplicateCount: 1, curatedCount: 2, lowPriorityCount: 2 });

    const duplicate = result.assets.find((asset) => asset.id === 'card-front-2');
    expect(duplicate.curation).toMatchObject({
      isDuplicate: true,
      candidate: false,
      canonicalAssetId: 'card-front-1',
      lowInformation: false,
    });

    const fragment = result.assets.find((asset) => asset.id === 'blue-star-fragment');
    expect(fragment.curation.candidate).toBe(false);
    expect(fragment.curation.lowInformation).toBe(true);
    expect(fragment.curation.reasons.join(' ')).toMatch(/decorative|glyph|tiny/i);

    expect(result.assets.find((asset) => asset.id === 'card-front-1').file_path).toContain('card-front-1.png');
    expect(result.assets.find((asset) => asset.id === 'card-front-1').thumbnail_path).toContain('thumb');
  });
});

  test('groups repeated native placements by xref embedded in actual HEPHAESTUS IDs', () => {
    const result = curateHephaestusAssets([
      { id: 'p1_img0_xref77', type: 'card', is_component: true, dimensions: { width: 600, height: 900 }, file_path: 'missing/a.png' },
      { id: 'p4_img2_xref77', type: 'card', is_component: true, dimensions: { width: 600, height: 900 }, file_path: 'missing/b.png' },
    ]);
    expect(result.stats.duplicateCount).toBe(1);
    expect(result.assets[1].curation).toMatchObject({ isDuplicate: true, canonicalAssetId: 'p1_img0_xref77' });
  });

  test('prefers identical pixel content over distinct xrefs when grouping review candidates', () => {
    const result = curateHephaestusAssets([
      {
        id: 'p3_img3_xref338',
        type: 'token',
        is_component: true,
        dimensions: { width: 219, height: 219 },
        contentHash: 'abyss-blue-race-icon',
      },
      {
        id: 'p3_img35_xref339',
        type: 'token',
        is_component: true,
        dimensions: { width: 219, height: 219 },
        contentHash: 'abyss-blue-race-icon',
      },
    ]);

    expect(result.stats).toMatchObject({ rawCount: 2, duplicateCount: 1, curatedCount: 1 });
    expect(result.assets[1].curation).toMatchObject({
      isDuplicate: true,
      canonicalAssetId: 'p3_img3_xref338',
      candidate: false,
    });
  });

});
