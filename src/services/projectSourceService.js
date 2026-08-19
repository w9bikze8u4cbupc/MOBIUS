import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_ID_PATTERN = /^source-[a-f0-9]{32}$/;
const DOCUMENT_FINGERPRINT_PATTERN = /^document-[a-f0-9]{32}$/;
export const PROJECT_SOURCE_VERSION = 1;

export const PROJECT_SOURCE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  PENDING_CONTEXTUAL_RENDER: 'pending_contextual_render',
  MISSING: 'missing',
  TAMPERED: 'tampered',
  LEGACY_ADOPTION_REQUIRED: 'legacy_adoption_required',
});

export class ProjectSourceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ProjectSourceError';
    this.code = code;
    this.status = status;
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireProjectId(value) {
  const projectId = typeof value === 'string' ? value.trim() : '';
  if (projectId.length > 128 || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new ProjectSourceError('PROJECT_ID_INVALID', 'Project ID is invalid.', 400);
  }
  return projectId;
}

function safeFilename(value) {
  const filename = path.basename(String(value || '')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-').trim();
  return (filename || 'rulebook.pdf').slice(0, 200);
}

function pageCountFromPdf(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new ProjectSourceError('SOURCE_PDF_INVALID', 'A readable PDF file is required.', 422);
  }
  // This is structural validation only. Browser PDF.js remains responsible for text
  // extraction; rendering is deliberately deferred to the contextual pipeline.
  const pageCount = (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  if (pageCount < 1) {
    throw new ProjectSourceError('SOURCE_PDF_INVALID', 'The PDF does not contain a readable page tree.', 422);
  }
  return pageCount;
}

function descriptorFor({ projectId, filename, bytes, pageCount }) {
  const sourceSha256 = sha256(bytes);
  const sourceId = `source-${sourceSha256.slice(0, 32)}`;
  const documentFingerprint = `document-${sha256(`${projectId}:${sourceSha256}:${bytes.length}:${pageCount}`).slice(0, 32)}`;
  return {
    version: PROJECT_SOURCE_VERSION,
    projectId,
    sourceId,
    documentId: projectId,
    documentFingerprint,
    filename: safeFilename(filename),
    sha256: sourceSha256,
    bytes: bytes.length,
    pageCount,
    provenance: 'direct_project_upload',
  };
}

function isSafeDescriptor(value, projectId) {
  return Boolean(value && value.version === PROJECT_SOURCE_VERSION && value.projectId === projectId
    && SOURCE_ID_PATTERN.test(value.sourceId || '') && value.documentId === projectId
    && DOCUMENT_FINGERPRINT_PATTERN.test(value.documentFingerprint || '')
    && typeof value.filename === 'string' && value.filename.length > 0 && value.filename.length <= 200
    && !/[\r\n\u0000-\u001f]/.test(value.filename) && !/[\\/]/.test(value.filename)
    && SHA256_PATTERN.test(value.sha256 || '') && Number.isInteger(value.bytes) && value.bytes > 0
    && Number.isInteger(value.pageCount) && value.pageCount > 0
    && value.provenance === 'direct_project_upload');
}

export function browserSafeProjectSource(value, { status = PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER } = {}) {
  return {
    sourceId: value.sourceId,
    documentId: value.documentId,
    documentFingerprint: value.documentFingerprint,
    filename: value.filename,
    sha256: value.sha256,
    bytes: value.bytes,
    pageCount: value.pageCount,
    provenance: value.provenance,
    status,
  };
}

export function createProjectSourceService({ dataRoot = path.resolve(process.cwd(), 'data'), fsImpl = fs } = {}) {
  const sourceDirectory = (projectId) => path.resolve(dataRoot, projectId, 'source');
  const sourceFile = (projectId) => path.join(sourceDirectory(projectId), 'rulebook.pdf');
  const descriptorFile = (projectId) => path.join(sourceDirectory(projectId), 'source.json');

  function safeProjectPath(projectId) {
    const directory = sourceDirectory(projectId);
    const root = path.resolve(dataRoot, projectId);
    const relative = path.relative(root, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ProjectSourceError('SOURCE_PDF_TAMPERED', 'The stored source PDF is unavailable.', 404);
    }
    return directory;
  }

  async function readDescriptor(projectId) {
    const canonicalProjectId = requireProjectId(projectId);
    try {
      const directoryStat = await fsImpl.promises.lstat(safeProjectPath(canonicalProjectId));
      const descriptorStat = await fsImpl.promises.lstat(descriptorFile(canonicalProjectId));
      const sourceStat = await fsImpl.promises.lstat(sourceFile(canonicalProjectId));
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()
        || !descriptorStat.isFile() || descriptorStat.isSymbolicLink() || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
        throw new ProjectSourceError('SOURCE_PDF_TAMPERED', 'The stored source PDF is unavailable.', 404);
      }
      const descriptor = JSON.parse(await fsImpl.promises.readFile(descriptorFile(canonicalProjectId), 'utf8'));
      if (!isSafeDescriptor(descriptor, canonicalProjectId)) {
        throw new ProjectSourceError('SOURCE_PDF_TAMPERED', 'The stored source PDF is unavailable.', 404);
      }
      const bytes = await fsImpl.promises.readFile(sourceFile(canonicalProjectId));
      const pageCount = pageCountFromPdf(bytes);
      const expected = descriptorFor({ projectId: canonicalProjectId, filename: descriptor.filename, bytes, pageCount });
      if (expected.sourceId !== descriptor.sourceId || expected.documentFingerprint !== descriptor.documentFingerprint
        || expected.sha256 !== descriptor.sha256 || expected.bytes !== descriptor.bytes || expected.pageCount !== descriptor.pageCount) {
        throw new ProjectSourceError('SOURCE_PDF_TAMPERED', 'The stored source PDF is unavailable.', 404);
      }
      return descriptor;
    } catch (error) {
      if (error instanceof ProjectSourceError) throw error;
      if (error?.code === 'ENOENT') {
        throw new ProjectSourceError('SOURCE_PDF_MISSING', 'No stored source PDF is available for this project.', 404);
      }
      throw new ProjectSourceError('SOURCE_PDF_TAMPERED', 'The stored source PDF is unavailable.', 404);
    }
  }

  async function persistUpload(projectId, uploadPath, { filename } = {}) {
    const canonicalProjectId = requireProjectId(projectId);
    if (typeof uploadPath !== 'string' || !uploadPath) {
      throw new ProjectSourceError('SOURCE_PDF_INVALID', 'A readable PDF file is required.', 422);
    }
    let uploadStat;
    try {
      uploadStat = await fsImpl.promises.lstat(uploadPath);
    } catch {
      throw new ProjectSourceError('SOURCE_PDF_INVALID', 'A readable PDF file is required.', 422);
    }
    if (!uploadStat.isFile() || uploadStat.isSymbolicLink()) {
      throw new ProjectSourceError('SOURCE_PDF_INVALID', 'A readable PDF file is required.', 422);
    }

    const stagingDirectory = path.join(path.resolve(dataRoot, canonicalProjectId), `.project-source-staging-${crypto.randomUUID()}`);
    try {
      const bytes = await fsImpl.promises.readFile(uploadPath);
      const pageCount = pageCountFromPdf(bytes);
      const descriptor = descriptorFor({ projectId: canonicalProjectId, filename: filename || uploadPath, bytes, pageCount });
      const destination = safeProjectPath(canonicalProjectId);
      if (fsImpl.existsSync(destination)) {
        const existing = await readDescriptor(canonicalProjectId);
        if (existing.sha256 === descriptor.sha256 && existing.documentFingerprint === descriptor.documentFingerprint) {
          return { descriptor: browserSafeProjectSource(existing), idempotent: true };
        }
        throw new ProjectSourceError('SOURCE_PDF_CONFLICT', 'This project already has a different stored source PDF.', 409);
      }

      await fsImpl.promises.mkdir(stagingDirectory, { recursive: true });
      const stagedPdf = path.join(stagingDirectory, 'rulebook.pdf');
      await fsImpl.promises.writeFile(stagedPdf, bytes, { flag: 'wx' });
      const copied = await fsImpl.promises.readFile(stagedPdf);
      if (copied.length !== bytes.length || sha256(copied) !== descriptor.sha256 || pageCountFromPdf(copied) !== descriptor.pageCount) {
        throw new ProjectSourceError('SOURCE_PDF_COPY_FAILED', 'The source PDF could not be stored safely.', 500);
      }
      await fsImpl.promises.writeFile(path.join(stagingDirectory, 'source.json'), `${JSON.stringify(descriptor, null, 2)}\n`, { flag: 'wx' });
      await fsImpl.promises.mkdir(path.dirname(destination), { recursive: true });
      try {
        await fsImpl.promises.rename(stagingDirectory, destination);
      } catch (error) {
        if (error?.code !== 'EEXIST' && error?.code !== 'ENOTEMPTY') throw error;
        const existing = await readDescriptor(canonicalProjectId);
        if (existing.sha256 === descriptor.sha256 && existing.documentFingerprint === descriptor.documentFingerprint) {
          return { descriptor: browserSafeProjectSource(existing), idempotent: true };
        }
        throw new ProjectSourceError('SOURCE_PDF_CONFLICT', 'This project already has a different stored source PDF.', 409);
      }
      return { descriptor: browserSafeProjectSource(descriptor), idempotent: false };
    } catch (error) {
      await fsImpl.promises.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
      if (error instanceof ProjectSourceError) throw error;
      throw new ProjectSourceError('SOURCE_PDF_COPY_FAILED', 'The source PDF could not be stored safely.', 500);
    }
  }

  async function inspect(projectId, { contextualAvailable = false } = {}) {
    const descriptor = await readDescriptor(projectId);
    return browserSafeProjectSource(descriptor, {
      status: contextualAvailable ? PROJECT_SOURCE_STATUS.AVAILABLE : PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER,
    });
  }

  async function resolveFile(projectId) {
    await readDescriptor(projectId);
    return sourceFile(requireProjectId(projectId));
  }

  return { persistUpload, inspect, readDescriptor, resolveFile };
}

export const projectSourceService = createProjectSourceService();
