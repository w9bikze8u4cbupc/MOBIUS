process.env.NODE_ENV = 'test';

const http = require('http');
const { registerPhaseERoutes } = require('../../src/api/ingestionRoutes.js');
const { runIngestionPipeline, normalizeBggMetadata } = require('../../src/ingestion/pipeline');
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

describe('/api/ingest', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(() => server && server.close());

  it('returns a contract-compliant manifest for valid input', async () => {
    const response = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: fixture.documentId,
        metadata: fixture.metadata,
        pages: fixture.pages,
        bggMetadata: fixture.bgg,
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.manifest.document.id).toBe(fixture.documentId);
    expect(payload.manifest.outline.length).toBeGreaterThan(0);
    expect(payload.manifest.components.length).toBe(payload.manifest.outline.length);
  });

  it('responds with a clear error code when required fields are missing', async () => {
    const response = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: {}, pages: [] }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('INGEST_BAD_REQUEST');
  });
});
