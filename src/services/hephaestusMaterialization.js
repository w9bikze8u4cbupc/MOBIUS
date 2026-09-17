import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeDurableProjectSource, sameDurableProjectSource } from './projectSourceService.js';

export const HEPHAESTUS_MANIFEST_CONTRACT = 'mobius-hephaestus-materialization-v1';
export const HEPHAESTUS_MANIFEST_SCHEMA_VERSION = 1;

export class HephaestusMaterializationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HephaestusMaterializationError';
    this.code = code;
    this.classification = 'retryable_engineering';
    this.details = details;
  }
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function checkpointIdentity(projectId, source, pageCount) {
  const durableSource = source ? {
    sourceId: source.sourceId,
    documentId: source.documentId,
    documentFingerprint: source.documentFingerprint,
    filename: source.filename,
    sha256: source.sha256,
    bytes: source.bytes,
    pageCount: source.pageCount,
    provenance: source.provenance,
  } : null;
  return sha256Buffer(stable({
    contract: HEPHAESTUS_MANIFEST_CONTRACT,
    schemaVersion: HEPHAESTUS_MANIFEST_SCHEMA_VERSION,
    projectId,
    source: durableSource,
    pageCount,
  }));
}

function portablePath(outputDir, candidate, fallbackDirectory) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  const relative = path.relative(path.resolve(outputDir), resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.split(path.sep).join('/');
  return path.posix.join(fallbackDirectory, path.basename(String(candidate)));
}

function localAssetPath(manifestPath, portable) {
  if (typeof portable !== 'string' || !portable || path.isAbsolute(portable)) return null;
  const root = path.dirname(path.resolve(manifestPath));
  const target = path.resolve(root, portable);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? target : null;
}

function canonicalImage(image, outputDir, assetUrlFor) {
  const filePath = portablePath(outputDir, image.file_path || image.filePath || image.fileKey, 'images/all');
  const thumbnailPath = portablePath(outputDir, image.thumbnail_path || image.thumbnailPath || image.thumbnailKey, 'images/thumbnails');
  const localFile = filePath ? path.resolve(outputDir, filePath) : null;
  const localThumbnail = thumbnailPath ? path.resolve(outputDir, thumbnailPath) : null;
  const id = String(image.id || `asset-${sha256Buffer(filePath || JSON.stringify(image)).slice(0, 16)}`);
  const fileSha256 = localFile && fs.existsSync(localFile) ? sha256File(localFile) : image.fileSha256 || null;
  return {
    ...image,
    id,
    assetId: image.assetId || `heph_${id}`,
    file_path: filePath,
    thumbnail_path: thumbnailPath,
    fileSha256,
    contentHash: image.contentHash || fileSha256,
    fileBytes: localFile && fs.existsSync(localFile) ? fs.statSync(localFile).size : Number(image.fileBytes) || null,
    thumbnailSha256: localThumbnail && fs.existsSync(localThumbnail) ? sha256File(localThumbnail) : image.thumbnailSha256 || null,
    xref: image.xref ?? (Number(String(id).match(/xref(\d+)/i)?.[1]) || null),
    reviewState: image.reviewState || 'pending_curation',
    downloadUrl: typeof assetUrlFor === 'function' ? assetUrlFor(image.assetId || `heph_${id}`, 'source') : image.downloadUrl || null,
    thumbnailUrl: typeof assetUrlFor === 'function' ? assetUrlFor(image.assetId || `heph_${id}`, 'thumbnail') : image.thumbnailUrl || null,
  };
}

export function buildCanonicalHephaestusManifest({
  projectId,
  sourceDescriptor,
  outputDir,
  extractionResult,
  generatedAt = new Date().toISOString(),
  assetUrlFor,
} = {}) {
  const source = normalizeDurableProjectSource(sourceDescriptor, projectId);
  if (!source) throw new HephaestusMaterializationError('HEPHAESTUS_SOURCE_INVALID', 'HEPHAESTUS requires a valid canonical source descriptor.');
  const images = (Array.isArray(extractionResult?.images) ? extractionResult.images : [])
    .map((image) => canonicalImage(image, outputDir, assetUrlFor))
    .map((image) => ({
      ...image,
      provenance: {
        ...(image.provenance || {}),
        projectId,
        sourcePdfSha256: source.sha256,
        sourceId: source.sourceId,
        documentId: source.documentId,
        pageIndex: Number.isInteger(Number(image.page_index)) ? Number(image.page_index) : null,
        xref: image.xref,
        extraction: 'pymupdf-native-raster',
      },
    }));
  return {
    contract: HEPHAESTUS_MANIFEST_CONTRACT,
    schemaVersion: HEPHAESTUS_MANIFEST_SCHEMA_VERSION,
    projectId,
    source,
    sourcePdfSha256: source.sha256,
    sourcePdfIdentity: {
      sourceId: source.sourceId,
      documentId: source.documentId,
      documentFingerprint: source.documentFingerprint,
      filename: source.filename,
      bytes: source.bytes,
      pageCount: source.pageCount,
      provenance: source.provenance,
    },
    pageCount: source.pageCount,
    extractionRoot: 'hephaestus',
    generator: { name: 'HEPHAESTUS', mode: 'native-pdf-raster' },
    generatedAt,
    checkpointIdentity: checkpointIdentity(projectId, source, source.pageCount),
    success: extractionResult?.success !== false,
    stats: extractionResult?.stats || {},
    images,
  };
}

export function validateCanonicalHephaestusManifest(manifest, {
  manifestPath,
  projectId,
  sourceDescriptor,
  requireFiles = true,
} = {}) {
  const errors = [];
  const expectedSource = normalizeDurableProjectSource(sourceDescriptor, projectId);
  const actualSource = normalizeDurableProjectSource(manifest?.source, projectId);
  if (manifest?.contract !== HEPHAESTUS_MANIFEST_CONTRACT || manifest?.schemaVersion !== HEPHAESTUS_MANIFEST_SCHEMA_VERSION) errors.push('manifest-contract');
  if (manifest?.projectId !== projectId) errors.push('project-identity');
  if (!expectedSource || !actualSource || !sameDurableProjectSource(expectedSource, actualSource)) errors.push('source-identity');
  if (manifest?.sourcePdfSha256 !== expectedSource?.sha256) errors.push('source-sha256');
  if (manifest?.pageCount !== expectedSource?.pageCount) errors.push('page-count');
  if (manifest?.checkpointIdentity !== checkpointIdentity(projectId, expectedSource, expectedSource?.pageCount)) errors.push('checkpoint-identity');
  if (manifest?.success !== true || !Array.isArray(manifest?.images)) errors.push('extraction-result');
  const assetErrors = [];
  if (Array.isArray(manifest?.images)) {
    const ids = new Set();
    for (const image of manifest.images) {
      if (!image?.id || ids.has(image.id)) assetErrors.push(`${image?.id || 'missing-id'}:identity`);
      ids.add(image?.id);
      const file = manifestPath ? localAssetPath(manifestPath, image?.file_path) : null;
      if (!file) assetErrors.push(`${image?.id || 'unknown'}:path`);
      else if (requireFiles) {
        if (!fs.existsSync(file)) assetErrors.push(`${image.id}:missing-file`);
        else {
          if (image.fileBytes && fs.statSync(file).size !== image.fileBytes) assetErrors.push(`${image.id}:bytes`);
          if (image.fileSha256 && sha256File(file) !== image.fileSha256) assetErrors.push(`${image.id}:sha256`);
        }
      }
    }
  }
  if (assetErrors.length) errors.push('assets');
  return { valid: errors.length === 0, errors, assetErrors };
}

export async function writeCanonicalHephaestusManifest(manifestPath, manifest) {
  await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true });
  const temporary = `${manifestPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporary, manifestPath);
  return manifestPath;
}

function readManifest(manifestPath) {
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return null; }
}

export async function ensureCanonicalHephaestusMaterialization({
  projectId,
  sourceDescriptor,
  sourcePdfPath,
  outputDir,
  extractor,
  assetUrlFor,
} = {}) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const existing = readManifest(manifestPath);
  if (existing?.contract === HEPHAESTUS_MANIFEST_CONTRACT) {
    const validation = validateCanonicalHephaestusManifest(existing, { manifestPath, projectId, sourceDescriptor });
    if (validation.valid) return { manifest: existing, manifestPath, reused: true, regenerated: false, validation };
  } else if (existing?.success === true && Array.isArray(existing.images)) {
    const upgraded = buildCanonicalHephaestusManifest({ projectId, sourceDescriptor, outputDir, extractionResult: existing, assetUrlFor });
    const validation = validateCanonicalHephaestusManifest(upgraded, { manifestPath, projectId, sourceDescriptor });
    if (validation.valid) {
      await writeCanonicalHephaestusManifest(manifestPath, upgraded);
      return { manifest: upgraded, manifestPath, reused: true, regenerated: false, upgraded: true, validation };
    }
  }
  if (typeof extractor !== 'function') {
    throw new HephaestusMaterializationError('HEPHAESTUS_MATERIALIZATION_REQUIRED', 'A missing or invalid HEPHAESTUS manifest requires canonical materialization.');
  }
  let result;
  try {
    result = await extractor(sourcePdfPath, outputDir, { minWidth: 1, minHeight: 1 });
  } catch (cause) {
    throw new HephaestusMaterializationError('HEPHAESTUS_MATERIALIZATION_FAILED', `HEPHAESTUS materialization failed: ${cause.message}`, { cause: cause.message });
  }
  if (!result?.success) throw new HephaestusMaterializationError('HEPHAESTUS_MATERIALIZATION_FAILED', result?.error || 'HEPHAESTUS returned an invalid extraction result.');
  const manifest = buildCanonicalHephaestusManifest({ projectId, sourceDescriptor, outputDir, extractionResult: result, assetUrlFor });
  await writeCanonicalHephaestusManifest(manifestPath, manifest);
  const validation = validateCanonicalHephaestusManifest(manifest, { manifestPath, projectId, sourceDescriptor });
  if (!validation.valid) {
    throw new HephaestusMaterializationError('HEPHAESTUS_MANIFEST_INVALID', 'HEPHAESTUS produced a manifest that failed canonical validation.', validation);
  }
  return { manifest, manifestPath, reused: false, regenerated: true, validation };
}

async function mapWithConcurrency(values, limit, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length || 1) }, worker));
  return output;
}

export async function synchronizeCanonicalHephaestusMaterialization({
  remoteManifest,
  outputDir,
  projectId,
  sourceDescriptor,
  fetchAsset,
  concurrency = 8,
} = {}) {
  const targetManifestPath = path.join(outputDir, 'manifest.json');
  const metadataValidation = validateCanonicalHephaestusManifest(remoteManifest, {
    manifestPath: targetManifestPath, projectId, sourceDescriptor, requireFiles: false,
  });
  if (!metadataValidation.valid) {
    throw new HephaestusMaterializationError('HEPHAESTUS_REMOTE_MANIFEST_INVALID', 'The API HEPHAESTUS manifest does not match the canonical project source.', metadataValidation);
  }
  if (typeof fetchAsset !== 'function' && remoteManifest.images.length) {
    throw new HephaestusMaterializationError('HEPHAESTUS_ASSET_TRANSPORT_UNAVAILABLE', 'HEPHAESTUS assets require a canonical transport function.');
  }
  const parent = path.dirname(outputDir);
  const staging = path.join(parent, `.hephaestus-staging-${process.pid}-${crypto.randomUUID()}`);
  try {
    await fs.promises.mkdir(staging, { recursive: true });
    await mapWithConcurrency(remoteManifest.images, concurrency, async (image) => {
      const target = localAssetPath(path.join(staging, 'manifest.json'), image.file_path);
      if (!target) throw new HephaestusMaterializationError('HEPHAESTUS_ASSET_PATH_INVALID', `Invalid HEPHAESTUS asset path: ${image.file_path}`);
      const bytes = Buffer.from(await fetchAsset(image.downloadUrl, image));
      if (image.fileBytes && bytes.length !== image.fileBytes) throw new HephaestusMaterializationError('HEPHAESTUS_ASSET_BYTES_MISMATCH', `HEPHAESTUS asset byte count mismatch: ${image.id}`);
      if (image.fileSha256 && sha256Buffer(bytes) !== image.fileSha256) throw new HephaestusMaterializationError('HEPHAESTUS_ASSET_SHA_MISMATCH', `HEPHAESTUS asset SHA mismatch: ${image.id}`);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, bytes);
    });
    const localManifest = {
      ...remoteManifest,
      images: remoteManifest.images.map((image) => ({ ...image, thumbnail_path: null, thumbnailSha256: null, thumbnailUrl: null })),
    };
    const stagingManifestPath = path.join(staging, 'manifest.json');
    await writeCanonicalHephaestusManifest(stagingManifestPath, localManifest);
    const validation = validateCanonicalHephaestusManifest(localManifest, { manifestPath: stagingManifestPath, projectId, sourceDescriptor });
    if (!validation.valid) throw new HephaestusMaterializationError('HEPHAESTUS_MANIFEST_INVALID', 'Synchronized HEPHAESTUS evidence failed validation.', validation);
    await fs.promises.rm(outputDir, { recursive: true, force: true });
    await fs.promises.rename(staging, outputDir);
    return { manifest: localManifest, manifestPath: targetManifestPath, reused: false, synchronized: true, validation };
  } catch (error) {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (error instanceof HephaestusMaterializationError) throw error;
    throw new HephaestusMaterializationError('HEPHAESTUS_SYNCHRONIZATION_FAILED', `HEPHAESTUS synchronization failed: ${error.message}`);
  }
}

export function readCanonicalHephaestusManifest(manifestPath) {
  return readManifest(manifestPath);
}
