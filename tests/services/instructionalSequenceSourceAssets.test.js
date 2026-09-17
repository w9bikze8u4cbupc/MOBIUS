const { instructionalSequenceSourceAssets } = require('../../src/services/instructionalSequenceSourceAssets.cjs');

test('normalizes an assetId-only legacy sequence from immutable frame source identities', () => {
  expect(instructionalSequenceSourceAssets({
    assetId: 'track',
    frames: [{ sourceImageSha256: 'image-sha', sourcePdfSha256: 'pdf-sha' }],
  })).toEqual([{ assetId: 'track', sourceImageSha256: 'image-sha', sourcePdfSha256: 'pdf-sha' }]);
});

test('fills a legacy incomplete declared source graph only from its own frames', () => {
  expect(instructionalSequenceSourceAssets({
    sourceAssets: [{ assetId: 'track' }],
    frames: [{ sourceImageSha256: 'image-sha', sourcePdfSha256: 'pdf-sha' }],
  })).toEqual([{ assetId: 'track', sourceImageSha256: 'image-sha', sourcePdfSha256: 'pdf-sha' }]);
  expect(instructionalSequenceSourceAssets({ assetId: 'track', frames: [] }))
    .toEqual([{ assetId: 'track' }]);
});
