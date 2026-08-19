import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DEFAULT_RENDER_PROFILE, withContextualEvidenceLock } from './contextualEvidenceService.js';

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const CONTEXTUAL_ADOPTION_MAX_BYTES = 100 * 1024 * 1024;
export const CONTEXTUAL_ADOPTION_MAX_PAGES = 250;
export const CONTEXTUAL_ADOPTION_PREVIEW_TTL_MS = 15 * 60 * 1000;
export const CONTEXTUAL_ADOPTION_LINKS_VERSION = 1;

export class ContextualEvidenceAdoptionError extends Error {
  constructor(code, message, status = 400, cause = null) {
    super(message);
    this.name = 'ContextualEvidenceAdoptionError';
    this.code = code;
    this.status = status;
    this.cause = cause || undefined;
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireProjectId(projectId) {
  if (typeof projectId !== 'string' || projectId.length > 128 || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new ContextualEvidenceAdoptionError('PROJECT_ID_INVALID', 'Project ID is invalid.', 400);
  }
  return projectId;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeFilename(value) {
  const filename = path.basename(String(value || '')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-').trim();
  return filename ? filename.slice(0, 200) : null;
}

function parsePdfPageCount(bytes) {
  // A preview is optional for arbitrary PDF parsing, but adoption requires a bounded,
  // deterministic count before the renderer is invoked. Page dictionaries are part of
  // the standard PDF page tree and are deliberately counted only when unambiguous.
  const matches = bytes.toString('latin1').match(/\/Type\s*\/Page\b/g);
  return matches?.length || null;
}

function profileMatches(actual, expected) {
  return actual && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function candidateId(projectId, sourceSha256, filename, sourceRecordId) {
  return `candidate-${sha256(`${projectId}:${sourceSha256}:${filename}:${sourceRecordId}`).slice(0, 32)}`;
}

function candidateDto(input) {
  const {
    id, filename, bytes, pageCount, provenance, eligible = true, reason = null, source,
  } = input;
  const sourceSha256 = input.sourceSha256 || input.sha256;
  return {
    id,
    filename,
    bytes,
    sha256: sourceSha256,
    sha256Prefix: sourceSha256.slice(0, 12),
    pageCount,
    source,
    matchingEvidence: provenance,
    eligible,
    ...(reason ? { reason } : {}),
  };
}

function confirmationFor(input) {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return null; }
  }
  return input && typeof input === 'object' ? input : null;
}

function requiresConfirmation(projectId, candidate, confirmation) {
  const parsed = confirmationFor(confirmation);
  if (!parsed || parsed.projectId !== projectId || parsed.filename !== candidate.filename) {
    throw new ContextualEvidenceAdoptionError(
      'CONTEXTUAL_ADOPTION_CONFIRMATION_REQUIRED',
      'Confirm the named project and source file before adopting contextual evidence.',
      400,
    );
  }
}

function isEvidenceUnavailable(error) {
  return error?.code === 'CONTEXTUAL_EVIDENCE_UNAVAILABLE';
}

/**
 * Fail-closed adoption coordinator. It owns no contextual evidence storage: successful
 * adoption delegates exactly once to contextualEvidence.persistUpload(), which remains
 * the sole canonical source/pages/manifest transaction.
 */
export function createContextualEvidenceAdoptionService({
  contextualEvidence,
  uploadRoot = path.resolve(process.cwd(), 'src/api/uploads'),
  linkRegistryPath = path.resolve(process.cwd(), 'data/contextual-evidence-adoption-links.json'),
  readFile = fs.promises.readFile,
  stat = fs.promises.stat,
  lstat = fs.promises.lstat,
  unlink = fs.promises.unlink,
  renderProfile = DEFAULT_RENDER_PROFILE,
  maxBytes = CONTEXTUAL_ADOPTION_MAX_BYTES,
  maxPages = CONTEXTUAL_ADOPTION_MAX_PAGES,
  pageCountPreview = parsePdfPageCount,
  previewTtlMs = CONTEXTUAL_ADOPTION_PREVIEW_TTL_MS,
  now = () => Date.now(),
} = {}) {
  if (!contextualEvidence || typeof contextualEvidence.persistUpload !== 'function' || typeof contextualEvidence.inventory !== 'function') {
    throw new Error('contextualEvidence with persistUpload and inventory is required');
  }
  const localPreviews = new Map();
  const localPreviewTimers = new Map();
  const absoluteUploadRoot = path.resolve(uploadRoot);

  async function discardLocalPreview(id) {
    const candidate = localPreviews.get(id);
    localPreviews.delete(id);
    const timer = localPreviewTimers.get(id);
    if (timer) clearTimeout(timer);
    localPreviewTimers.delete(id);
    if (candidate?.path) await unlink(candidate.path).catch(() => {});
  }

  async function purgeExpiredPreviews() {
    const expiry = now() - previewTtlMs;
    const expired = [...localPreviews.entries()]
      .filter(([, candidate]) => candidate.createdAt <= expiry)
      .map(([id]) => discardLocalPreview(id));
    await Promise.all(expired);
  }

  function schedulePreviewExpiry(id) {
    const timer = setTimeout(() => { discardLocalPreview(id).catch(() => {}); }, previewTtlMs);
    timer.unref?.();
    localPreviewTimers.set(id, timer);
  }

  async function verifyPdf(filePath, filename) {
    const safeName = safeFilename(filename);
    if (!safeName || path.extname(safeName).toLowerCase() !== '.pdf') {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'The selected source must be a PDF file.', 422);
    }
    const resolved = path.resolve(filePath || '');
    if (!isWithin(absoluteUploadRoot, resolved)) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_PROJECT_MISMATCH', 'The source is not an approved project upload.', 403);
    }
    let metadata;
    let bytes;
    try {
      const entry = await lstat(resolved);
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('source is not a regular file');
      metadata = await stat(resolved);
      if (!metadata.isFile() || metadata.size < 1 || metadata.size > maxBytes) throw new Error('source size is invalid');
      bytes = await readFile(resolved);
    } catch (error) {
      if (error instanceof ContextualEvidenceAdoptionError) throw error;
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'The source PDF is unavailable or unreadable.', 422, error);
    }
    if (bytes.length !== metadata.size || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'The source is not a readable PDF.', 422);
    }
    const pageCount = pageCountPreview(bytes);
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > maxPages) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'The source PDF page count is unavailable or exceeds the adoption limit.', 422);
    }
    return { path: resolved, filename: safeName, bytes: bytes.length, sha256: sha256(bytes), pageCount };
  }

  async function registryLinks() {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(linkRegistryPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      // A malformed operator registry is intentionally equivalent to no trusted links.
      return [];
    }
    if (!parsed || parsed.version !== CONTEXTUAL_ADOPTION_LINKS_VERSION || !Array.isArray(parsed.links)) return [];
    return parsed.links;
  }

  function safeRegistryRecord(record, projectId) {
    if (!record || record.projectId !== projectId || typeof record.storedFilename !== 'string'
      || path.basename(record.storedFilename) !== record.storedFilename || !safeFilename(record.originalFilename)
      || !SAFE_RECORD_ID_PATTERN.test(record.sourceRecordId || '') || !SHA256_PATTERN.test(record.sha256 || '')
      || !Number.isInteger(record.bytes) || record.bytes < 1 || typeof record.projectName !== 'string' || !record.projectName.trim()) return null;
    return {
      projectId,
      storedFilename: record.storedFilename,
      originalFilename: safeFilename(record.originalFilename),
      sourceRecordId: record.sourceRecordId,
      sha256: record.sha256,
      bytes: record.bytes,
      projectName: record.projectName.trim().slice(0, 160),
    };
  }

  async function legacyCandidate(record) {
    const id = candidateId(record.projectId, record.sha256, record.originalFilename, record.sourceRecordId);
    const provenance = {
      originalFilename: record.originalFilename,
      projectName: record.projectName,
      sourceRecordId: record.sourceRecordId,
      linkage: 'project-owned-upload-record',
    };
    try {
      const verified = await verifyPdf(path.join(absoluteUploadRoot, record.storedFilename), record.originalFilename);
      if (verified.bytes !== record.bytes || verified.sha256 !== record.sha256) {
        throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_PROJECT_MISMATCH', 'The linked source no longer matches its project-owned upload record.', 409);
      }
      return { ...verified, id, provenance, source: 'verified_legacy_upload' };
    } catch (error) {
      return candidateDto({
        id, filename: record.originalFilename, bytes: record.bytes, sourceSha256: record.sha256,
        pageCount: null, provenance, source: 'verified_legacy_upload', eligible: false,
        reason: error?.code || 'CONTEXTUAL_ADOPTION_SOURCE_INVALID',
      });
    }
  }

  async function discover(projectId) {
    requireProjectId(projectId);
    const records = (await registryLinks()).map((record) => safeRegistryRecord(record, projectId)).filter(Boolean);
    const checked = await Promise.all(records.map(legacyCandidate));
    const eligible = checked.filter((candidate) => candidate.eligible !== false);
    if (eligible.length === 1) {
      const candidate = candidateDto(eligible[0]);
      return { projectId, status: 'ready', candidates: [candidate], eligibleCandidate: candidate };
    }
    if (eligible.length > 1) {
      const candidates = checked.map((candidate) => candidate.eligible === false ? candidate : candidateDto({ ...candidate, eligible: false, reason: 'CONTEXTUAL_ADOPTION_CANDIDATE_AMBIGUOUS' }));
      return { projectId, status: 'ambiguous', code: 'CONTEXTUAL_ADOPTION_CANDIDATE_AMBIGUOUS', candidates, eligibleCandidate: null };
    }
    return {
      projectId,
      status: 'none',
      code: 'CONTEXTUAL_ADOPTION_NO_CANDIDATE',
      candidates: checked,
      eligibleCandidate: null,
    };
  }

  async function existingInventory(projectId, documentSha256) {
    try {
      const inventory = await contextualEvidence.inventory(projectId);
      if (inventory?.source?.sha256 === documentSha256 && profileMatches(inventory.renderProfile, renderProfile)) {
        return { inventory, idempotent: true };
      }
      throw new ContextualEvidenceAdoptionError(
        'CONTEXTUAL_ADOPTION_CONFLICT',
        'A different contextual source already exists; explicit replacement is required.',
        409,
      );
    } catch (error) {
      if (error instanceof ContextualEvidenceAdoptionError || !isEvidenceUnavailable(error)) throw error;
      return null;
    }
  }

  async function adoptVerified(projectId, candidate) {
    return withContextualEvidenceLock(projectId, async () => {
      const current = await existingInventory(projectId, candidate.sha256);
      if (current) return { inventory: current.inventory, idempotent: true };
      try {
        const inventory = await contextualEvidence.persistUpload(projectId, candidate.path, {
          filename: candidate.filename,
          provenance: candidate.source === 'verified_legacy_upload'
            ? { kind: 'verified_legacy_upload', sourceRecordId: candidate.provenance?.sourceRecordId }
            : { kind: 'operator_selected_local_upload' },
        });
        if (inventory?.source?.sha256 !== candidate.sha256 || !profileMatches(inventory.renderProfile, renderProfile)) {
          throw new Error('canonical manifest did not match the verified source');
        }
        return { inventory, idempotent: false };
      } catch (error) {
        if (error instanceof ContextualEvidenceAdoptionError) throw error;
        const adoptionError = new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_RENDER_FAILED', 'Contextual review pages could not be created; no source was adopted.', 422, error);
        adoptionError.correlationId = error?.correlationId;
        adoptionError.renderSubcode = error?.renderSubcode;
        throw adoptionError;
      }
    });
  }

  async function previewLocalUpload(projectId, file) {
    requireProjectId(projectId);
    await purgeExpiredPreviews();
    if (!file?.path || !file?.originalname) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'A local PDF file is required.', 400);
    }
    let verified;
    try {
      verified = await verifyPdf(file.path, file.originalname);
    } catch (error) {
      await unlink(file.path).catch(() => {});
      throw error;
    }
    const id = `local-${crypto.randomUUID()}`;
    const candidate = {
      ...verified,
      id,
      projectId,
      source: 'local_upload_preview',
      provenance: { originalFilename: verified.filename, linkage: 'operator-selected-local-upload' },
      createdAt: now(),
    };
    localPreviews.set(id, candidate);
    schedulePreviewExpiry(id);
    return candidateDto(candidate);
  }

  async function adoptLocalPreview(projectId, candidateIdValue, confirmation) {
    requireProjectId(projectId);
    await purgeExpiredPreviews();
    const candidate = localPreviews.get(candidateIdValue);
    if (!candidate) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_CANDIDATE_NOT_FOUND', 'The verified local source is no longer available; choose the PDF again.', 404);
    }
    if (candidate.projectId !== projectId) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_PROJECT_MISMATCH', 'The source does not belong to this project.', 403);
    }
    requiresConfirmation(projectId, candidate, confirmation);
    const timer = localPreviewTimers.get(candidateIdValue);
    if (timer) clearTimeout(timer);
    localPreviewTimers.delete(candidateIdValue);
    try {
      const revalidated = await verifyPdf(candidate.path, candidate.filename);
      if (revalidated.sha256 !== candidate.sha256 || revalidated.bytes !== candidate.bytes || revalidated.pageCount !== candidate.pageCount) {
        throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'The selected PDF changed after verification.', 422);
      }
      return await adoptVerified(projectId, { ...candidate, ...revalidated });
    } finally {
      await discardLocalPreview(candidateIdValue);
    }
  }

  async function adoptLegacy(projectId, candidateIdValue, confirmation) {
    requireProjectId(projectId);
    const discovery = await discover(projectId);
    if (discovery.status === 'ambiguous') {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_CANDIDATE_AMBIGUOUS', 'Multiple linked legacy sources require a local PDF selection.', 409);
    }
    const candidate = discovery.eligibleCandidate;
    if (!candidate || candidate.id !== candidateIdValue) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_NO_CANDIDATE', 'No eligible verified legacy source is available for this project.', 404);
    }
    requiresConfirmation(projectId, candidate, confirmation);
    const record = (await registryLinks()).map((entry) => safeRegistryRecord(entry, projectId)).filter(Boolean)
      .find((entry) => candidateId(projectId, entry.sha256, entry.originalFilename, entry.sourceRecordId) === candidate.id);
    if (!record) {
      throw new ContextualEvidenceAdoptionError('CONTEXTUAL_ADOPTION_PROJECT_MISMATCH', 'The legacy source is no longer linked to this project.', 409);
    }
    const revalidated = await legacyCandidate(record);
    if (revalidated.eligible === false || revalidated.id !== candidate.id) {
      throw new ContextualEvidenceAdoptionError(revalidated.reason || 'CONTEXTUAL_ADOPTION_SOURCE_INVALID', 'The verified legacy source changed before adoption.', 409);
    }
    return adoptVerified(projectId, revalidated);
  }

  return { discover, previewLocalUpload, adoptLocalPreview, adoptLegacy };
}
