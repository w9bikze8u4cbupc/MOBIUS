jest.mock(
  'axios',
  () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, get: jest.fn(), post: jest.fn() }),
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
jest.mock('express', () => require('../utils/expressMock'), { virtual: true });
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('cheerio', () => ({}), { virtual: true });
jest.mock('openai', () => class OpenAI {}, { virtual: true });
jest.mock('pdf-to-img', () => ({ pdf: async function* pdf() {} }), { virtual: true });
jest.mock('fs-extra', () => ({ ensureDir: jest.fn() }), { virtual: true });
jest.mock('sharp', () => () => ({ resize: () => ({ toBuffer: async () => Buffer.from('') }) }), { virtual: true });
jest.mock('multer', () => {
  const multer = () => ({ single: () => (req, _res, next) => next() });
  multer.diskStorage = () => ({});
  return multer;
}, { virtual: true });
jest.mock('pdf-parse', () => jest.fn(), { virtual: true });
jest.mock('xml2js', () => ({ parseStringPromise: jest.fn() }), { virtual: true });
jest.mock('../../src/services/componentCropper.js', () => ({
  extractComponentsFromAllPages: jest.fn(),
  isJobInProgress: jest.fn(() => false),
  clearJobLock: jest.fn(),
  getJobStatus: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import express from 'express';
import { registerImageRoutes } from '../../src/api/imageRoutes.js';
import { appendImages, linkImagesToComponent, resetImageStore } from '../../src/services/imageStore.js';

describe('images api routes', () => {
  const fixtureDirectory = path.join(process.cwd(), 'data', '.image-route-test-fixtures');
  const sourceBytes = Buffer.from('89504e470d0a1a0a736f75726365', 'hex');
  const thumbnailBytes = Buffer.from('89504e470d0a1a0a7468756d626e61696c', 'hex');
  const sourcePath = path.join(fixtureDirectory, 'source.png');
  const thumbnailPath = path.join(fixtureDirectory, 'thumbnail.png');
  let server;
  let baseUrl;
  let app;

  beforeAll((done) => {
    fs.mkdirSync(fixtureDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, sourceBytes);
    fs.writeFileSync(thumbnailPath, thumbnailBytes);
    app = express();
    app.use(express.json());
    registerImageRoutes(app, { extractorApiKey: 'key', upload: { single: () => (req, _res, next) => next() } });
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetImageStore();
    jest.resetAllMocks();
  });

  it('returns component-link provenance from ordinary image mutations', async () => {
    axios.get.mockResolvedValue({
      data: '<items><item><image>http://image.jpg</image><thumbnail>http://thumb.jpg</thumbnail></item></items>',
    });

    const firstFetchRes = await fetch(`${baseUrl}/api/projects/demo/images/fetch-bgg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bggUrl: '123' }),
    });
    const firstFetchPayload = await firstFetchRes.json();
    const linkedImageId = firstFetchPayload.images[0].id;
    linkImagesToComponent('demo', 'monster-token', [linkedImageId]);

    const secondFetchRes = await fetch(`${baseUrl}/api/projects/demo/images/fetch-bgg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bggUrl: '123' }),
    });
    const secondFetchPayload = await secondFetchRes.json();
    expect(secondFetchPayload.componentImageLinkDetails['monster-token'][linkedImageId]).toEqual({ origin: 'manual' });

    const patchRes = await fetch(`${baseUrl}/api/projects/demo/images/${linkedImageId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['approved'] }),
    });
    const patchPayload = await patchRes.json();
    expect(patchPayload.componentImageLinkDetails['monster-token'][linkedImageId]).toEqual({ origin: 'manual' });
  });

  it('fetches BGG images and persists them', async () => {
    axios.get.mockResolvedValue({
      data: '<items><item><image>http://image.jpg</image><thumbnail>http://thumb.jpg</thumbnail></item></items>',
    });

    const fetchRes = await fetch(`${baseUrl}/api/projects/demo/images/fetch-bgg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bggUrl: '123' }),
    });
    const fetchPayload = await fetchRes.json();
    expect(fetchPayload.images.length).toBe(2);

    const listRes = await fetch(`${baseUrl}/api/projects/demo/images`);
    const listPayload = await listRes.json();
    expect(listPayload.images.length).toBe(2);
    expect(listPayload.images.every((image) => image.previewKind === 'unavailable')).toBe(true);
  });

  it('updates crops and tags', async () => {
    axios.get.mockResolvedValue({ data: '<items><item><image>http://image.jpg</image></item></items>' });
    const initialRes = await fetch(`${baseUrl}/api/projects/demo/images/fetch-bgg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bggUrl: '123' }),
    });
    const initialPayload = await initialRes.json();
    const target = initialPayload.images[0];

    const patchRes = await fetch(`${baseUrl}/api/projects/demo/images/${target.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tags: ['box'],
        crops: [{ id: 'crop1', x: 0, y: 0, w: 10, h: 10, purpose: 'box' }],
      }),
    });
    const patchPayload = await patchRes.json();
    const updated = patchPayload.images.find((img) => img.id === target.id);
    expect(updated.tags).toContain('box');
    expect(updated.crops[0].purpose).toBe('box');
  });

  it('links images to components', async () => {
    axios.get.mockResolvedValue({ data: '<items><item><image>http://image.jpg</image></item></items>' });
    const initialRes = await fetch(`${baseUrl}/api/projects/demo/images/fetch-bgg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bggUrl: '123' }),
    });
    const initialPayload = await initialRes.json();
    const target = initialPayload.images[0];

    const linkRes = await fetch(`${baseUrl}/api/projects/demo/components/token/images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageIds: [target.id] }),
    });
    const linkPayload = await linkRes.json();
    expect(linkPayload.componentImages.token).toContain(target.id);
  });

  it('keeps a blank board-like candidate as a review suggestion and clears stale automatic links', async () => {
    appendImages('demo', [{
      id: 'blank-board',
      source: 'hephaestus',
      label: 'Native board image',
      type: 'board',
      metadata: { classification: 'board', page: 2, confidence: 1, curation: { candidate: true, score: 1, lowInformation: true } },
      curation: { candidate: true, score: 1, lowInformation: true },
    }]);
    linkImagesToComponent('demo', 'game-board', ['stale-auto'], { origin: 'auto' });

    const response = await fetch(`${baseUrl}/api/projects/demo/images/auto-match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameName: 'Abyss',
        components: [{ id: 'game-board', name: 'game board', category: 'board', sourcePage: 2, reviewRequired: true, eligibility: 'setup', inferenceReason: 'Setup-derived physical object; confirm this component before matching.', matchEligible: true }],
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.componentImages['game-board']).toBeUndefined();
    expect(payload.candidates['game-board'][0]).toMatchObject({ imageId: 'blank-board', autoLink: false });
    expect(payload.candidates['game-board'][0].reasons).toContain('low-information asset; operator review required');
  });

  it('rejects review-required action text from the automatic matching queue', async () => {
    const response = await fetch(`${baseUrl}/api/projects/demo/images/auto-match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        components: [{ id: 'instruction', name: 'Attach token', category: 'token', reviewRequired: true, eligibility: 'setup', inferenceReason: 'Setup-derived physical object; confirm this component before matching.', matchEligible: true }],
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/strict physical component inventory/i);
  });

  it('hydrates safe project-scoped review assets and retains component-link provenance', async () => {
  appendImages('abyss-mstkmf2r-4mlb', [{
    id: 'heph-monster', name: 'Monster token', label: 'Curated monster token', source: 'bgg', type: 'token',
    originalUrl: 'https://untrusted.example/monster.png', fileKey: sourcePath,
    width: 600, height: 800, tags: ['monster'], metadata: { page: 4, classification: 'token', curation: { candidate: true, score: 0.98 } },
    quality: { score: 0.98, notes: 'private note' },
  }, {
    id: 'missing-local-asset', source: 'hephaestus', fileKey: 'C:/missing/asset.png', thumbnailKey: 'C:/missing/thumb.png',
  }]);
  linkImagesToComponent('abyss-mstkmf2r-4mlb', 'monster-tokens', ['heph-monster']);

  const response = await fetch(`${baseUrl}/api/projects/abyss-mstkmf2r-4mlb/images`);
  const payload = await response.json();
  expect(response.status).toBe(200);
  expect(payload.images).toHaveLength(1);
  expect(payload.images[0]).toMatchObject({
    id: 'heph-monster', name: 'Monster token', source: 'bgg', page: 4, classification: 'token', previewKind: 'source',
    localUrl: '/api/projects/abyss-mstkmf2r-4mlb/images/heph-monster/file',
    thumbnailUrl: '/api/projects/abyss-mstkmf2r-4mlb/images/heph-monster/file?variant=thumbnail',
  });
  expect(payload.images[0]).not.toHaveProperty('fileKey');
  expect(payload.images[0]).not.toHaveProperty('thumbnailKey');
  expect(payload.images[0]).not.toHaveProperty('originalUrl');
  expect(payload.componentImageLinkDetails).toEqual({ 'monster-tokens': { 'heph-monster': { origin: 'manual' } } });
});

it('rejects invalid project IDs and assets from another project deterministically', async () => {
  appendImages('other-project', [{ id: 'foreign-image', source: 'hephaestus' }]);
  const invalidProject = await fetch(`${baseUrl}/api/projects/Abyss!/images`);
  expect(invalidProject.status).toBe(400);
  await expect(invalidProject.json()).resolves.toMatchObject({ code: 'PROJECT_ID_INVALID' });

  const foreignLink = await fetch(`${baseUrl}/api/projects/abyss-mstkmf2r-4mlb/components/monster-tokens/images`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageIds: ['foreign-image'] }),
  });
  expect(foreignLink.status).toBe(400);
  await expect(foreignLink.json()).resolves.toMatchObject({ code: 'IMAGE_ASSET_INVALID' });
});

it('serves a canonical current-project thumbnail with its exact image type and thumbnail bytes', async () => {
  appendImages('thumbnail-project', [{
    id: 'board_preview-1', source: 'rulebook', fileKey: sourcePath, thumbnailKey: thumbnailPath,
  }]);

  const inventory = await (await fetch(`${baseUrl}/api/projects/thumbnail-project/images`)).json();
  expect(inventory.images).toEqual([expect.objectContaining({
    id: 'board_preview-1', previewKind: 'thumbnail',
    thumbnailUrl: '/api/projects/thumbnail-project/images/board_preview-1/file?variant=thumbnail',
  })]);
  expect(JSON.stringify(inventory)).not.toContain(sourcePath);

  const thumbnailResponse = await fetch(`${baseUrl}/api/projects/thumbnail-project/images/board_preview-1/file?variant=thumbnail`);
  expect(thumbnailResponse.status).toBe(200);
  expect(thumbnailResponse.headers.get('content-type')).toBe('image/png');
  expect(thumbnailResponse.headers.get('cache-control')).toBe('private, max-age=300, must-revalidate, no-transform');
  await expect(thumbnailResponse.arrayBuffer()).resolves.toEqual(thumbnailBytes.buffer.slice(thumbnailBytes.byteOffset, thumbnailBytes.byteOffset + thumbnailBytes.byteLength));

  const sourceResponse = await fetch(`${baseUrl}/api/projects/thumbnail-project/images/board_preview-1/file`);
  expect(sourceResponse.status).toBe(200);
  await expect(sourceResponse.arrayBuffer()).resolves.toEqual(sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength));
});

it('rejects malformed, foreign, unknown, and traversal thumbnail requests without exposing paths', async () => {
  appendImages('owned-project', [{ id: 'owned-image', source: 'rulebook', fileKey: sourcePath }]);
  appendImages('forbidden-project', [{ id: 'forbidden-image', source: 'rulebook', fileKey: 'C:/outside-project/image.png' }]);

  const foreign = await fetch(`${baseUrl}/api/projects/foreign-project/images/owned-image/file?variant=thumbnail`);
  expect(foreign.status).toBe(404);
  await expect(foreign.json()).resolves.toEqual(expect.objectContaining({ code: 'IMAGE_NOT_FOUND' }));

  const unknown = await fetch(`${baseUrl}/api/projects/owned-project/images/unknown-image/file?variant=thumbnail`);
  expect(unknown.status).toBe(404);
  await expect(unknown.json()).resolves.toEqual(expect.objectContaining({ code: 'IMAGE_NOT_FOUND' }));

  for (const unsafeId of ['..%2Fowned-image', '%ZZ']) {
    const malformed = await fetch(`${baseUrl}/api/projects/owned-project/images/${unsafeId}/file?variant=thumbnail`);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual(expect.objectContaining({ code: 'IMAGE_ASSET_INVALID' }));
  }

  const forbidden = await fetch(`${baseUrl}/api/projects/forbidden-project/images/forbidden-image/file?variant=thumbnail`);
  expect(forbidden.status).toBe(403);
  const forbiddenPayload = await forbidden.json();
  expect(forbiddenPayload).toEqual(expect.objectContaining({ code: 'IMAGE_FILE_FORBIDDEN' }));
  expect(JSON.stringify(forbiddenPayload)).not.toContain('C:');
});

});