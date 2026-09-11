import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { runZeroState } from '../../scripts/run-rulebook-production.mjs';
import { buildCanonicalHephaestusManifest } from '../../src/services/hephaestusMaterialization.js';
import { buildApiRuntimeCapabilities } from '../../src/services/runtimeCompatibility.js';
import { AI_PROVIDER_READINESS_CONTRACT } from '../../src/services/aiProviderReadiness.js';

test('fresh PDF invokes canonical HEPHAESTUS materialization before script or storyboard generation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-production-heph-boundary-'));
  const pdfPath = path.join(root, 'fixture-rulebook.pdf');
  const fixtureImage = path.resolve('tests/fixtures/images/test-bg-100x100.png');
  const pdfBuild = spawnSync(process.env.PYTHON || 'python', ['-c', [
    'import fitz,sys',
    'doc=fitz.open()',
    'page=doc.new_page(width=612,height=792)',
    "page.insert_text((72,72),'Fixture Game Rules Setup Components Scoring')",
    'page.insert_image(fitz.Rect(72,100,272,300),filename=sys.argv[2])',
    'doc.save(sys.argv[1])',
  ].join(';'), pdfPath, fixtureImage], { encoding: 'utf8', windowsHide: true });
  assert.equal(pdfBuild.status, 0, pdfBuild.stderr || 'fixture PDF creation failed');

  const calls = [];
  let projectId;
  const assetBytes = fs.readFileSync(fixtureImage);
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://fixture.local').pathname;
    const method = request.method || 'GET';
    calls.push(`${method} ${route}`);
    request.resume();
    const projectMatch = route.match(/^\/api\/projects\/([^/]+)/);
    if (projectMatch) projectId = decodeURIComponent(projectMatch[1]);
    const sendJson = (body, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (route === '/api/runtime/capabilities') return sendJson(buildApiRuntimeCapabilities({ cwd: process.cwd() }));
    if (route === '/api/ai/status') return sendJson({
      contract: AI_PROVIDER_READINESS_CONTRACT, configured: true, ready: true,
      provider: 'openai', model: 'fixture-model', credentialPresent: true,
      modelConfigured: true, accessCheck: 'model-metadata', configurationFingerprint: 'fixture',
    });
    if (route.endsWith('/source-pdf') && method === 'POST') {
      const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'data', projectId, 'source', 'source.json'), 'utf8'));
      return sendJson({ sourcePdf: descriptor, idempotent: false }, 201);
    }
    if (route.startsWith('/load-project/')) return sendJson({ code: 'PROJECT_NOT_FOUND' }, 404);
    if (route.endsWith('/production-state') && method === 'POST') return sendJson({ ok: true }, 201);
    if (route === '/api/ingest' && method === 'POST') return sendJson({ manifest: { contract: 'fixture-ingestion', pages: 1 } }, 201);
    if (route.endsWith('/images/extract-hephaestus') && method === 'POST') {
      const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'data', projectId, 'source', 'source.json'), 'utf8'));
      const apiOutput = path.join(root, 'api-root', 'data', projectId, 'hephaestus');
      const file = path.join(apiOutput, 'images', 'all', 'fixture.png');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, assetBytes);
      const manifest = buildCanonicalHephaestusManifest({
        projectId, sourceDescriptor: descriptor, outputDir: apiOutput,
        extractionResult: { success: true, stats: { total_items: 1 }, images: [{ id: 'p0_img0_xref1', file_path: file, page_index: 0, native: true, type: 'card', classification: 'card', is_component: true, confidence: 1, original_dimensions: { width: 100, height: 100 }, dimensions: { width: 100, height: 100 } }] },
        assetUrlFor: (assetId) => `/api/projects/${projectId}/images/${assetId}/file`,
      });
      return sendJson({ success: true, hephaestusManifest: manifest }, 200);
    }
    if (/\/images\/heph_[^/]+\/file$/.test(route)) {
      response.writeHead(200, { 'content-type': 'image/png' });
      return response.end(assetBytes);
    }
    return sendJson({ error: `Unexpected fixture request: ${method} ${route}` }, 500);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let result;
  let replay;
  try {
    result = await runZeroState({ root, pdf: pdfPath, baseUrl, stopAfter: 'hephaestus' });
    replay = await runZeroState({ root, pdf: pdfPath, baseUrl, stopAfter: 'hephaestus' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual({ status: result.status, stage: result.stage }, { status: 'stopped', stage: 'hephaestus' });
  assert.deepEqual({ status: replay.status, stage: replay.stage }, { status: 'stopped', stage: 'hephaestus' });
  const projectRoot = path.join(root, 'data', projectId);
  const checkpoint = JSON.parse(fs.readFileSync(path.join(projectRoot, 'production', 'zero-state-production-state.json'), 'utf8'));
  assert.equal(checkpoint.stages.hephaestus.status, 'READY');
  assert.equal(checkpoint.stages.hephaestus.reused, true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'hephaestus', 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'hephaestus', 'component-evidence.json')), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'hephaestus', 'extraction-state.json')), true);
  assert.equal(calls.some((call) => call.includes('/images/extract-hephaestus')), true);
  assert.equal(calls.filter((call) => call.includes('/images/extract-hephaestus')).length, 1);
  assert.equal(calls.some((call) => call.includes('/summarize')), false);
  assert.equal(checkpoint.stages['draft-script'], undefined);
  assert.equal(checkpoint.stages.storyboard, undefined);
});
