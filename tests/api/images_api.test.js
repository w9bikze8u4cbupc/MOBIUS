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

import axios from 'axios';
import express from 'express';
import { registerImageRoutes } from '../../src/api/imageRoutes.js';
import { resetImageStore } from '../../src/services/imageStore.js';

describe('images api routes', () => {
  let server;
  let baseUrl;
  let app;

  beforeAll((done) => {
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
  });

  beforeEach(() => {
    resetImageStore();
    jest.resetAllMocks();
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
});

