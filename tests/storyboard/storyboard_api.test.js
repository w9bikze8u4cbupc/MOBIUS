process.env.NODE_ENV = 'test';

const http = require('http');
const { runIngestionPipeline } = require('../../src/ingestion/pipeline');
const { registerPhaseERoutes } = require('../../src/api/ingestionRoutes.js');
const { normalizeBggMetadata } = require('../../src/ingestion/pipeline');
const { validateIngestionManifest } = require('../../src/validators/ingestionValidator');
const { generateStoryboard } = require('../../src/storyboard/generator');
const { validateStoryboard } = require('../../src/validators/storyboardValidator');
const fixture = require('../fixtures/ingestion/rulebook-good.json');

function startServer() {
  return new Promise((resolve) => {
    const routes = new Map();
    const app = {
      post: (path, handler) => routes.set(path, handler)
    };

    registerPhaseERoutes(app, {
      runIngestionPipeline,
      normalizeBggMetadata,
      validateIngestionManifest,
      generateStoryboard,
      validateStoryboard
    });

    const server = http.createServer(async (req, res) => {
      const handler = routes.get(req.url);
      if (!handler) {
        res.statusCode = 404;
        return res.end();
      }

      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const resShim = {
        status(code) {
          res.statusCode = code;
          return this;
        },
        json(payload) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        }
      };

      handler({ body }, resShim);
    });

    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('/api/storyboard', () => {
  let server;
  let baseUrl;
  let ingestionManifest;

  beforeAll(async () => {
    ingestionManifest = runIngestionPipeline({
      documentId: fixture.documentId,
      metadata: fixture.metadata,
      pages: fixture.pages,
      bggMetadata: fixture.bgg,
    });
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(() => server && server.close());

  it('generates a storyboard manifest from an ingestion payload', async () => {
    const response = await fetch(`${baseUrl}/api/storyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingestionManifest, options: { includeOverlayHashes: true } }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.manifest.scenes.length).toBe(ingestionManifest.outline.length);
    expect(payload.manifest.scenes[0]).toHaveProperty('id');
  });

  it('rejects missing ingestion manifests', async () => {
    const response = await fetch(`${baseUrl}/api/storyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: {} }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('STORYBOARD_BAD_REQUEST');
  });
});
