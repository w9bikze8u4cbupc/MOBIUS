import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { renderPdfPages } from './imagePipeline.js';

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
export const CONTEXTUAL_EVIDENCE_VERSION = 1;
export const DEFAULT_RENDER_PROFILE = Object.freeze({
  id: 'pdf-to-img-review-144dpi-png-v1',
  renderer: 'pdf-to-img',
  version: '5.0.0',
  format: 'png',
  dpi: 144,
});
export const MINIMUM_CROP_PIXELS = 32;

export class ContextualEvidenceError extends Error {
  constructor(code, message, status = 400, cause = null, diagnostic = null) {
    super(message);
    this.name = 'ContextualEvidenceError';
    this.code = code;
    this.status = status;
    this.cause = cause || undefined;
    this.correlationId = diagnostic?.correlationId || undefined;
    this.renderSubcode = diagnostic?.subcode || undefined;
    this.diagnostic = diagnostic || undefined;
  }
}

function taggedRenderFailure(subcode, message, cause = null) {
  const error = new Error(message);
  error.contextualRenderSubcode = subcode;
  error.cause = cause || undefined;
  return error;
}

function sanitizeRenderSummary(value) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ')
    .replace(/[A-Za-z]:[\\/][^'"`]+/g, '<path>')
    .replace(/(?:^|\s)\/[^'"`]+/g, ' <path>')
    .replace(/%PDF-[^\s]*/g, '<pdf-content>')
    .trim();
  return text ? text.slice(0, 240) : null;
}

function renderDiagnostic(correlationId, error, { phase, expectedPageCount = null, actualPageCount = null } = {}) {
  const subcode = error?.subcode || error?.contextualRenderSubcode || (
    phase === 'page_count' ? 'CONTEXTUAL_RENDER_PAGE_COUNT_MISMATCH'
      : phase === 'page_validation' || phase === 'page_persist' ? 'CONTEXTUAL_RENDER_OUTPUT_VALIDATION_FAILED'
        : phase === 'publish' ? 'CONTEXTUAL_RENDER_ATOMIC_PUBLISH_FAILED'
          : 'CONTEXTUAL_RENDER_IN_PROCESS_FAILURE'
  );
  return {
    correlationId,
    subcode,
    command: 'pdf-to-img/pdfjs in-process',
    exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
    expectedPageCount,
    actualPageCount,
    stderrSummary: sanitizeRenderSummary(error?.stderr),
    errorSummary: sanitizeRenderSummary(error?.message),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireProjectId(projectId) {
  if (typeof projectId !== 'string' || projectId.length > 128 || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new ContextualEvidenceError('PROJECT_ID_INVALID', 'Project ID is invalid.', 400);
  }
  return projectId;
}

function requireSafeId(value, code = 'CONTEXTUAL_ASSET_INVALID') {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw new ContextualEvidenceError(code, 'Contextual asset ID is invalid.', 400);
  }
  return value;
}

function safeFilename(value) {
  const filename = path.basename(String(value || '')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-').trim();
  return filename ? filename.slice(0, 200) : 'rulebook.pdf';
}

function safeProvenance(value) {
  const kind = value?.kind === 'verified_legacy_upload' || value?.kind === 'operator_selected_local_upload'
    ? value.kind : 'direct_project_upload';
  const sourceRecordId = typeof value?.sourceRecordId === 'string' && SAFE_ID_PATTERN.test(value.sourceRecordId)
    ? value.sourceRecordId : null;
  return { kind, ...(sourceRecordId ? { sourceRecordId } : {}) };
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safePath(root, relativePath) {
  const candidate = path.resolve(root, relativePath);
  if (!isWithin(root, candidate)) {
    throw new ContextualEvidenceError('CONTEXTUAL_ASSET_FORBIDDEN', 'Contextual asset cannot be served.', 403);
  }
  return candidate;
}

async function writeAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, contents);
  await fs.promises.rename(temporaryPath, filePath);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectedPageFilename(pageNumber) {
  return `page-${String(pageNumber).padStart(4, '0')}.png`;
}

function pageAssetId(documentSha256, pageNumber, renderProfileId, rasterSha256) {
  return `page-${sha256(`${documentSha256}:${pageNumber}:${renderProfileId}:${rasterSha256}`).slice(0, 32)}`;
}

function cropAssetId(pageId, coordinates) {
  return `crop-${sha256(`${pageId}:${coordinates.x}:${coordinates.y}:${coordinates.width}:${coordinates.height}`).slice(0, 32)}`;
}

function cropDescriptor(manifest, page, input = {}, minimumCropPixels) {
  const x = Number(input.x);
  const y = Number(input.y);
  const width = Number(input.width);
  const height = Number(input.height);
  const fields = [x, y, width, height];
  if (!fields.every(Number.isInteger) || x < 0 || y < 0 || width < minimumCropPixels || height < minimumCropPixels) {
    throw new ContextualEvidenceError('CONTEXTUAL_CROP_INVALID', `Crop coordinates must be in bounds with dimensions of at least ${minimumCropPixels} pixels.`, 400);
  }
  if (x + width > page.width || y + height > page.height) {
    throw new ContextualEvidenceError('CONTEXTUAL_CROP_OUT_OF_BOUNDS', 'Crop exceeds the source page bounds.', 400);
  }
  const coordinates = { x, y, width, height };
  const confirmed = input.contextualConfirmation === true;
  return {
    id: cropAssetId(page.assetId, coordinates),
    kind: 'contextual_crop',
    source: 'rulebook_context',
    parentPageAssetId: page.assetId,
    documentSha256: manifest.source.sha256,
    pageRasterSha256: page.sha256,
    coordinates,
    renderProfileId: manifest.renderProfile.id,
    origin: 'operator_crop',
    capabilities: [
      'overview', 'rulebook_reference', 'supporting',
      ...(confirmed ? ['board_setup_context'] : []),
    ],
  };
}

function pageCapabilities() {
  return ['overview', 'rulebook_reference', 'supporting'];
}

function pageDto(projectId, manifest, page) {
  const baseUrl = `/api/projects/${encodeURIComponent(projectId)}/contextual-assets/${encodeURIComponent(page.assetId)}/file`;
  return {
    id: page.assetId,
    kind: 'contextual_page',
    source: 'rulebook_context',
    pageNumber: page.number,
    index: page.number,
    sha256: page.sha256,
    width: page.width,
    height: page.height,
    documentSha256: manifest.source.sha256,
    renderProfile: manifest.renderProfile.id,
    capabilities: pageCapabilities(),
    url: `${baseUrl}?variant=full`,
    thumbnailUrl: `${baseUrl}?variant=thumbnail`,
    crops: (page.crops || []).map((crop) => cropDto(projectId, crop)),
  };
}

function cropDto(projectId, crop) {
  const baseUrl = `/api/projects/${encodeURIComponent(projectId)}/contextual-assets/${encodeURIComponent(crop.id)}/file`;
  return {
    id: crop.id,
    kind: crop.kind,
    source: crop.source,
    parentPageAssetId: crop.parentPageAssetId,
    documentSha256: crop.documentSha256,
    pageRasterSha256: crop.pageRasterSha256,
    coordinates: clone(crop.coordinates),
    x: crop.coordinates.x,
    y: crop.coordinates.y,
    width: crop.coordinates.width,
    height: crop.coordinates.height,
    renderProfile: crop.renderProfileId,
    origin: crop.origin,
    capabilities: [...crop.capabilities],
    url: `${baseUrl}?variant=full`,
    thumbnailUrl: `${baseUrl}?variant=thumbnail`,
  };
}

/** Converts a valid manifest to a path-free project inventory DTO. */
export function toContextualEvidenceInventory(projectId, manifest) {
  const pages = manifest.pages.map((page) => pageDto(projectId, manifest, page));
  return {
    available: true,
    version: manifest.version,
    projectId: manifest.projectId,
    source: {
      filename: manifest.source.filename,
      sha256: manifest.source.sha256,
      bytes: manifest.source.bytes,
      pageCount: manifest.source.pageCount,
    },
    renderProfile: clone(manifest.renderProfile),
    validation: clone(manifest.validation),
    provenance: clone(manifest.created?.provenance || { kind: 'direct_project_upload' }),
    pages,
    assets: [
      ...pages.map(({ crops, ...page }) => page),
      ...pages.flatMap((page) => page.crops),
    ],
  };
}

export function createContextualEvidenceService({
  dataRoot = path.resolve(process.cwd(), 'data'),
  renderPages = renderPdfPages,
  sharpImpl = sharp,
  renderProfile = DEFAULT_RENDER_PROFILE,
  minimumCropPixels = MINIMUM_CROP_PIXELS,
} = {}) {
  const profile = Object.freeze({ ...DEFAULT_RENDER_PROFILE, ...renderProfile });

  function evidenceDir(projectId) {
    return path.resolve(dataRoot, projectId, 'contextual-evidence');
  }

  function manifestPath(projectId) {
    return path.join(evidenceDir(projectId), 'manifest.json');
  }

  function sourcePath(projectId) {
    return path.join(evidenceDir(projectId), 'source', 'rulebook.pdf');
  }

  function pagePath(projectId, pageNumber) {
    return path.join(evidenceDir(projectId), 'pages', expectedPageFilename(pageNumber));
  }

  function validateManifest(projectId, manifest) {
    const invalid = () => {
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence is unavailable for this project.', 404);
    };
    if (!manifest || manifest.version !== CONTEXTUAL_EVIDENCE_VERSION || manifest.projectId !== projectId
      || !manifest.source || typeof manifest.source.filename !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.source.sha256)
      || !Number.isInteger(manifest.source.bytes) || manifest.source.bytes < 1
      || !Number.isInteger(manifest.source.pageCount) || manifest.source.pageCount < 1
      || !manifest.renderProfile || manifest.renderProfile.id !== profile.id
      || manifest.renderProfile.renderer !== profile.renderer || manifest.renderProfile.format !== 'png'
      || manifest.renderProfile.dpi !== profile.dpi || !Array.isArray(manifest.pages)
      || manifest.pages.length !== manifest.source.pageCount || !manifest.validation || manifest.validation.completed !== true) invalid();
    const ids = new Set();
    manifest.pages.forEach((page, index) => {
      if (!page || page.number !== index + 1 || typeof page.assetId !== 'string' || !SAFE_ID_PATTERN.test(page.assetId)
        || !/^[a-f0-9]{64}$/.test(page.sha256) || !Number.isInteger(page.width) || page.width < 1
        || !Number.isInteger(page.height) || page.height < 1 || page.assetId !== pageAssetId(manifest.source.sha256, page.number, profile.id, page.sha256)
        || ids.has(page.assetId) || !Array.isArray(page.crops)) invalid();
      ids.add(page.assetId);
      page.crops.forEach((crop) => {
        if (!crop || crop.kind !== 'contextual_crop' || crop.source !== 'rulebook_context'
          || crop.parentPageAssetId !== page.assetId || crop.documentSha256 !== manifest.source.sha256
          || crop.pageRasterSha256 !== page.sha256 || crop.renderProfileId !== profile.id || crop.origin !== 'operator_crop'
          || !Array.isArray(crop.capabilities) || !crop.capabilities.every((capability) => typeof capability === 'string')
          || !crop.coordinates || !Number.isInteger(crop.coordinates.x) || !Number.isInteger(crop.coordinates.y)
          || !Number.isInteger(crop.coordinates.width) || !Number.isInteger(crop.coordinates.height)
          || crop.coordinates.x < 0 || crop.coordinates.y < 0 || crop.coordinates.width < minimumCropPixels || crop.coordinates.height < minimumCropPixels
          || crop.coordinates.x + crop.coordinates.width > page.width || crop.coordinates.y + crop.coordinates.height > page.height
          || crop.id !== cropAssetId(page.assetId, crop.coordinates) || ids.has(crop.id)) invalid();
        ids.add(crop.id);
      });
    });
    return manifest;
  }

  async function readManifest(projectId) {
    requireProjectId(projectId);
    try {
      return validateManifest(projectId, JSON.parse(await fs.promises.readFile(manifestPath(projectId), 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence is unavailable for this project.', 404);
      }
      if (error instanceof ContextualEvidenceError) throw error;
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence is unavailable for this project.', 404, error);
    }
  }

  async function verifySource(projectId, manifest) {
    const filePath = safePath(evidenceDir(projectId), 'source/rulebook.pdf');
    let bytes;
    try {
      bytes = await fs.promises.readFile(filePath);
    } catch (error) {
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence is unavailable for this project.', 404, error);
    }
    if (bytes.length !== manifest.source.bytes || sha256(bytes) !== manifest.source.sha256) {
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence is unavailable for this project.', 404);
    }
    return filePath;
  }

  async function verifyPage(projectId, manifest, page) {
    await verifySource(projectId, manifest);
    const filePath = safePath(evidenceDir(projectId), path.join('pages', expectedPageFilename(page.number)));
    let bytes;
    try {
      bytes = await fs.promises.readFile(filePath);
      const metadata = await sharpImpl(bytes).metadata();
      if (sha256(bytes) !== page.sha256 || metadata.format !== 'png' || metadata.width !== page.width || metadata.height !== page.height) {
        throw new Error('page validation failed');
      }
    } catch (error) {
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence is unavailable for this project.', 404, error);
    }
    return filePath;
  }

  function pageFor(manifest, pageId) {
    requireSafeId(pageId);
    const page = manifest.pages.find((entry) => entry.assetId === pageId);
    if (!page) throw new ContextualEvidenceError('CONTEXTUAL_ASSET_NOT_FOUND', 'Contextual asset was not found in this project.', 404);
    return page;
  }

  function cropFor(manifest, cropId) {
    requireSafeId(cropId);
    for (const page of manifest.pages) {
      const crop = page.crops.find((entry) => entry.id === cropId);
      if (crop) return { page, crop };
    }
    throw new ContextualEvidenceError('CONTEXTUAL_ASSET_NOT_FOUND', 'Contextual asset was not found in this project.', 404);
  }

  async function replaceEvidenceDir(projectId, stagingDir) {
    const finalDir = evidenceDir(projectId);
    const backupDir = `${finalDir}.previous-${crypto.randomUUID()}`;
    let movedCurrent = false;
    try {
      await fs.promises.mkdir(path.dirname(finalDir), { recursive: true });
      if (fs.existsSync(finalDir)) {
        await fs.promises.rename(finalDir, backupDir);
        movedCurrent = true;
      }
      await fs.promises.rename(stagingDir, finalDir);
      if (movedCurrent) await fs.promises.rm(backupDir, { recursive: true, force: true });
    } catch (error) {
      if (!fs.existsSync(finalDir) && movedCurrent && fs.existsSync(backupDir)) await fs.promises.rename(backupDir, finalDir).catch(() => {});
      throw error;
    }
  }

  async function persistUpload(projectId, uploadPath, { filename, provenance } = {}) {
    requireProjectId(projectId);
    if (typeof uploadPath !== 'string' || !uploadPath) {
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence could not be prepared.', 422);
    }
    const stagingDir = path.join(path.resolve(dataRoot, projectId), `.contextual-evidence-staging-${crypto.randomUUID()}`);
    const correlationId = `contextual-${crypto.randomUUID()}`;
    let phase = 'source_read';
    let expectedPageCount = null;
    let actualPageCount = 0;
    try {
      const sourceBytes = await fs.promises.readFile(uploadPath);
      if (!sourceBytes.length) throw new Error('empty source');
      const sourceSha256 = sha256(sourceBytes);
      phase = 'source_copy';
      await fs.promises.mkdir(path.join(stagingDir, 'source'), { recursive: true });
      await fs.promises.mkdir(path.join(stagingDir, 'pages'), { recursive: true });
      await fs.promises.mkdir(path.join(stagingDir, 'crop-cache'), { recursive: true });
      await fs.promises.writeFile(path.join(stagingDir, 'source', 'rulebook.pdf'), sourceBytes);
      const copiedBytes = await fs.promises.readFile(path.join(stagingDir, 'source', 'rulebook.pdf'));
      if (copiedBytes.length !== sourceBytes.length || sha256(copiedBytes) !== sourceSha256) throw new Error('source copy hash mismatch');

      const canonicalSourcePath = path.join(stagingDir, 'source', 'rulebook.pdf');
      const pages = [];
      phase = 'render_start';
      const renderedPages = await renderPages(canonicalSourcePath, profile);
      expectedPageCount = Number.isInteger(renderedPages?.pageCount) && renderedPages.pageCount > 0
        ? renderedPages.pageCount : null;
      let pageNumber = 0;
      for await (const renderedPage of renderedPages) {
        pageNumber += 1;
        actualPageCount = pageNumber;
        const pageBytes = Buffer.from(renderedPage);
        phase = 'page_validation';
        const metadata = await sharpImpl(pageBytes).metadata();
        if (metadata.format !== 'png' || !Number.isInteger(metadata.width) || metadata.width < 1 || !Number.isInteger(metadata.height) || metadata.height < 1) {
          throw taggedRenderFailure('CONTEXTUAL_RENDER_OUTPUT_VALIDATION_FAILED', 'Renderer returned a non-PNG page.');
        }
        const pageSha256 = sha256(pageBytes);
        const filenameForPage = expectedPageFilename(pageNumber);
        phase = 'page_persist';
        await fs.promises.writeFile(path.join(stagingDir, 'pages', filenameForPage), pageBytes);
        const persistedBytes = await fs.promises.readFile(path.join(stagingDir, 'pages', filenameForPage));
        if (sha256(persistedBytes) !== pageSha256) throw taggedRenderFailure('CONTEXTUAL_RENDER_OUTPUT_VALIDATION_FAILED', 'Rendered page copy hash mismatch.');
        pages.push({
          number: pageNumber,
          assetId: pageAssetId(sourceSha256, pageNumber, profile.id, pageSha256),
          sha256: pageSha256,
          width: metadata.width,
          height: metadata.height,
          crops: [],
        });
      }
      if (!pages.length) throw taggedRenderFailure('CONTEXTUAL_RENDER_OUTPUT_VALIDATION_FAILED', 'Renderer returned no pages.');
      if (expectedPageCount !== null && expectedPageCount !== pages.length) {
        phase = 'page_count';
        throw taggedRenderFailure('CONTEXTUAL_RENDER_PAGE_COUNT_MISMATCH', 'Renderer page count did not match its page iterator.');
      }
      const manifest = {
        version: CONTEXTUAL_EVIDENCE_VERSION,
        projectId,
        source: {
          filename: safeFilename(filename || uploadPath),
          sha256: sourceSha256,
          bytes: sourceBytes.length,
          pageCount: pages.length,
        },
        renderProfile: clone(profile),
        pages,
        created: {
          origin: 'deterministic_local_ingestion',
          completedAt: new Date().toISOString(),
          provenance: safeProvenance(provenance),
        },
        validation: {
          completed: true,
          sourceSha256,
          pageCount: pages.length,
          pageRasterSha256: pages.map((page) => page.sha256),
        },
      };
      validateManifest(projectId, manifest);
      await writeAtomic(path.join(stagingDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      phase = 'publish';
      await replaceEvidenceDir(projectId, stagingDir);
      return toContextualEvidenceInventory(projectId, manifest);
    } catch (error) {
      await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      if (error instanceof ContextualEvidenceError && error.code === 'PROJECT_ID_INVALID') throw error;
      const diagnostic = renderDiagnostic(correlationId, error, { phase, expectedPageCount, actualPageCount });
      console.error('[ContextualRender]', JSON.stringify(diagnostic));
      throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence could not be prepared.', 422, error, diagnostic);
    }
  }

  async function inventory(projectId) {
    return toContextualEvidenceInventory(projectId, await readManifest(projectId));
  }

  async function registerCrop(projectId, pageId, input = {}) {
    const manifest = await readManifest(projectId);
    const page = pageFor(manifest, pageId);
    await verifyPage(projectId, manifest, page);
    const descriptor = cropDescriptor(manifest, page, input, minimumCropPixels);
    if (!page.crops.some((crop) => crop.id === descriptor.id)) {
      page.crops.push(descriptor);
      validateManifest(projectId, manifest);
      await writeAtomic(manifestPath(projectId), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    return cropDto(projectId, descriptor);
  }

  async function cropPath(projectId, manifest, page, crop) {
    // Cache entries are disposable derivatives; never trust one unless its canonical parent still validates.
    const sourcePage = await verifyPage(projectId, manifest, page);
    const cachePath = safePath(evidenceDir(projectId), path.join('crop-cache', page.assetId, `${crop.id}.png`));
    let cacheIsUsable = false;
    if (fs.existsSync(cachePath)) {
      try {
        const metadata = await sharpImpl(cachePath).metadata();
        cacheIsUsable = metadata.format === 'png'
          && metadata.width === crop.coordinates.width && metadata.height === crop.coordinates.height;
      } catch {
        cacheIsUsable = false;
      }
    }
    if (!cacheIsUsable) {
      await fs.promises.rm(cachePath, { force: true }).catch(() => {});
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      const temporaryPath = `${cachePath}.${process.pid}.${crypto.randomUUID()}.tmp.png`;
      try {
        await sharpImpl(sourcePage).extract({
          left: crop.coordinates.x,
          top: crop.coordinates.y,
          width: crop.coordinates.width,
          height: crop.coordinates.height,
        }).png().toFile(temporaryPath);
        await fs.promises.rename(temporaryPath, cachePath);
      } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
        throw new ContextualEvidenceError('CONTEXTUAL_EVIDENCE_UNAVAILABLE', 'Contextual evidence crop is unavailable.', 404, error);
      }
    }
    return cachePath;
  }

  async function resolveAssetFile(projectId, assetId, variant = 'full') {
    requireProjectId(projectId);
    requireSafeId(assetId);
    if (variant !== 'full' && variant !== 'thumbnail') {
      throw new ContextualEvidenceError('CONTEXTUAL_ASSET_VARIANT_INVALID', 'Contextual asset variant is invalid.', 400);
    }
    const manifest = await readManifest(projectId);
    const page = manifest.pages.find((entry) => entry.assetId === assetId);
    if (page) return { path: await verifyPage(projectId, manifest, page), contentType: 'image/png', kind: 'contextual_page', variant };
    const { page: crop, crop: descriptor } = cropFor(manifest, assetId);
    return { path: await cropPath(projectId, manifest, crop, descriptor), contentType: 'image/png', kind: 'contextual_crop', variant };
  }

  async function resolveAssignment(projectId, assignment) {
    if (!assignment || !['contextual_page', 'contextual_crop'].includes(assignment.kind)) {
      throw new ContextualEvidenceError('CONTEXTUAL_ASSET_INVALID', 'Contextual evidence assignment is invalid.', 400);
    }
    const manifest = await readManifest(projectId);
    const page = assignment.kind === 'contextual_page' ? pageFor(manifest, assignment.assetId) : cropFor(manifest, assignment.assetId).page;
    const crop = assignment.kind === 'contextual_crop' ? cropFor(manifest, assignment.assetId).crop : null;
    if (assignment.pageId !== page.assetId || (crop && assignment.cropId !== crop.id)
      || assignment.documentSha256 !== manifest.source.sha256 || assignment.pageRasterSha256 !== page.sha256
      || assignment.renderProfile !== manifest.renderProfile.id) {
      throw new ContextualEvidenceError('CONTEXTUAL_ASSET_NOT_FOUND', 'Contextual evidence assignment is not current for this project.', 404);
    }
    const capabilities = crop ? crop.capabilities : pageCapabilities();
    return {
      asset: crop ? cropDto(projectId, crop) : pageDto(projectId, manifest, page),
      path: crop ? await cropPath(projectId, manifest, page, crop) : await verifyPage(projectId, manifest, page),
      capabilities,
    };
  }

  return {
    persistUpload,
    inventory,
    readManifest,
    registerCrop,
    resolveAssetFile,
    resolveAssignment,
  };
}

export const contextualEvidenceService = createContextualEvidenceService();
