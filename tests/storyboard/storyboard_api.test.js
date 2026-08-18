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
    expect(payload.code).toBe('INGESTION_MANIFEST_MISSING');
  });
});


describe('/api/storyboard validation', () => {
  it('rejects a truthy malformed manifest before it reaches storyboard generation', async () => {
    const started = await startServer();
    const validManifest = runIngestionPipeline({
      documentId: fixture.documentId,
      metadata: fixture.metadata,
      pages: fixture.pages,
      bggMetadata: fixture.bgg,
    });
    try {
      const response = await fetch(`${started.baseUrl}/api/storyboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingestionManifest: {
            ...validManifest,
            outline: [{}],
            components: [{}],
            assets: { ...validManifest.assets, pages: [], components: [{}] },
          },
          options: {},
        }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('INGESTION_MANIFEST_INVALID');
    } finally {
      started.server.close();
    }
  });
});


test('builds canonical scenes from source-complete script sections rather than the ingestion outline', async () => {
  const started = await startServer();
  const manifest = runIngestionPipeline({
    documentId: fixture.documentId,
    metadata: fixture.metadata,
    pages: fixture.pages,
    bggMetadata: fixture.bgg,
  });
  const scriptPackage = {
    sections: [
      { id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board in the center.', visualDirections: [{ instruction: 'Show board.', onScreenText: 'Setup', camera: '', highlights: [], arrows: [], componentRefs: ['board'] }], sources: [{ section: 1, startOffset: 0, endOffset: 20 }] },
      { id: 'section-02', order: 2, title: 'Turn', spokenText: 'Choose one card and resolve its effect.', visualDirections: [], sources: [{ section: 2, startOffset: 21, endOffset: 60 }] },
    ],
  };
  try {
    const response = await fetch(`${started.baseUrl}/api/storyboard`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingestionManifest: manifest, scriptPackage, options: { language: 'french' } }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.manifest).toMatchObject({ version: '1.2.0', language: 'french' });
    expect(payload.manifest.scenes).toHaveLength(2);
    expect(payload.manifest.scenes.map((scene) => scene.spokenText)).toEqual(scriptPackage.sections.map((section) => section.spokenText));
    expect(payload.manifest.scenes[0]).toMatchObject({
      sectionId: 'section-01', visualDirections: scriptPackage.sections[0].visualDirections, sources: scriptPackage.sections[0].sources,
    });
  } finally {
    started.server.close();
  }
});

test('rejects malformed script package input instead of deriving outline scenes', async () => {
  const started = await startServer();
  try {
    const response = await fetch(`${started.baseUrl}/api/storyboard`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingestionManifest: runIngestionPipeline({ documentId: fixture.documentId, metadata: fixture.metadata, pages: fixture.pages }), scriptPackage: { sections: [{ id: 'bad', order: 1, title: 'Bad', spokenText: 'No sources', visualDirections: [], sources: [] }] } }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('STORYBOARD_INVALID_SCRIPT_PACKAGE');
  } finally {
    started.server.close();
  }
});
