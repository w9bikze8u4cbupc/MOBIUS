import { jest } from '@jest/globals';
import { previewChapterHandler } from '../../src/api/handlers/previewChapter.js';

describe('previewChapterHandler', () => {
  it('returns 400 on invalid payload', async () => {
    const req = { body: {}, query: {}, headers: {} };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res = { status };
    const next = jest.fn();

    await previewChapterHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
  });
});