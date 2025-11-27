jest.mock(
  'axios',
  () => ({ __esModule: true, default: { get: jest.fn() }, get: jest.fn() }),
  { virtual: true }
);
jest.mock(
  'fast-xml-parser',
  () => ({
    XMLParser: class {
      parse(xml) {
        const imageMatch = /<image>(.*?)<\/image>/.exec(xml || '');
        const thumbMatch = /<thumbnail>(.*?)<\/thumbnail>/.exec(xml || '');
        return { items: { item: { image: imageMatch?.[1] || null, thumbnail: thumbMatch?.[1] || null } } };
      }
    },
  }),
  { virtual: true }
);
jest.mock('pdf-to-img', () => ({ pdf: async function* pdf() {} }), { virtual: true });

import axios from 'axios';
import { fetchBggImages, normalizeImageAsset } from '../../src/services/imagePipeline.js';

describe('imagePipeline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('normalizes ImageAsset defaults', () => {
    const asset = normalizeImageAsset({ source: 'manual' });
    expect(asset.id).toBeTruthy();
    expect(asset.crops).toEqual([]);
    expect(asset.tags).toEqual([]);
    expect(asset.quality).toBeTruthy();
  });

  it('fetches and normalizes BGG xml payloads', async () => {
    axios.get.mockResolvedValue({
      data: '<items><item><image>http://image.jpg</image><thumbnail>http://thumb.jpg</thumbnail></item></items>',
    });

    const assets = await fetchBggImages('project-1', '123');
    expect(assets.length).toBe(2);
    expect(assets[0].source).toBe('bgg');
    expect(assets[0].originalUrl).toBe('http://image.jpg');
  });
});

