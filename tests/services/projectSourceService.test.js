import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROJECT_SOURCE_STATUS,
  ProjectSourceError,
  createProjectSourceService,
  normalizeDurableProjectSource,
  sameDurableProjectSource,
} from '../../src/services/projectSourceService.js';

const projectId = 'source-contract-project';
const pdf = (label = 'fixture') => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n% ${label}\n`);

describe('project source service', () => {
  let temporaryRoot;
  let uploadPath;
  let service;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-source-'));
    uploadPath = path.join(temporaryRoot, 'upload.pdf');
    fs.writeFileSync(uploadPath, pdf());
    service = createProjectSourceService({ dataRoot: path.join(temporaryRoot, 'data') });
  });

  afterEach(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  it('atomically persists a path-free project-owned source and verifies it after a service restart', async () => {
    const saved = await service.persistUpload(projectId, uploadPath, { filename: 'Abyss Rulebook.pdf' });
    const sourceRoot = path.join(temporaryRoot, 'data', projectId, 'source');

    expect(saved).toMatchObject({ idempotent: false, descriptor: {
      sourceId: expect.stringMatching(/^source-[a-f0-9]{32}$/),
      documentId: projectId,
      documentFingerprint: expect.stringMatching(/^document-[a-f0-9]{32}$/),
      filename: 'Abyss Rulebook.pdf', bytes: pdf().length, pageCount: 1,
      provenance: 'direct_project_upload', status: PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER,
    } });
    expect(fs.existsSync(path.join(sourceRoot, 'rulebook.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(sourceRoot, 'source.json'))).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(temporaryRoot);
    expect(JSON.stringify(saved)).not.toContain('%PDF-');

    const restarted = createProjectSourceService({ dataRoot: path.join(temporaryRoot, 'data') });
    await expect(restarted.inspect(projectId)).resolves.toEqual(expect.objectContaining({
      sourceId: saved.descriptor.sourceId,
      documentFingerprint: saved.descriptor.documentFingerprint,
      status: PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER,
    }));
    await expect(restarted.resolveFile(projectId)).resolves.toBe(path.join(sourceRoot, 'rulebook.pdf'));
  });

  it('normalizes one path-free durable contract and rejects path-bearing or foreign identities', async () => {
    const saved = await service.persistUpload(projectId, uploadPath, { filename: 'Abyss Rulebook.pdf' });
    const normalized = normalizeDurableProjectSource(saved.descriptor, projectId);

    expect(normalized).toEqual(saved.descriptor);
    expect(sameDurableProjectSource(normalized, saved.descriptor)).toBe(true);
    expect(normalizeDurableProjectSource({ ...saved.descriptor, sha256: '0'.repeat(64) }, projectId)).not.toBeNull();
    expect(sameDurableProjectSource(normalized, { ...saved.descriptor, sha256: '0'.repeat(64) })).toBe(false);
    expect(normalizeDurableProjectSource({ ...saved.descriptor, documentId: 'other-project' }, projectId)).toBeNull();
    expect(normalizeDurableProjectSource({ ...saved.descriptor, sourcePath: 'C:\\private\\rulebook.pdf' }, projectId)).toBeNull();
  });

  it('does not treat equivalent normalized upload paths as different source identities', async () => {
    const nested = path.join(temporaryRoot, 'nested');
    fs.mkdirSync(nested);
    const normalizedUploadPath = path.join(nested, '..', 'upload.pdf');
    const first = await service.persistUpload(projectId, normalizedUploadPath, { filename: 'Abyss.pdf' });
    const second = await service.persistUpload(projectId, path.resolve(uploadPath), { filename: 'Abyss.pdf' });

    expect(second.idempotent).toBe(true);
    expect(sameDurableProjectSource(first.descriptor, second.descriptor)).toBe(true);
  });

  it('is idempotent for the same bytes and rejects a different source for the same project', async () => {
    const first = await service.persistUpload(projectId, uploadPath, { filename: 'Abyss.pdf' });
    const second = await service.persistUpload(projectId, uploadPath, { filename: 'Renamed.pdf' });
    const otherUpload = path.join(temporaryRoot, 'other.pdf');
    fs.writeFileSync(otherUpload, pdf('different'));

    expect(second).toMatchObject({ idempotent: true, descriptor: { sourceId: first.descriptor.sourceId, filename: 'Abyss.pdf' } });
    await expect(service.persistUpload(projectId, otherUpload, { filename: 'Different.pdf' }))
      .rejects.toMatchObject({ code: 'SOURCE_PDF_CONFLICT', status: 409 });
  });

  it('fails closed for source bytes, descriptor, and symlink tampering without leaking a path', async () => {
    await service.persistUpload(projectId, uploadPath, { filename: 'Abyss.pdf' });
    const sourceRoot = path.join(temporaryRoot, 'data', projectId, 'source');
    fs.writeFileSync(path.join(sourceRoot, 'rulebook.pdf'), pdf('tampered'));

    await expect(service.inspect(projectId)).rejects.toMatchObject({ code: 'SOURCE_PDF_TAMPERED', status: 404 });
    await expect(service.inspect('../unsafe')).rejects.toMatchObject({ code: 'PROJECT_ID_INVALID', status: 400 });
    await expect(service.inspect('missing-project')).rejects.toMatchObject({ code: 'SOURCE_PDF_MISSING', status: 404 });
    await expect(service.inspect(projectId)).rejects.not.toHaveProperty('message', expect.stringContaining(temporaryRoot));
  });

  it('removes staging and publishes no source reference when copying fails', async () => {
    const dataRoot = path.join(temporaryRoot, 'data');
    const failingFs = {
      ...fs,
      promises: {
        ...fs.promises,
        writeFile: jest.fn((target, contents, options) => {
          if (path.basename(target) === 'rulebook.pdf') throw new Error('simulated copy failure');
          return fs.promises.writeFile(target, contents, options);
        }),
      },
    };
    const failingService = createProjectSourceService({ dataRoot, fsImpl: failingFs });

    await expect(failingService.persistUpload(projectId, uploadPath, { filename: 'Abyss.pdf' }))
      .rejects.toBeInstanceOf(ProjectSourceError);
    const projectRoot = path.join(dataRoot, projectId);
    expect(fs.existsSync(path.join(projectRoot, 'source', 'source.json'))).toBe(false);
    expect(fs.existsSync(projectRoot) ? fs.readdirSync(projectRoot).filter((name) => name.startsWith('.project-source-staging-')) : [])
      .toEqual([]);
  });
});


test('treats a source descriptor fingerprint mismatch as tampered', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-source-fingerprint-'));
  try {
    const uploadPath = path.join(temporaryRoot, 'upload.pdf');
    fs.writeFileSync(uploadPath, pdf());
    const service = createProjectSourceService({ dataRoot: path.join(temporaryRoot, 'data') });
    await service.persistUpload(projectId, uploadPath, { filename: 'Abyss.pdf' });
    const descriptorPath = path.join(temporaryRoot, 'data', projectId, 'source', 'source.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    descriptor.documentFingerprint = 'document-ffffffffffffffffffffffffffffffff';
    fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));
    await expect(service.inspect(projectId)).rejects.toMatchObject({ code: 'SOURCE_PDF_TAMPERED', status: 404 });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
