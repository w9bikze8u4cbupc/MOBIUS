process.env.NODE_ENV = 'test';

const http = require('http');
const {
  buildRenderJobConfig,
  registerRenderJobConfigRoute,
  setProjectState,
  clearProjectState,
} = require('../../src/api/renderJobConfig.js');

function startServer() {
  return new Promise((resolve) => {
    const routes = new Map();
    const app = {
      get: (path, handler) => routes.set(path, handler)
    };

    registerRenderJobConfigRoute(app);

    const server = http.createServer((req, res) => {
      const [pathname, queryString] = req.url.split('?');
      const handler = routes.get(pathname);
      if (!handler) {
        res.statusCode = 404;
        return res.end();
      }

      const query = Object.fromEntries(new URLSearchParams(queryString));
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

      handler({ query }, resShim);
    });

    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const ingestionManifest = {
  version: '1.0.0',
  document: { id: 'demo', title: 'Demo Game' },
  assets: {
    components: [
      { id: 'comp-1', hash: 'hash-comp-1' },
      { id: 'comp-2', hash: 'hash-comp-2' }
    ],
    pages: [{ page: 1, hash: 'page-1-hash' }]
  }
};

const storyboardManifest = {
  storyboardContractVersion: '1.1.0',
  game: { name: 'Demo Game' },
  resolution: { width: 1280, height: 720, fps: 24 },
  scenes: [
    { id: 'intro', type: 'intro', durationSec: 3.5, index: 0 },
    { id: 'setup', type: 'setup', durationSec: 5, index: 1 }
  ]
};

describe('buildRenderJobConfig', () => {
  it('maps ingestion and storyboard manifests into a render job config', () => {
    const config = buildRenderJobConfig({
      projectId: 'p1',
      ingestionManifest,
      storyboardManifest,
      lang: 'en',
      mode: 'preview'
    });

    expect(config.projectId).toBe('p1');
    expect(config.lang).toBe('en');
    expect(config.video.resolution).toEqual({ width: 1280, height: 720 });
    expect(config.video.fps).toBe(24);
    expect(config.assets.images.length).toBe(3);
    expect(config.timing.totalDurationSec).toBeCloseTo(8.5);
  });

  it('throws when prerequisites are missing', () => {
    expect(() => buildRenderJobConfig({})).toThrow('RENDER_JOB_PROJECT_ID_REQUIRED');
    expect(() =>
      buildRenderJobConfig({ projectId: 'p', storyboardManifest })
    ).toThrow('RENDER_JOB_MISSING_INGESTION');
    expect(() =>
      buildRenderJobConfig({ projectId: 'p', ingestionManifest })
    ).toThrow('RENDER_JOB_MISSING_STORYBOARD');
  });
});

describe('/api/render-job-config', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    clearProjectState();
    setProjectState('demo', {
      projectId: 'demo',
      metadata: { seed: 42 },
      ingestionManifest,
      storyboardManifest,
    });
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(() => server && server.close());

  it('returns render job config when project exists', async () => {
    const response = await fetch(`${baseUrl}/api/render-job-config?projectId=demo&lang=en&resolution=1920x1080&fps=30`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.config.video.resolution).toEqual({ width: 1920, height: 1080 });
    expect(payload.config.timing.totalDurationSec).toBeGreaterThan(0);
  });

  it('returns 400 when ingestion is missing', async () => {
    clearProjectState();
    setProjectState('demo-missing', { storyboardManifest });

    const response = await fetch(`${baseUrl}/api/render-job-config?projectId=demo-missing&lang=en`);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe('RENDER_JOB_MISSING_INGESTION');
  });

  it('returns 400 when storyboard is missing', async () => {
    clearProjectState();
    setProjectState('demo-missing', { ingestionManifest });

    const response = await fetch(`${baseUrl}/api/render-job-config?projectId=demo-missing&lang=en`);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe('RENDER_JOB_MISSING_STORYBOARD');
  });
});

