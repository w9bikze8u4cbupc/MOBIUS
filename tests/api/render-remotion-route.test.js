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

function loadTestApp(outputDirectory, remotionOptions = {}) {
  const db = require('../../src/api/db.js').default;
  const { registerProjectPersistenceRoutes } = require('../../src/api/projectPersistenceRoutes.js');
  const { registerRemotionRenderRoutes } = require('../../src/api/remotionRenderRoutes.js');
  const app = express();
  app.use(express.json());
  registerProjectPersistenceRoutes(app, { db });
  registerRemotionRenderRoutes(app, {
    db,
    outputBaseDirectory: outputDirectory,
    ...remotionOptions,
  });
  return app;
}

describe('POST /api/render-remotion', () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    DB_DATA_DIR: process.env.DB_DATA_DIR,
    DB_DATA_FILE: process.env.DB_DATA_FILE,
    DB_IN_MEMORY: process.env.DB_IN_MEMORY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  };
  let temporaryDirectory;
  let server;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-remotion-route-'));
    process.env.NODE_ENV = 'development';
    process.env.DB_DATA_DIR = temporaryDirectory;
    process.env.DB_DATA_FILE = path.join(temporaryDirectory, 'projects.json');
    delete process.env.DB_IN_MEMORY;
    process.env.ELEVENLABS_API_KEY = '';
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

  test('adds continuous project-owned background music to persisted scenes before rendering', async () => {
    const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
    const outputPath = path.join(outputDirectory, 'mobius-tutorial.mp4');
    const musicUploadDirectory = path.join(temporaryDirectory, 'uploaded-music');
    const runRemotionRender = jest.fn(async ({ scenes }) => ({ outputPaths: [outputPath], scenes }));
    const app = loadTestApp(outputDirectory, { runRemotionRender, backgroundMusicUploadDirectory: musicUploadDirectory });
    server = await startServer(app);
    const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));

    const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Project with background music',
        metadata: {},
        components: [],
        images: [],
        script: JSON.stringify({ scenes: sampleScenes }),
        audio: '',
        scenes: sampleScenes,
      }),
    });
    const savedProject = await saveResponse.json();

    const musicPayload = new FormData();
    musicPayload.append(
      'backgroundMusic',
      new Blob([Buffer.from('uploaded-music-fixture')], { type: 'audio/wav' }),
      'test-audio.wav',
    );
    musicPayload.append('volume', '0.12');
    const uploadResponse = await fetch(
      `${baseUrl(server)}/api/render-remotion/background-music?projectId=${savedProject.projectId}`,
      { method: 'POST', body: musicPayload },
    );
    const uploadedMusic = await uploadResponse.json();

    expect(uploadResponse.status).toBe(201);
    expect(uploadedMusic).toEqual({
      ok: true,
      backgroundMusicPath: expect.stringMatching(new RegExp(`^/uploads/remotion-music/${savedProject.projectId}/remotion-music-.+\\.wav$`)),
    });
    expect(fs.existsSync(path.join(
      musicUploadDirectory,
      'remotion-music',
      String(savedProject.projectId),
      path.basename(uploadedMusic.backgroundMusicPath),
    ))).toBe(true);

    const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: savedProject.projectId }),
    });

    expect(renderResponse.status).toBe(200);
    expect(runRemotionRender).toHaveBeenCalledWith(expect.objectContaining({
      scenes: expect.arrayContaining([
        expect.objectContaining({
          backgroundMusicFile: path.join(
            REPOSITORY_ROOT,
            'src',
            'api',
            uploadedMusic.backgroundMusicPath.slice(1),
          ),
          backgroundMusicVolume: 0.12,
          backgroundMusicStartFrom: 0,
        }),
        expect.objectContaining({
          backgroundMusicStartFrom: sampleScenes[0].durationInFrames,
        }),
      ]),
    }));
  });

  test('prepares a bundled background-music track when the operator does not upload one', async () => {
    const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
    const outputPath = path.join(outputDirectory, 'mobius-tutorial.mp4');
    const musicUploadDirectory = path.join(temporaryDirectory, 'uploaded-music');
    const defaultMusicPath = path.join(temporaryDirectory, 'mobius-default.mp3');
    fs.writeFileSync(defaultMusicPath, Buffer.from('bundled-music-fixture'));
    const runRemotionRender = jest.fn(async ({ scenes }) => ({ outputPaths: [outputPath], scenes }));
    const app = loadTestApp(outputDirectory, {
      runRemotionRender,
      backgroundMusicUploadDirectory: musicUploadDirectory,
      defaultBackgroundMusicFile: defaultMusicPath,
    });
    server = await startServer(app);
    const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));

    const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bundled music project', metadata: {}, components: [], images: [], script: '', audio: '', scenes: sampleScenes }),
    });
    const savedProject = await saveResponse.json();
    const prepareResponse = await fetch(
      `${baseUrl(server)}/api/render-remotion/default-background-music?projectId=${savedProject.projectId}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volume: 0.2 }) },
    );
    const preparedMusic = await prepareResponse.json();

    expect(prepareResponse.status).toBe(201);
    expect(preparedMusic).toEqual({
      ok: true,
      backgroundMusicPath: `/uploads/remotion-music/${savedProject.projectId}/mobius-default-underwater-bed.mp3`,
      source: 'bundled-default',
    });
    expect(fs.existsSync(path.join(
      musicUploadDirectory,
      'remotion-music',
      String(savedProject.projectId),
      'mobius-default-underwater-bed.mp3',
    ))).toBe(true);

    const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: savedProject.projectId }),
    });

    expect(renderResponse.status).toBe(200);
    expect(runRemotionRender).toHaveBeenCalledWith(expect.objectContaining({
      scenes: expect.arrayContaining([
        expect.objectContaining({
          backgroundMusicFile: path.join(
            REPOSITORY_ROOT,
            'src',
            'api',
            preparedMusic.backgroundMusicPath.slice(1),
          ),
          backgroundMusicVolume: 0.2,
        }),
      ]),
    }));
  });

  test('rejects background music owned by a different project before rendering', async () => {
    const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
    const runRemotionRender = jest.fn();
    const app = loadTestApp(outputDirectory, { runRemotionRender });
    server = await startServer(app);
    const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));

    const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unsafe music source',
        metadata: { renderState: { backgroundMusic: { file: '/uploads/remotion-music/999/private.wav' } } },
        components: [],
        images: [],
        script: '',
        audio: '',
        scenes: sampleScenes,
      }),
    });
    const savedProject = await saveResponse.json();

    const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: savedProject.projectId }),
    });

    expect(renderResponse.status).toBe(400);
    await expect(renderResponse.json()).resolves.toEqual({
      ok: false,
      code: 'REMOTION_BACKGROUND_MUSIC_INVALID',
      error: 'Background music must belong to the project being rendered.',
    });
    expect(runRemotionRender).not.toHaveBeenCalled();
  });

  test('rejects a persisted remote image before it can reach the renderer', async () => {
    const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
    const runRemotionRender = jest.fn();
    const app = loadTestApp(outputDirectory, { runRemotionRender });
    server = await startServer(app);
    const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));
    sampleScenes[0].imageUrls = ['https://127.0.0.1/private-image.png'];

    const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Remote image source',
        metadata: {},
        components: [],
        images: [],
        script: '',
        audio: '',
        scenes: sampleScenes,
      }),
    });
    const savedProject = await saveResponse.json();

    const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: savedProject.projectId }),
    });

    expect(renderResponse.status).toBe(400);
    await expect(renderResponse.json()).resolves.toEqual({
      ok: false,
      code: 'REMOTION_IMAGE_ASSET_INVALID',
      error: 'Tutorial images must be stored in the project before rendering.',
    });
    expect(runRemotionRender).not.toHaveBeenCalled();
  });

  test('rejects a requested narration voice when ElevenLabs is unavailable', async () => {
    const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
    const runRemotionRender = jest.fn();
    const app = loadTestApp(outputDirectory, {
      runRemotionRender,
      isNarrationAvailable: () => false,
    });
    server = await startServer(app);
    const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));

    const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Narration-required project',
        metadata: {},
        components: [],
        images: [],
        script: '',
        audio: '',
        scenes: sampleScenes,
      }),
    });
    const savedProject = await saveResponse.json();

    const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: savedProject.projectId, voiceId: 'selected-voice' }),
    });

    expect(renderResponse.status).toBe(400);
    await expect(renderResponse.json()).resolves.toEqual({
      ok: false,
      code: 'REMOTION_NARRATION_UNAVAILABLE',
      error: 'Narration is unavailable because ElevenLabs is not configured.',
    });
    expect(runRemotionRender).not.toHaveBeenCalled();
  });


test('rejects a release scene with an unresolved visual plan before it reaches the renderer', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));
  sampleScenes[0] = {
    ...sampleScenes[0],
    id: 'scene-unresolved',
    imageUrls: [],
    visualPlan: {
      requiresExplicitVisual: true,
      reviewState: 'needs_visual_review',
      selectedAssetIds: [],
    },
  };

  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unresolved visual plan', metadata: {}, components: [], images: [], script: '', audio: '', scenes: sampleScenes }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: savedProject.projectId }),
  });

  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('rejects a canonical render scene that omits its visual plan', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));
  sampleScenes[0] = { ...sampleScenes[0], id: 'scene-missing-plan', storyboardVersion: '1.2.0', imageUrls: [] };
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Missing visual plan', metadata: {}, components: [], images: [], script: '', audio: '', scenes: sampleScenes }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });
  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('rejects forged overview designations and selected IDs absent from the saved inventory', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const sampleScenes = JSON.parse(fs.readFileSync(SAMPLE_SCRIPT_PATH, 'utf8'));
  sampleScenes[0] = {
    ...sampleScenes[0], id: 'scene-forged-overview', storyboardVersion: '1.2.0', imageUrls: ['src/api/uploads/not-selected.png'],
    visualPlan: { requiresExplicitVisual: true, overviewExceptionAllowed: true, selectionMethod: 'operator_selected', overviewSelectionConfirmed: false, reviewState: 'resolved', selectedAssetIds: ['foreign-image'] },
  };
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Forged overview', metadata: {}, components: [], images: [{ id: 'owned-image', fileKey: 'src/api/uploads/owned.png' }], script: '', audio: '', scenes: sampleScenes }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });
  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('requires persisted approved component-link provenance before releasing canonical visuals', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const outputPath = path.join(outputDirectory, 'mobius-tutorial.mp4');
  const runRemotionRender = jest.fn(async () => ({ outputPaths: [outputPath] }));
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const approvedScene = (selectedAssetIds) => ({
    id: 'scene-approved-component', storyboardVersion: '1.2.0', narrationText: 'Show the monster token.', durationInFrames: 90,
    visualDirections: [{ instruction: 'Show monster token.', componentRefs: ['monster-token'] }],
    imageAssetIds: selectedAssetIds,
    visualPlan: {
      requiresExplicitVisual: true, reviewState: 'resolved', selectionMethod: 'approved_component_link', selectedAssetIds,
      primaryIntent: 'token_action', primaryComponentRefs: ['monster-token'], supportingComponentRefs: [], coverageStatus: 'resolved',
      coverageReason: 'Resolved by primary component evidence.', coverageEvidence: [], assetAssignments: selectedAssetIds.map((assetId) => ({ assetId, role: 'primary', componentId: 'monster-token' })), assetReuse: [],
    },
  });
  const metadata = {
    projectContext: {
      componentImageLinks: { 'monster-token': ['approved-image'] },
      componentImageLinkDetails: { 'monster-token': { 'approved-image': { origin: 'manual' } } },
      visualPlanPolicy: { allowAutomaticComponentLinks: false },
    },
  };
  const images = [
    { id: 'approved-image', fileKey: 'src/api/uploads/approved-image.png' },
    { id: 'unrelated-image', fileKey: 'src/api/uploads/unrelated-image.png' },
  ];

  const approvedSave = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Approved component visual', metadata, components: [], images, script: '', audio: '', scenes: [approvedScene(['approved-image'])] }),
  });
  const approvedProject = await approvedSave.json();
  const approvedRender = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: approvedProject.projectId }),
  });
  expect(approvedRender.status).toBe(200);
  expect(runRemotionRender).toHaveBeenCalledWith(expect.objectContaining({
    scenes: [expect.objectContaining({ imageUrls: [expect.stringMatching(/[\\/]src[\\/]api[\\/]uploads[\\/]approved-image\.png$/)] })],
  }));

  runRemotionRender.mockClear();
  const forgedSave = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Forged approved component visual', metadata, components: [], images, script: '', audio: '', scenes: [approvedScene(['unrelated-image'])] }),
  });
  const forgedProject = await forgedSave.json();
  const forgedRender = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: forgedProject.projectId }),
  });
  expect(forgedRender.status).toBe(400);
  await expect(forgedRender.json()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('rejects markerless render scenes when the persisted project has a canonical storyboard', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const scenes = [{ id: 'scene-markerless', narrationText: 'Show the board.', imageUrls: ['src/api/uploads/legacy-looking.png'] }];
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Markerless canonical scene', components: [], images: [], script: '', audio: '', scenes,
      metadata: { renderState: { storyboardManifest: { version: '1.2.0', scenes: [{ id: 'scene-markerless' }] } } },
    }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });

  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('rejects a forged resolved tableau that is supported only by a Monster-token asset', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const scene = {
    id: 'scene-tableau', storyboardVersion: '1.2.0', narrationText: 'End with the completed tableau.', durationInFrames: 90,
    imageAssetIds: ['monster-image'], imageUrls: ['src/api/uploads/monster.png'],
    visualPlan: {
      requiresExplicitVisual: true, reviewState: 'resolved', selectedAssetIds: ['monster-image'], selectionMethod: 'operator_selected',
      primaryIntent: 'assembled_tableau', primaryComponentRefs: [], supportingComponentRefs: ['monster-tokens'], coverageStatus: 'resolved', coverageReason: 'forged', coverageEvidence: [],
      assetAssignments: [{ assetId: 'monster-image', role: 'primary', componentId: 'monster-tokens' }], assetReuse: [], overviewSelectionConfirmed: false,
    },
  };
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Forged tableau coverage', metadata: {}, components: [], images: [{ id: 'monster-image', fileKey: 'src/api/uploads/monster.png' }], script: '', audio: '', scenes: [scene] }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });
  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('rejects primary evidence for an asset that is not selected for release rendering', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const scene = {
    id: 'scene-unselected-evidence', storyboardVersion: '1.2.0', narrationText: 'Show a monster token.', durationInFrames: 90,
    imageAssetIds: ['rendered-image'], imageUrls: ['src/api/uploads/rendered.png'],
    visualPlan: {
      requiresExplicitVisual: true, reviewState: 'resolved', selectedAssetIds: ['rendered-image'], selectionMethod: 'operator_selected',
      primaryIntent: 'token_action', primaryComponentRefs: ['monster-token'], supportingComponentRefs: [], coverageStatus: 'resolved', coverageReason: 'forged', coverageEvidence: [],
      assetAssignments: [{ assetId: 'certifying-image', role: 'primary', componentId: 'monster-token' }], assetReuse: [], overviewSelectionConfirmed: false,
    },
  };
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unselected primary evidence', metadata: {}, components: [], images: [
      { id: 'rendered-image', fileKey: 'src/api/uploads/rendered.png' },
      { id: 'certifying-image', fileKey: 'src/api/uploads/certifying.png' },
    ], script: '', audio: '', scenes: [scene] }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });
  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('rejects repeated non-brand assets even if persisted reuse annotations are omitted', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const app = loadTestApp(outputDirectory, { runRemotionRender });
  server = await startServer(app);
  const sharedVisualPlan = {
    requiresExplicitVisual: true, reviewState: 'resolved', selectedAssetIds: ['shared-image'], selectionMethod: 'operator_selected',
    primaryIntent: 'operator_defined', primaryComponentRefs: [], supportingComponentRefs: [], coverageStatus: 'resolved', coverageReason: 'forged', coverageEvidence: [],
    assetAssignments: [{ assetId: 'shared-image', role: 'primary', componentId: null }], overviewSelectionConfirmed: false,
  };
  const scenes = ['one', 'two', 'three'].map((suffix) => ({
    id: `scene-reuse-${suffix}`, storyboardVersion: '1.2.0', narrationText: 'Show the component.', durationInFrames: 90,
    imageAssetIds: ['shared-image'], imageUrls: ['src/api/uploads/shared.png'], visualPlan: sharedVisualPlan,
  }));
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Over-reused visual', metadata: {}, components: [], images: [{ id: 'shared-image', fileKey: 'src/api/uploads/shared.png' }], script: '', audio: '', scenes }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });
  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(runRemotionRender).not.toHaveBeenCalled();
});

test('requires server-resolved contextual provenance before a contextual visual can render', async () => {
  const outputDirectory = path.join(temporaryDirectory, 'rendered-videos');
  const runRemotionRender = jest.fn();
  const contextualEvidence = { resolveAssignment: jest.fn(async () => { throw new Error('unavailable'); }) };
  const app = loadTestApp(outputDirectory, { runRemotionRender, contextualEvidence });
  server = await startServer(app);
  const contextualAssignment = {
    kind: 'contextual_page', assetId: 'page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', pageId: 'page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    documentSha256: 'a'.repeat(64), pageRasterSha256: 'b'.repeat(64), renderProfile: 'pdf-to-img-review-144dpi-png-v1',
    role: 'rulebook_reference', confirmed: false,
  };
  const scene = {
    id: 'scene-contextual', storyboardVersion: '1.2.0', narrationText: 'Refer to the rulebook.', durationInFrames: 90,
    imageAssetIds: [], imageUrls: [],
    visualPlan: {
      requiresExplicitVisual: true, reviewState: 'resolved', selectedAssetIds: [], assetAssignments: [], assetReuse: [],
      selectionMethod: 'rulebook_reference', overviewExceptionAllowed: true, overviewSelectionConfirmed: true,
      primaryIntent: 'game_overview', primaryComponentRefs: [], supportingComponentRefs: [], coverageStatus: 'resolved',
      coverageReason: 'Verified contextual reference.', coverageEvidence: [], contextualEvidenceAssignments: [contextualAssignment],
    },
  };
  const saveResponse = await fetch(`${baseUrl(server)}/save-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unresolved contextual provenance', metadata: {}, components: [], images: [], script: '', audio: '', scenes: [scene] }),
  });
  const savedProject = await saveResponse.json();
  const renderResponse = await fetch(`${baseUrl(server)}/api/render-remotion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProject.projectId }),
  });
  expect(renderResponse.status).toBe(400);
  await expect(renderResponse.json()).resolves.toEqual(expect.objectContaining({ code: 'VISUAL_PLAN_INCOMPLETE' }));
  expect(contextualEvidence.resolveAssignment).toHaveBeenCalledWith(String(savedProject.projectId), contextualAssignment);
  expect(runRemotionRender).not.toHaveBeenCalled();
});


});