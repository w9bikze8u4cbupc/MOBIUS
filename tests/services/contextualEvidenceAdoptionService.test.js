import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { createContextualEvidenceService } from '../../src/services/contextualEvidenceService.js';
import {
  ContextualEvidenceAdoptionError,
  createContextualEvidenceAdoptionService,
} from '../../src/services/contextualEvidenceAdoptionService.js';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function pngPage() {
  return sharp({ create: { width: 80, height: 90, channels: 3, background: '#123456' } }).png().toBuffer();
}

function rendererFor(page) {
  return jest.fn(async function* fixtureRenderer() { yield page; });
}

describe('contextual evidence adoption service', () => {
  let root;
  let uploadRoot;
  let registryPath;
  let dataRoot;
  let source;
  let page;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'contextual-adoption-'));
    uploadRoot = path.join(root, 'uploads');
    registryPath = path.join(root, 'adoption-links.json');
    dataRoot = path.join(root, 'data');
    fs.mkdirSync(uploadRoot, { recursive: true });
    source = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF');
    page = await pngPage();
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function contextual(renderer = rendererFor(page)) {
    return createContextualEvidenceService({ dataRoot, renderPages: renderer });
  }

  function adoption(contextualEvidence, extra = {}) {
    return createContextualEvidenceAdoptionService({
      contextualEvidence,
      uploadRoot,
      linkRegistryPath: registryPath,
      ...extra,
    });
  }

  function writeLinkedSource({ projectId = 'demo-project', storedFilename = 'stored.pdf', originalFilename = 'Demo Rulebook.pdf', sourceRecordId = 'source-1', bytes = source, sourceSha256 = hash(source) } = {}) {
    fs.writeFileSync(path.join(uploadRoot, storedFilename), bytes);
    fs.writeFileSync(registryPath, JSON.stringify({
      version: 1,
      links: [{ projectId, storedFilename, originalFilename, sourceRecordId, projectName: 'Demo Game', sha256: sourceSha256, bytes: bytes.length }],
    }));
  }

  it('fails closed with no project-linked legacy candidate and never scans unlinked uploads', async () => {
    fs.writeFileSync(path.join(uploadRoot, 'unlinked.pdf'), source);
    const service = adoption(contextual());

    await expect(service.discover('demo-project')).resolves.toEqual(expect.objectContaining({
      projectId: 'demo-project', status: 'none', code: 'CONTEXTUAL_ADOPTION_NO_CANDIDATE', candidates: [], eligibleCandidate: null,
    }));
    expect(fs.existsSync(path.join(dataRoot, 'demo-project', 'contextual-evidence', 'manifest.json'))).toBe(false);
  });

  it('discovers one exact linked candidate but adopts only after named confirmation', async () => {
    writeLinkedSource();
    const evidence = contextual();
    const service = adoption(evidence);
    const discovery = await service.discover('demo-project');
    const candidate = discovery.eligibleCandidate;

    expect(discovery).toMatchObject({ status: 'ready', projectId: 'demo-project' });
    expect(candidate).toMatchObject({ filename: 'Demo Rulebook.pdf', bytes: source.length, sha256: hash(source), pageCount: 1, eligible: true });
    expect(JSON.stringify(candidate)).not.toContain(uploadRoot);
    await expect(service.adoptLegacy('demo-project', candidate.id, { projectId: 'demo-project', filename: 'wrong.pdf' }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CONFIRMATION_REQUIRED' });
    expect(fs.existsSync(path.join(dataRoot, 'demo-project', 'contextual-evidence', 'manifest.json'))).toBe(false);

    const result = await service.adoptLegacy('demo-project', candidate.id, { projectId: 'demo-project', filename: candidate.filename });
    expect(result).toMatchObject({ idempotent: false, inventory: { available: true, projectId: 'demo-project', source: { sha256: hash(source), pageCount: 1 }, provenance: { kind: 'verified_legacy_upload', sourceRecordId: 'source-1' } } });
    expect(fs.existsSync(path.join(dataRoot, 'demo-project', 'contextual-evidence', 'source', 'rulebook.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(dataRoot, 'demo-project', 'contextual-evidence', 'pages', 'page-0001.png'))).toBe(true);
  });

  it('marks multiple fully linked candidates ambiguous and refuses all automatic adoption', async () => {
    fs.writeFileSync(path.join(uploadRoot, 'a.pdf'), source);
    fs.writeFileSync(path.join(uploadRoot, 'b.pdf'), source);
    fs.writeFileSync(registryPath, JSON.stringify({ version: 1, links: [
      { projectId: 'demo-project', storedFilename: 'a.pdf', originalFilename: 'A.pdf', sourceRecordId: 'source-a', projectName: 'Demo Game', sha256: hash(source), bytes: source.length },
      { projectId: 'demo-project', storedFilename: 'b.pdf', originalFilename: 'B.pdf', sourceRecordId: 'source-b', projectName: 'Demo Game', sha256: hash(source), bytes: source.length },
    ] }));
    const service = adoption(contextual());
    const discovery = await service.discover('demo-project');

    expect(discovery).toMatchObject({ status: 'ambiguous', code: 'CONTEXTUAL_ADOPTION_CANDIDATE_AMBIGUOUS', eligibleCandidate: null });
    expect(discovery.candidates).toHaveLength(2);
    expect(discovery.candidates.every((candidate) => candidate.eligible === false && candidate.reason === 'CONTEXTUAL_ADOPTION_CANDIDATE_AMBIGUOUS')).toBe(true);
    await expect(service.adoptLegacy('demo-project', discovery.candidates[0].id, { projectId: 'demo-project', filename: 'A.pdf' }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CANDIDATE_AMBIGUOUS' });
  });

  it('rejects malformed, stale, foreign, traversal, and fingerprint-mismatched links without paths', async () => {
    fs.writeFileSync(path.join(uploadRoot, 'owned.pdf'), source);
    fs.writeFileSync(registryPath, JSON.stringify({ version: 1, links: [
      { projectId: 'other-project', storedFilename: 'owned.pdf', originalFilename: 'Foreign.pdf', sourceRecordId: 'foreign', projectName: 'Other', sha256: hash(source), bytes: source.length },
      { projectId: 'demo-project', storedFilename: '../owned.pdf', originalFilename: 'Traversal.pdf', sourceRecordId: 'traversal', projectName: 'Demo', sha256: hash(source), bytes: source.length },
      { projectId: 'demo-project', storedFilename: 'missing.pdf', originalFilename: 'Missing.pdf', sourceRecordId: 'missing', projectName: 'Demo', sha256: hash(source), bytes: source.length },
      { projectId: 'demo-project', storedFilename: 'owned.pdf', originalFilename: 'Stale.pdf', sourceRecordId: 'stale', projectName: 'Demo', sha256: 'a'.repeat(64), bytes: source.length },
    ] }));
    const service = adoption(contextual());
    const discovery = await service.discover('demo-project');

    expect(discovery).toMatchObject({ status: 'none', code: 'CONTEXTUAL_ADOPTION_NO_CANDIDATE' });
    expect(discovery.candidates).toHaveLength(2);
    expect(discovery.candidates.map((candidate) => candidate.reason).sort()).toEqual(['CONTEXTUAL_ADOPTION_PROJECT_MISMATCH', 'CONTEXTUAL_ADOPTION_SOURCE_INVALID']);
    expect(JSON.stringify(discovery)).not.toContain(uploadRoot);
    await expect(service.discover('../demo')).rejects.toMatchObject({ code: 'PROJECT_ID_INVALID' });
  });

  it('verifies a local upload before confirmation, atomically adopts it, is idempotent for the same source, and conflicts for another source', async () => {
    const evidence = contextual();
    const service = adoption(evidence);
    const localPath = path.join(uploadRoot, 'local.pdf');
    fs.writeFileSync(localPath, source);
    const preview = await service.previewLocalUpload('demo-project', { path: localPath, originalname: 'Local Rulebook.pdf' });

    expect(preview).toMatchObject({ source: 'local_upload_preview', pageCount: 1, sha256: hash(source) });
    await expect(service.adoptLocalPreview('demo-project', preview.id, null)).rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CONFIRMATION_REQUIRED' });
    const first = await service.adoptLocalPreview('demo-project', preview.id, { projectId: 'demo-project', filename: 'Local Rulebook.pdf' });
    expect(first).toMatchObject({ idempotent: false, inventory: { provenance: { kind: 'operator_selected_local_upload' } } });
    expect(fs.existsSync(localPath)).toBe(false);

    const samePath = path.join(uploadRoot, 'same.pdf');
    fs.writeFileSync(samePath, source);
    const samePreview = await service.previewLocalUpload('demo-project', { path: samePath, originalname: 'Local Rulebook.pdf' });
    await expect(service.adoptLocalPreview('demo-project', samePreview.id, { projectId: 'demo-project', filename: 'Local Rulebook.pdf' }))
      .resolves.toMatchObject({ idempotent: true });

    const changed = Buffer.from('%PDF-1.7\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF');
    const changedPath = path.join(uploadRoot, 'changed.pdf');
    fs.writeFileSync(changedPath, changed);
    const changedPreview = await service.previewLocalUpload('demo-project', { path: changedPath, originalname: 'Changed.pdf' });
    await expect(service.adoptLocalPreview('demo-project', changedPreview.id, { projectId: 'demo-project', filename: 'Changed.pdf' }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CONFLICT' });
  });

  it('maps renderer failure to a typed adoption failure and publishes no manifest or native state', async () => {
    const failingRenderer = jest.fn(async function* () { throw new Error('fixture render failure'); });
    const evidence = contextual(failingRenderer);
    const service = adoption(evidence);
    const localPath = path.join(uploadRoot, 'failure.pdf');
    fs.writeFileSync(localPath, source);
    const preview = await service.previewLocalUpload('demo-project', { path: localPath, originalname: 'Failure.pdf' });

    await expect(service.adoptLocalPreview('demo-project', preview.id, { projectId: 'demo-project', filename: 'Failure.pdf' }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_RENDER_FAILED' });
    await expect(service.adoptLocalPreview('demo-project', preview.id, { projectId: 'demo-project', filename: 'Failure.pdf' }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CANDIDATE_NOT_FOUND' });
    expect(fs.existsSync(path.join(dataRoot, 'demo-project', 'contextual-evidence', 'manifest.json'))).toBe(false);
    expect(fs.existsSync(localPath)).toBe(false);
  });

  it('serializes concurrent confirmations so a second source conflicts rather than replacing the first', async () => {
    const evidence = contextual();
    const service = adoption(evidence);
    const firstPath = path.join(uploadRoot, 'first.pdf');
    const secondPath = path.join(uploadRoot, 'second.pdf');
    const secondSource = Buffer.from('%PDF-1.7\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF');
    fs.writeFileSync(firstPath, source);
    fs.writeFileSync(secondPath, secondSource);
    const first = await service.previewLocalUpload('demo-project', { path: firstPath, originalname: 'First.pdf' });
    const second = await service.previewLocalUpload('demo-project', { path: secondPath, originalname: 'Second.pdf' });

    const results = await Promise.allSettled([
      service.adoptLocalPreview('demo-project', first.id, { projectId: 'demo-project', filename: 'First.pdf' }),
      service.adoptLocalPreview('demo-project', second.id, { projectId: 'demo-project', filename: 'Second.pdf' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CONFLICT' });
    await expect(evidence.inventory('demo-project')).resolves.toMatchObject({ available: true });
  });

  it('expires an unconfirmed local preview and removes its temporary upload before it can be adopted', async () => {
    let time = 0;
    const evidence = contextual();
    const service = adoption(evidence, { previewTtlMs: 10, now: () => time });
    const localPath = path.join(uploadRoot, 'expiring.pdf');
    fs.writeFileSync(localPath, source);
    const preview = await service.previewLocalUpload('demo-project', { path: localPath, originalname: 'Expiring.pdf' });
    time = 11;

    await expect(service.adoptLocalPreview('demo-project', preview.id, { projectId: 'demo-project', filename: 'Expiring.pdf' }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ADOPTION_CANDIDATE_NOT_FOUND' });
    expect(fs.existsSync(localPath)).toBe(false);
  });
});