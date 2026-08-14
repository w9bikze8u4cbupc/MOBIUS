import express from 'express';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

const environmentKeys = [
  'NODE_ENV',
  'DB_DATA_DIR',
  'DB_DATA_FILE',
  'DB_IN_MEMORY',
  'API_KEY',
] as const;

type EnvironmentKey = (typeof environmentKeys)[number];
type EnvironmentSnapshot = Record<EnvironmentKey, string | undefined>;

function captureEnvironment(): EnvironmentSnapshot {
  return environmentKeys.reduce((snapshot, key) => {
    snapshot[key] = process.env[key];
    return snapshot;
  }, {} as EnvironmentSnapshot);
}

function restoreEnvironment(snapshot: EnvironmentSnapshot) {
  for (const key of environmentKeys) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function startServer(app: express.Express): Promise<http.Server> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
  return server;
}

async function closeServer(server: http.Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function getBaseUrl(server: http.Server) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected test server to have a TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

function loadPersistenceApp() {
  const db = require('../../src/api/db.js').default;
  const {
    registerProjectPersistenceRoutes,
  } = require('../../src/api/projectPersistenceRoutes.js');
  const { getProjectState } = require('../../src/api/renderJobConfig.js');
  const app = express();
  app.use(express.json());
  registerProjectPersistenceRoutes(app, { db });
  return { app, getProjectState };
}

describe('/save-project persistence', () => {
  const originalEnvironment = captureEnvironment();
  let temporaryDirectory: string;
  let activeServer: http.Server | undefined;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-save-project-'));
    process.env.NODE_ENV = 'development';
    process.env.DB_DATA_DIR = temporaryDirectory;
    process.env.DB_DATA_FILE = path.join(temporaryDirectory, 'projects.json');
    delete process.env.DB_IN_MEMORY;
    process.env.API_KEY = 'legacy-load-test-key';
    jest.resetModules();
  });

  afterEach(async () => {
    await closeServer(activeServer);
    activeServer = undefined;
    jest.resetModules();
    restoreEnvironment(originalEnvironment);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('persists a project across a server restart and hydrates its render state', async () => {
    const firstApp = loadPersistenceApp();
    activeServer = await startServer(firstApp.app);

    const projectContext = {
      version: 1,
      projectId: 'sushi-go-approved',
      gameName: 'Sushi Go',
      language: 'english',
      rulebookText: 'Choose a card, then reveal it together.',
      rulebookPages: [{ number: 1, text: 'Choose a card, then reveal it together.' }],
      components: Array.from({ length: 9 }, (_, index) => ({
        id: `component-${index + 1}`,
        name: `Sushi Go component ${index + 1}`,
      })),
      metadata: { publisher: 'Gamewright', difficulty: 'beginner' },
      images: [{ id: 'card-image-1', path: 'uploads/card-1.png' }],
      componentImageLinks: { 'component-1': ['card-image-1'] },
      script: 'Choose a card, then reveal it together.',
      generatedScript: true,
      activeStepId: 'script',
      completedStepIds: ['project', 'metadata', 'ingestion', 'images'],
    };
    const project = {
      name: 'Restart-safe project',
      metadata: {
        gameName: 'Sushi Go',
        difficulty: 'beginner',
        ingestionManifest: { version: '1.0.0', document: { title: 'Sushi Go Rules' } },
        storyboardManifest: { storyboardContractVersion: '1.1.0', scenes: [] },
      },
      projectContext,
      components: [{ id: 'card-1', type: 'card', quantity: 108 }],
      images: [{ id: 'card-image-1', path: 'uploads/card-1.png' }],
      script: 'Choose a card, then reveal it together.',
      audio: 'uploads/narration.mp3',
    };

    const createResponse = await fetch(`${getBaseUrl(activeServer)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(created).toEqual({ status: 'success', projectId: expect.any(Number) });
    expect(fs.existsSync(process.env.DB_DATA_FILE as string)).toBe(true);

    await closeServer(activeServer);
    activeServer = undefined;

    // A fresh module registry simulates a server restart: db.js reloads the JSON
    // store and route registration must repopulate the process-local render Map.
    jest.resetModules();
    const restartedApp = loadPersistenceApp();
    activeServer = await startServer(restartedApp.app);

    const loadResponse = await fetch(
      `${getBaseUrl(activeServer)}/load-project/${created.projectId}`,
      { headers: { 'x-api-key': 'legacy-load-test-key' } },
    );
    const loaded = await loadResponse.json();

    const persistedMetadata = { ...project.metadata, projectContext };
    expect(loadResponse.status).toBe(200);
    expect(loaded).toEqual({
      id: created.projectId,
      name: project.name,
      metadata: persistedMetadata,
      projectContext,
      components: project.components,
      images: project.images,
      script: project.script,
      audio: project.audio,
      created_at: expect.any(String),
    });
    expect(loaded.projectContext).toMatchObject({
      gameName: 'Sushi Go',
      language: 'english',
      rulebookText: projectContext.rulebookText,
      components: expect.arrayContaining([expect.objectContaining({ name: 'Sushi Go component 9' })]),
      componentImageLinks: projectContext.componentImageLinks,
      script: project.script,
    });
    expect(restartedApp.getProjectState(created.projectId)).toEqual({
      projectId: String(created.projectId),
      name: project.name,
      metadata: persistedMetadata,
      projectContext,
      components: project.components,
      images: project.images,
      script: project.script,
      audio: project.audio,
      ingestionManifest: project.metadata.ingestionManifest,
      storyboardManifest: project.metadata.storyboardManifest,
      resolution: undefined,
      created_at: loaded.created_at,
    });
  });
});
