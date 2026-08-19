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
import { createPdfPageRenderer, ContextualPdfRenderError, ensurePdfJsNodeCompatibility, fetchBggImages, normalizeImageAsset } from '../../src/services/imagePipeline.js';

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



describe('contextual PDF renderer', () => {
  it('installs the Node 20.16 builtin-module compatibility only when missing', () => {
    const runtime = {};
    const requireBuiltin = jest.fn(() => ({ createRequire: jest.fn() }));
    expect(ensurePdfJsNodeCompatibility({ processRef: runtime, requireBuiltin })).toBe(true);
    expect(typeof runtime.getBuiltinModule).toBe('function');
    expect(runtime.getBuiltinModule('module')).toEqual({ createRequire: expect.any(Function) });
    expect(runtime.getBuiltinModule('not-a-builtin')).toBeUndefined();
    expect(ensurePdfJsNodeCompatibility({ processRef: runtime, requireBuiltin })).toBe(false);
  });

  it('uses an absolute path and profile-derived scale with argument-object invocation', async () => {
    const pdf = jest.fn(async () => ({ length: 12, [Symbol.asyncIterator]: async function* pages() {} }));
    const render = createPdfPageRenderer({
      loadPdf: async () => pdf,
      processRef: { getBuiltinModule: jest.fn() },
      resolvePath: (value) => `ABSOLUTE:${value}`,
    });
    const result = await render('C:\\upload dir\\ABYSS.pdf', { dpi: 144 });

    expect(pdf).toHaveBeenCalledWith('ABSOLUTE:C:\\upload dir\\ABYSS.pdf', { scale: 2 });
    expect(result.pageCount).toBe(12);
  });

  it.each([
    [{ code: 'ERR_MODULE_NOT_FOUND' }, 'CONTEXTUAL_RENDER_MODULE_NOT_FOUND'],
    [{ code: 'ENOENT' }, 'CONTEXTUAL_RENDER_SOURCE_UNREADABLE'],
    [new Error('process.getBuiltinModule is not a function'), 'CONTEXTUAL_RENDER_NODE_RUNTIME_UNSUPPORTED'],
    [new Error('renderer crashed'), 'CONTEXTUAL_RENDER_IN_PROCESS_FAILURE'],
  ])('maps renderer boundary failures to sanitized subcodes', async (cause, subcode) => {
    const render = createPdfPageRenderer({
      loadPdf: async () => { throw cause; },
      processRef: { getBuiltinModule: jest.fn() },
    });
    await expect(render('fixture.pdf')).rejects.toEqual(expect.objectContaining({
      name: 'ContextualPdfRenderError', subcode,
    }));
  });

  it('reports an immutable runtime as a typed compatibility failure', () => {
    expect(() => ensurePdfJsNodeCompatibility({ processRef: Object.freeze({}), requireBuiltin: jest.fn() }))
      .toThrow(ContextualPdfRenderError);
  });
});