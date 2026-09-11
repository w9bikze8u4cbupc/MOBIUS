describe('zero-state production contracts', () => {
  test('stage checkpoints reuse only matching content hashes and existing outputs', async () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const script = pathToFileURL(require('path').resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {stageReady} from '${script}'; const c={stages:{extraction:{status:'READY',inputHash:'same'},legacy:{inputHash:'same'}}}; console.log(JSON.stringify([stageReady(c,'extraction','same',[]),stageReady(c,'extraction','changed',[]),stageReady(c,'legacy','same',[])]));`], { encoding: 'utf8' });
    expect(JSON.parse(output.trim().split(/\r?\n/).pop())).toEqual([true, false, false]);
  });

  test('the library computes stable source identity independent of the filename used later', async () => {
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-zero-state-'));
    const firstPath = path.join(directory, 'original.pdf');
    const renamedPath = path.join(directory, 'renamed-rulebook.pdf');
    fs.writeFileSync(firstPath, Buffer.from('%PDF-1.4 stable source bytes'));
    fs.copyFileSync(firstPath, renamedPath);
    const { pathToFileURL } = require('url');
    const library = pathToFileURL(path.resolve(__dirname, '../../scripts/rulebook-library.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {computePdfIdentity} from '${library}'; const a=await computePdfIdentity(${JSON.stringify(firstPath)}); const b=await computePdfIdentity(${JSON.stringify(renamedPath)}); console.log(JSON.stringify([a,b]));`], { encoding: 'utf8' });
    const [first, renamed] = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sha256).toBe(renamed.sha256);
    expect(first.bytes).toBe(renamed.bytes);
  });

  test('content-derived game identity and source offsets beat filename/page guesses', async () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const path = require('path');
    const production = pathToFileURL(path.resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {gameNameFromRulebookText,pagesForSources} from '${production}'; const ranges=[{page:1,start:0,end:2},{page:2,start:2,end:1970},{page:16,start:48917,end:50140}]; console.log(JSON.stringify({name:gameNameFromRulebookText('In Terraforming Mars, you control a corporation.', 'fa0678822223-tm-eng-bgg'), pages:pagesForSources([{startOffset:47974,endOffset:50136}], ranges)}));`], { encoding: 'utf8' });
    const result = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(result.name).toBe('Terraforming Mars');
    expect(result.pages).toEqual([16]);
  });

  test('a fresh source is synchronized into API-owned storage before production-state reservation', () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const path = require('path');
    const production = pathToFileURL(path.resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
    const sourceService = pathToFileURL(path.resolve(__dirname, '../../src/services/projectSourceService.js')).href;
    const script = `
      import fs from 'node:fs';
      import os from 'node:os';
      import path from 'node:path';
      import { runZeroState } from '${production}';
      import { createProjectSourceService, normalizeDurableProjectSource, sameDurableProjectSource } from '${sourceService}';
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-source-boundary-'));
      try {
        const pdf = path.join(root, 'fresh-unseen.pdf');
        fs.writeFileSync(pdf, Buffer.from('%PDF-1.4\\n1 0 obj << /Type /Page >> endobj\\n'));
        const remoteRoot = path.join(root, 'remote-data');
        const remoteSource = createProjectSourceService({ dataRoot: remoteRoot });
        let projectId = null;
        let reservationAccepted = false;
        let uploadCount = 0;
        const fetchImpl = async (url, options = {}) => {
          const route = new URL(url).pathname;
          if (route === '/api/runtime/capabilities') {
            const { buildApiRuntimeCapabilities } = await import('${pathToFileURL(require('path').resolve(__dirname, '../../src/services/runtimeCompatibility.js')).href}');
            return new Response(JSON.stringify(buildApiRuntimeCapabilities({ cwd: ${JSON.stringify(require('path').resolve(__dirname, '../..'))} })), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          if (route.endsWith('/source-pdf') && options.method === 'POST') {
            projectId = decodeURIComponent(route.split('/').at(-2));
            const file = options.body.get('file');
            const upload = path.join(root, 'remote-upload.pdf');
            fs.writeFileSync(upload, Buffer.from(await file.arrayBuffer()));
            const saved = await remoteSource.persistUpload(projectId, upload, { filename: file.name });
            uploadCount += 1;
            return new Response(JSON.stringify({ sourcePdf: saved.descriptor, idempotent: saved.idempotent }), { status: saved.idempotent ? 200 : 201, headers: { 'content-type': 'application/json' } });
          }
          if (route.startsWith('/load-project/')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          if (route.endsWith('/production-state') && options.method === 'POST') {
            const body = JSON.parse(options.body);
            const requested = normalizeDurableProjectSource(body.projectContext.sourcePdf, projectId);
            const persisted = normalizeDurableProjectSource(await remoteSource.readDescriptor(projectId), projectId);
            reservationAccepted = Boolean(requested && persisted && sameDurableProjectSource(requested, persisted));
            return new Response(JSON.stringify(reservationAccepted ? { status: 'success', projectId } : { code: 'SOURCE_PDF_INVALID' }), { status: reservationAccepted ? 200 : 409, headers: { 'content-type': 'application/json' } });
          }
          throw new Error('Unexpected fixture route: ' + route);
        };
        const first = await runZeroState({ root, pdf, baseUrl: 'http://fixture.local', stopAfter: 'source', fetchImpl });
        const replay = await runZeroState({ root, pdf, baseUrl: 'http://fixture.local', stopAfter: 'source', fetchImpl });
        console.log(JSON.stringify({ first, replay, reservationAccepted, uploadCount, remoteDescriptor: await remoteSource.readDescriptor(projectId) }));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    const proof = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(proof.first).toMatchObject({ status: 'stopped', stage: 'source' });
    expect(proof.replay).toMatchObject({ status: 'stopped', stage: 'source' });
    expect(proof.reservationAccepted).toBe(true);
    expect(proof.uploadCount).toBe(2);
    expect(proof.remoteDescriptor.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('Attempt-3-style legacy API mismatch blocks every expensive production call', () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const path = require('path');
    const production = pathToFileURL(path.resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
    const script = `
      import { runZeroState } from '${production}';
      const calls = [];
      try {
        await runZeroState({
          root: process.cwd(), pdf: 'must-not-be-read.pdf', baseUrl: 'http://legacy.fixture', alignRuntime: false,
          fetchImpl: async (url) => { calls.push(new URL(url).pathname); return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } }); },
        });
      } catch (error) {
        console.log(JSON.stringify({ code: error.code, calls, hephaestusProviderCalls: calls.filter((value) => value.includes('extract-hephaestus')).length, llmCalls: calls.filter((value) => value.includes('summarize')).length, ttsCalls: calls.filter((value) => value.includes('narrat')).length, renderCalls: calls.filter((value) => value.includes('render')).length }));
      }
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(JSON.parse(output.trim().split(/\r?\n/).pop())).toEqual({
      code: 'RUNTIME_CONTRACT_MISMATCH', calls: ['/api/runtime/capabilities'],
      hephaestusProviderCalls: 0, llmCalls: 0, ttsCalls: 0, renderCalls: 0,
    });
  });

  test('AI configuration mismatch blocks before extraction and every expensive provider stage', () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const path = require('path');
    const production = pathToFileURL(path.resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
    const sourceService = pathToFileURL(path.resolve(__dirname, '../../src/services/projectSourceService.js')).href;
    const runtimeCompatibility = pathToFileURL(path.resolve(__dirname, '../../src/services/runtimeCompatibility.js')).href;
    const aiReadiness = pathToFileURL(path.resolve(__dirname, '../../src/services/aiProviderReadiness.js')).href;
    const script = `
      import fs from 'node:fs';
      import os from 'node:os';
      import path from 'node:path';
      import { spawnSync } from 'node:child_process';
      import { runZeroState } from '${production}';
      import { createProjectSourceService } from '${sourceService}';
      import { buildApiRuntimeCapabilities } from '${runtimeCompatibility}';
      import { AI_PROVIDER_READINESS_CONTRACT } from '${aiReadiness}';
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-ai-boundary-'));
      const calls = [];
      try {
        const pdf = path.join(root, 'fresh-unseen.pdf');
        const built = spawnSync(process.env.PYTHON || 'python', ['-c', 'import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_text((72,72),"Provider readiness fixture"); d.save(sys.argv[1])', pdf], { encoding: 'utf8', windowsHide: true });
        if (built.status !== 0) throw new Error(built.stderr || 'fixture PDF build failed');
        const remoteSource = createProjectSourceService({ dataRoot: path.join(root, 'remote-data') });
        let projectId;
        const fetchImpl = async (url, options = {}) => {
          const route = new URL(url).pathname;
          calls.push(route);
          if (route === '/api/runtime/capabilities') return new Response(JSON.stringify(buildApiRuntimeCapabilities()), { status: 200, headers: { 'content-type': 'application/json' } });
          if (route.endsWith('/source-pdf') && options.method === 'POST') {
            projectId = decodeURIComponent(route.split('/').at(-2));
            const file = options.body.get('file');
            const upload = path.join(root, 'remote-upload.pdf');
            fs.writeFileSync(upload, Buffer.from(await file.arrayBuffer()));
            const saved = await remoteSource.persistUpload(projectId, upload, { filename: file.name });
            return new Response(JSON.stringify({ sourcePdf: saved.descriptor, idempotent: saved.idempotent }), { status: 201, headers: { 'content-type': 'application/json' } });
          }
          if (route.startsWith('/load-project/')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          if (route.endsWith('/production-state')) return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json' } });
          if (route === '/api/ai/status') return new Response(JSON.stringify({
            contract: AI_PROVIDER_READINESS_CONTRACT, configured: false, ready: false,
            provider: 'openai', model: null, credentialPresent: true, modelConfigured: false,
            code: 'AI_NOT_CONFIGURED', classification: 'configuration_required',
            message: 'credential present but model missing',
          }), { status: 200, headers: { 'content-type': 'application/json' } });
          throw new Error('Unexpected route after AI preflight: ' + route);
        };
        try { await runZeroState({ root, pdf, baseUrl: 'http://fixture.local', fetchImpl, alignRuntime: false }); }
        catch (error) {
          console.log(JSON.stringify({
            code: error.code, classification: error.classification, message: error.message, calls,
            hephaestusCalls: calls.filter((value) => value.includes('extract-hephaestus')).length,
            llmCalls: calls.filter((value) => value.includes('summarize')).length,
            ttsCalls: calls.filter((value) => value.includes('narrat')).length,
            renderCalls: calls.filter((value) => value.includes('render')).length,
          }));
        }
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    const proof = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(proof).toMatchObject({
      code: 'AI_NOT_CONFIGURED', classification: 'configuration_required',
      hephaestusCalls: 0, llmCalls: 0, ttsCalls: 0, renderCalls: 0,
    });
    expect(proof.calls.at(-1)).toBe('/api/ai/status');
  });

});
