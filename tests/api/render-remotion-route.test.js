const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const SAMPLE_SCRIPT_PATH = path.join(
  REPOSITORY_ROOT,
  'tests',
  'fixtures',
  'remotion',
  'sample-script.json',
);

jest.setTimeout(240000);

function startServer(app) {
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function baseUrl(server) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP test server address.');
  }
  return `http://127.0.0.1:${address.port}`;
}

function loadTestApp(outputDirectory) {
  const db = require('../../src/api/db.js').default;
  const { registerProjectPersistenceRoutes } = require('../../src/api/projectPersistenceRoutes.js');
  const { registerRemotionRenderRoutes } = require('../../src/api/remotionRenderRoutes.js');
  const app = express();
  app.use(express.json());
  registerProjectPersistenceRoutes(app, { db });
  registerRemotionRenderRoutes(app, { db, outputBaseDirectory: outputDirectory });
  return app;
}

describe('POST /api/render-remotion', () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    DB_DATA_DIR: process.env.DB_DATA_DIR,
    DB_DATA_FILE: process.env.DB_DATA_FILE,
    DB_IN_MEMORY: process.env.DB_IN_MEMORY,
  };
  let temporaryDirectory;
  let server;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-remotion-route-'));
    process.env.NODE_ENV = 'development';
    process.env.DB_DATA_DIR = temporaryDirectory;
    process.env.DB_DATA_FILE = path.join(temporaryDirectory, 'projects.json');
    delete process.env.DB_IN_MEMORY;
    jest.resetModules();
  });

  afterEach(async () => {
    await closeServer(server);
    server = undefined;
    jest.resetModules();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test('renders persisted scenes into one public timeline MP4', async () => {
    const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
    const app = loadTestApp(outputDirectory);
    server = await startServer(app);
    const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));

    const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Remotion route integration project',
        metadata: {},
        components: [],
        images: [],
        script: JSON.stringify({ scenes: sampleScenes }),
        audio: '',
        scenes: sampleScenes,
      }),
    });
    const savedProject = await saveResponse.json();

    expect(saveResponse.status).toBe(200);
    expect(savedProject).toEqual({ status: 'success', projectId: expect.any(Number) });

    const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: savedProject.projectId }),
    });
    const rendered = await renderResponse.json();

    expect(renderResponse.status).toBe(200);
    expect(rendered).toEqual({
      ok: true,
      projectId: String(savedProject.projectId),
      outputPath: expect.stringMatching(/^\/uploads\/remotion\/remotion-[^/]+\/mobius-tutorial\.mp4$/),
      outputPaths: [expect.stringMatching(/^\/uploads\/remotion\/remotion-[^/]+\/mobius-tutorial\.mp4$/)],
    });

    const renderedFiles = fs.readdirSync(outputDirectory, { recursive: true });
    const mp4Files = renderedFiles.filter((fileName) => fileName.endsWith('.mp4'));
    expect(mp4Files).toHaveLength(1);
    expect(fs.statSync(path.join(outputDirectory, mp4Files[0])).size).toBeGreaterThan(0);
  });
});
