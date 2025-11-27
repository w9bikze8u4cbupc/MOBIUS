const http = require('http');
const url = require('url');
const {
  enqueueRenderJob,
  getJob,
  listJobArtifacts,
  resetRenderQueue,
} = require('../../src/api/renderQueue.js');

describe('render artifact routes', () => {
  let server;
  let baseUrl;

  function startServer() {
    return new Promise((resolve) => {
      const routes = new Map();

      routes.set('GET /api/render/:jobId/artifacts', async (req, res, params) => {
        const { jobId } = params;
        const job = getJob(jobId);

        if (!job) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
        }

        if (job.status !== 'completed') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: false, error: 'Job not completed yet' }));
        }

        const artifacts = listJobArtifacts(jobId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, artifacts }));
      });

      routes.set('GET /api/render/:jobId/manifest', (req, res, params) => {
        const { jobId } = params;
        const job = getJob(jobId);

        if (!job) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
        }

        if (job.status !== 'completed') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: false, error: 'Job not completed yet' }));
        }

        if (!job.manifest) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: false, error: 'Manifest not available' }));
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({ ok: true, manifest: job.manifest, manifestPath: job.manifestPath, zipPath: job.zipPath })
        );
      });

      server = http.createServer((req, res) => {
        const parsed = url.parse(req.url, true);
        const method = req.method.toUpperCase();

        const match = [...routes.entries()].find(([key]) => {
          const [routeMethod, routePattern] = key.split(' ');
          if (routeMethod !== method) return false;
          const routeParts = routePattern.split('/').filter(Boolean);
          const urlParts = parsed.pathname.split('/').filter(Boolean);
          if (routeParts.length !== urlParts.length) return false;
          return routeParts.every((part, idx) => part.startsWith(':') || part === urlParts[idx]);
        });

        if (!match) {
          res.statusCode = 404;
          return res.end();
        }

        const [key, handler] = match;
        const params = {};
        const routeParts = key.split(' ')[1].split('/').filter(Boolean);
        const urlParts = parsed.pathname.split('/').filter(Boolean);
        routeParts.forEach((part, idx) => {
          if (part.startsWith(':')) {
            params[part.slice(1)] = urlParts[idx];
          }
        });

        handler(req, res, params);
      });

      server.listen(0, () => {
        const { port } = server.address();
        resolve({ baseUrl: `http://127.0.0.1:${port}` });
      });
    });
  }

  async function waitForJob(jobId) {
    for (let i = 0; i < 50; i += 1) {
      const job = getJob(jobId);
      if (job?.status === 'completed') return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Job did not complete');
  }

  beforeEach(async () => {
    resetRenderQueue();
    const started = await startServer();
    baseUrl = started.baseUrl;
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
    resetRenderQueue();
  });

  it('returns manifest and artifacts for completed jobs', async () => {
    const manifest = { media: { video: [{ path: 'video.mp4', sha256: 'abc' }] } };
    const executor = async () => ({
      artifacts: ['/uploads/render-jobs/job-1/video.mp4'],
      manifest,
      manifestPath: '/uploads/render-jobs/job-1/container.json',
      zipPath: '/uploads/render-jobs/job-1/job-1.zip',
    });

    const job = enqueueRenderJob({ projectId: 'p1' }, { executor });
    await waitForJob(job.id);

    const artifactsRes = await fetch(`${baseUrl}/api/render/${job.id}/artifacts`);
    const artifactsPayload = await artifactsRes.json();
    expect(artifactsRes.status).toBe(200);
    expect(artifactsPayload.ok).toBe(true);
    expect(artifactsPayload.artifacts.manifest).toEqual(manifest);

    const manifestRes = await fetch(`${baseUrl}/api/render/${job.id}/manifest`);
    const manifestPayload = await manifestRes.json();
    expect(manifestRes.status).toBe(200);
    expect(manifestPayload.ok).toBe(true);
    expect(manifestPayload.manifest).toEqual(manifest);
    expect(manifestPayload.zipPath).toBe('/uploads/render-jobs/job-1/job-1.zip');
  });
});
