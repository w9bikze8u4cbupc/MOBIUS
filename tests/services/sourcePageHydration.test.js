const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { hydrateSourcePageVisuals } = require('../../src/services/sourcePageVisuals.js');
const pixels = fs.readFileSync(path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png'));
test('cross-root pages hydrate over scoped API reads and replay without extraction or download', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-page-hydration-'));
  const fetchImpl = jest.fn(async (url) => ({ ok: true, json: async () => url.endsWith('/source-pdf')
    ? { sourcePdf: { sha256: 'a'.repeat(64), pageCount: 1 } }
    : { images: [{ id: 'page', source: 'rulebook', tags: ['page-1'] }] }, arrayBuffer: async () => pixels }));
  try {
    const options = { baseUrl: 'http://fixture', projectId: 'fixture', sourceSha256: 'a'.repeat(64), pageCount: 1, pageDir: dir, fetchImpl };
    const first = await hydrateSourcePageVisuals(options);
    expect(first).toMatchObject({ reused: false, extractionCalls: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][0]).toBe('http://fixture/api/projects/fixture/images/page/file');
    expect((await hydrateSourcePageVisuals(options)).reused).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await expect(hydrateSourcePageVisuals({ ...options, sourceSha256: 'b'.repeat(64) })).rejects.toThrow('IDENTITY_MISMATCH');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('missing pages cannot create a false ready checkpoint', async () => {
  const fetchImpl = jest.fn(async (url) => ({ ok: true, json: async () => url.endsWith('/source-pdf')
    ? { sourcePdf: { sha256: 'a'.repeat(64), pageCount: 1 } } : { images: [] } }));
  await expect(hydrateSourcePageVisuals({ baseUrl: 'http://fixture', projectId: 'fixture', sourceSha256: 'a'.repeat(64), pageCount: 1,
    pageDir: path.join(os.tmpdir(), 'not-created-mobius-pages'), fetchImpl })).rejects.toMatchObject({ code: 'SOURCE_PAGE_VISUALS_MISSING' });
});
