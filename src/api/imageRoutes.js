import fs from 'fs';
import path from 'path';
import {
  appendImages,
  linkImagesToComponent,
  listImages,
  reconcileAutomaticLinks,
  saveImages,
  upsertImage,
  removeImagesBySource,
} from '../services/imageStore.js';
import {
  extractRulebookImages,
  fetchBggImages,
  ingestManualImage,
  normalizeImageAsset,
  runImageEnhancement,
  searchWebForComponentImages,
  matchComponentsToImages,
} from '../services/imagePipeline.js';
import { fetchImagesFromExtractor } from '../services/imageExtractorClient.js';
import {
  saveMatchFeedback,
  getMatchPatterns,
  getLearnedPatterns,
} from '../services/matchLearning.js';
import {
  extractAllImages as extractNativeImages,
} from '../services/nativeImageExtractor.js';
import {
  ContextualEvidenceError,
  contextualEvidenceService,
  withContextualEvidenceLock,
} from '../services/contextualEvidenceService.js';
import {
  ProjectSourceError,
  PROJECT_SOURCE_STATUS,
  projectSourceService,
} from '../services/projectSourceService.js';
import { createContextualEvidenceAdoptionService } from '../services/contextualEvidenceAdoptionService.js';
import {
  extractComponentsFromAllPages,
  isJobInProgress,
  clearJobLock,
  getJobStatus,
} from '../services/componentCropper.js';
import {
  extractComponentsWithPipeline,
  isJobInProgress as isPipelineInProgress,
  clearJobLock as clearPipelineLock,
} from '../services/componentPipeline.js';
import {
  extractWithHephaestus,
  isHephaestusAvailable,
} from '../services/hephaestusService.js';
import { curateHephaestusAssets } from '../services/hephaestusCuration.js';
import { hybridMatch } from '../services/hybridMatcher.js';
import { isEligibleComponentForMatching } from '../services/componentInventory.js';

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE_CONTENT_TYPES = Object.freeze({
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

function isValidProjectId(projectId) {
  return typeof projectId === 'string' && projectId.length <= 128 && PROJECT_ID_PATTERN.test(projectId);
}

function isValidAssetId(assetId) {
  return typeof assetId === 'string' && assetId.length <= 256 && ASSET_ID_PATTERN.test(assetId);
}

function isPathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function localImageFile(fileKey) {
  if (typeof fileKey !== 'string' || !fileKey) return { state: 'missing' };
  const resolvedPath = path.resolve(fileKey);
  const allowedDirs = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'src/api/uploads'),
  ];
  if (!allowedDirs.some((directory) => isPathWithin(directory, resolvedPath))) return { state: 'forbidden' };
  if (!fs.existsSync(resolvedPath)) return { state: 'missing' };
  return { state: 'available', path: resolvedPath, contentType: IMAGE_CONTENT_TYPES[path.extname(resolvedPath).toLowerCase()] || null };
}

function previewKindForImage(image) {
  const source = localImageFile(image?.fileKey);
  if (source.state === 'available' && source.contentType) {
    const thumbnail = localImageFile(image?.thumbnailKey);
    return thumbnail.state === 'available' && thumbnail.contentType ? 'thumbnail' : 'source';
  }
  return typeof image?.originalUrl === 'string' && image.originalUrl.length > 0 ? 'unavailable' : null;
}

function safeImageForReview(projectId, image) {
  const metadata = image?.metadata && typeof image.metadata === 'object' ? image.metadata : {};
  const curation = image?.curation && typeof image.curation === 'object' ? image.curation : (metadata.curation || {});
  const quality = image?.quality && typeof image.quality === 'object' ? image.quality : {};
  const assetPath = `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(image.id)}/file`;
  return {
    id: image.id,
    name: String(image.name || image.label || image.title || image.id),
    label: String(image.label || image.name || image.title || image.id),
    type: image.type || metadata.type || null,
    source: image.source || null,
    page: Number.isFinite(Number(image.page ?? metadata.page)) ? Number(image.page ?? metadata.page) : null,
    category: image.category || metadata.category || null,
    classification: image.classification || metadata.classification || null,
    width: Number.isFinite(Number(image.width)) ? Number(image.width) : null,
    height: Number.isFinite(Number(image.height)) ? Number(image.height) : null,
    tags: Array.isArray(image.tags) ? image.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.slice(0, 160)) : [],
    quality: { score: Number.isFinite(Number(quality.score)) ? Number(quality.score) : null },
    curation: {
      candidate: curation.candidate !== false,
      score: Number.isFinite(Number(curation.score)) ? Number(curation.score) : null,
      isDuplicate: curation.isDuplicate === true,
      lowInformation: curation.lowInformation === true,
    },
    previewKind: previewKindForImage(image),
    localUrl: assetPath,
    thumbnailUrl: `${assetPath}?variant=thumbnail`,
  };
}

function isReviewImageAvailable(image) {
  const source = localImageFile(image?.fileKey);
  return (source.state === 'available' && Boolean(source.contentType))
    || (typeof image?.originalUrl === 'string' && image.originalUrl.length > 0);
}

function safeComponentImageLinkDetails(details) {
  return Object.fromEntries(Object.entries(details || {}).map(([componentId, assets]) => [
    componentId,
    Object.fromEntries(Object.entries(assets || {}).map(([assetId, detail]) => [assetId, {
      origin: typeof detail?.origin === 'string' ? detail.origin : 'manual',
      ...(Number.isFinite(Number(detail?.confidence)) ? { confidence: Number(detail.confidence) } : {}),
    }])),
  ]));
}

async function safeImageListResponse(projectId, state, contextualEvidence, projectSource) {
  let contextualInventory = null;
  try {
    contextualInventory = await contextualEvidence.inventory(projectId);
  } catch (error) {
    if (error?.code !== 'CONTEXTUAL_EVIDENCE_UNAVAILABLE') throw error;
  }
  let sourcePdf;
  try {
    sourcePdf = await projectSource.inspect(projectId, {
      contextualAvailable: Boolean(contextualInventory?.available),
    });
  } catch (error) {
    if (!(error instanceof ProjectSourceError) && !['SOURCE_PDF_MISSING', 'SOURCE_PDF_TAMPERED'].includes(error?.code)) throw error;
    sourcePdf = {
      status: error.code === 'SOURCE_PDF_TAMPERED' ? PROJECT_SOURCE_STATUS.TAMPERED : PROJECT_SOURCE_STATUS.MISSING,
      code: error.code,
    };
  }
  return {
    images: (state.images || []).filter((image) => typeof image?.id === 'string' && image.id && isReviewImageAvailable(image)).map((image) => safeImageForReview(projectId, image)),
    componentImages: state.componentImages || {},
    componentImageLinkDetails: safeComponentImageLinkDetails(state.componentImageLinkDetails),
    sourcePdf,
    contextualEvidence: contextualInventory || {
      available: false,
      code: sourcePdf.status === PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER
        ? 'CONTEXTUAL_EVIDENCE_PENDING' : 'CONTEXTUAL_EVIDENCE_UNAVAILABLE',
      message: sourcePdf.status === PROJECT_SOURCE_STATUS.PENDING_CONTEXTUAL_RENDER
        ? 'The verified source PDF is stored; contextual page rendering is pending.'
        : 'A verified source PDF must be explicitly adopted before contextual rulebook evidence is available.',
    },
    // Contextual assets are intentionally excluded from component matching but remain in the project inventory.
    contextualAssets: contextualInventory?.assets || [],
  };
}

function recuratePersistedHephaestusAssets(state = {}) {
  const hephaestusAssets = (state.images || []).filter((image) => image?.source === 'hephaestus');
  const recuration = curateHephaestusAssets(hephaestusAssets);
  const byId = new Map(recuration.assets.map((asset) => [asset.id, asset]));
  const images = (state.images || []).map((image) => {
    const curated = byId.get(image?.id);
    if (!curated) return image;
    const curation = curated.curation;
    const reasons = Array.isArray(curation?.reasons) ? curation.reasons.filter(Boolean).join('; ') : '';
    return {
      ...image,
      curation,
      metadata: { ...(image.metadata || {}), curation },
      quality: {
        ...(image.quality || {}),
        score: curation?.score ?? image?.quality?.score ?? null,
        notes: reasons || image?.quality?.notes || 'Re-curated native PDF asset',
      },
    };
  });
  return { images, stats: recuration.stats };
}

function projectSourceErrorResponse(res, error) {
  if (error instanceof ProjectSourceError || (typeof error?.code === 'string' && error.code.startsWith('SOURCE_PDF_'))) {
    return res.status(error.status || 422).json({ code: error.code, error: error.message || 'The source PDF is unavailable.' });
  }
  console.error('[ProjectSource]', error);
  return res.status(500).json({ code: 'SOURCE_PDF_COPY_FAILED', error: 'The source PDF could not be stored safely.' });
}

function contextualEvidenceErrorResponse(res, error) {
  if (error instanceof ContextualEvidenceError || (typeof error?.code === 'string' && Number.isInteger(error?.status))) {
    return res.status(error.status).json({
      code: error.code,
      error: error.message || 'Contextual evidence is unavailable.',
      ...(typeof error.correlationId === 'string' ? { correlationId: error.correlationId } : {}),
    });
  }
  console.error('[ContextualEvidence]', error);
  return res.status(422).json({ code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE', error: 'Contextual evidence is unavailable.' });
}

function sendContextualEvidenceFile(res, file) {
  res.set({
    'Cache-Control': 'private, max-age=300, must-revalidate, no-transform',
    'Content-Type': file.contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  return res.sendFile(file.path);
}

export function registerImageRoutes(app, {
  upload,
  sourceUpload = null,
  extractorApiKey,
  openai,
  contextualEvidence = contextualEvidenceService,
  projectSource = projectSourceService,
  contextualAdoption = null,
} = {}) {
  const uploadMiddleware = upload || { single: () => (_req, _res, next) => next() };
  const sourceUploadMiddleware = sourceUpload || uploadMiddleware;
  const adoption = contextualAdoption || createContextualEvidenceAdoptionService({ contextualEvidence });

  app.post('/api/projects/:projectId/source-pdf', sourceUploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    if (!req.file) {
      return res.status(400).json({ code: 'SOURCE_PDF_INVALID', error: 'A PDF file is required.' });
    }
    const temporaryUploadPath = req.file.path;
    try {
      const result = await projectSource.persistUpload(projectId, temporaryUploadPath, { filename: req.file.originalname });
      return res.status(result.idempotent ? 200 : 201).json({ sourcePdf: result.descriptor, idempotent: result.idempotent });
    } catch (error) {
      return projectSourceErrorResponse(res, error);
    } finally {
      // Source uploads use a dedicated non-public multer store in production. The
      // browser never receives its path, and the transient original never survives
      // canonical persistence, conflict, or validation failure.
      if (sourceUpload) await fs.promises.rm(temporaryUploadPath, { force: true }).catch(() => {});
    }
  });

  app.get('/api/projects/:projectId/source-pdf', async (req, res) => {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    try {
      return res.json({ sourcePdf: await projectSource.inspect(projectId) });
    } catch (error) {
      return projectSourceErrorResponse(res, error);
    }
  });

  // New projects can materialize contextual evidence from their already verified,
  // project-owned source without entering the historical adoption workflow.
  app.post('/api/projects/:projectId/contextual-evidence/render', async (req, res) => {
    const { projectId } = req.params;
    try {
      const descriptor = await projectSource.readDescriptor(projectId);
      return await withContextualEvidenceLock(projectId, async () => {
        let existingInventory = null;
        try {
          existingInventory = await contextualEvidence.inventory(projectId);
        } catch (error) {
          if (error?.code !== 'CONTEXTUAL_EVIDENCE_UNAVAILABLE') throw error;
        }
        if (existingInventory) {
          const isMatchingDirectSource = existingInventory?.source?.sha256 === descriptor.sha256
            && existingInventory?.provenance?.kind === 'direct_project_upload'
            && existingInventory?.provenance?.sourceRecordId === descriptor.sourceId;
          if (isMatchingDirectSource) {
            return res.json({ contextualEvidence: existingInventory, idempotent: true });
          }
          return res.status(409).json({
            code: 'CONTEXTUAL_EVIDENCE_CONFLICT',
            error: 'Existing contextual evidence belongs to another verified source and cannot be replaced.',
          });
        }
        const inventory = await contextualEvidence.persistUpload(projectId, await projectSource.resolveFile(projectId), {
          filename: descriptor.filename,
          provenance: { kind: 'direct_project_upload', sourceRecordId: descriptor.sourceId },
        });
        return res.status(201).json({ contextualEvidence: inventory, idempotent: false });
      });
    } catch (error) {
      if (error instanceof ProjectSourceError || String(error?.code || '').startsWith('SOURCE_PDF_')) return projectSourceErrorResponse(res, error);
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  app.get('/api/projects/:projectId/contextual-evidence', async (req, res) => {
    try {
      return res.json(await contextualEvidence.inventory(req.params.projectId));
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  // Discovery trusts only explicit, project-owned upload-link records. It never scans
  // arbitrary shared uploads and deliberately returns no candidate when linkage is absent.
  app.get('/api/projects/:projectId/contextual-evidence/adoption/candidates', async (req, res) => {
    try {
      return res.json(await adoption.discover(req.params.projectId));
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  // Selecting a local PDF only creates a verified, short-lived preview. Canonical
  // evidence is not written until the separate named-project confirmation request.
  app.post('/api/projects/:projectId/contextual-evidence/adoption/local-preview', uploadMiddleware.single('file'), async (req, res) => {
    try {
      return res.status(201).json(await adoption.previewLocalUpload(req.params.projectId, req.file));
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  app.post('/api/projects/:projectId/contextual-evidence/adoption/local', async (req, res) => {
    try {
      const result = await adoption.adoptLocalPreview(req.params.projectId, req.body?.candidateId, req.body?.confirmation);
      return res.status(result.idempotent ? 200 : 201).json({ contextualEvidence: result.inventory, adoption: { status: result.idempotent ? 'already_adopted' : 'adopted', source: 'local_upload_preview' } });
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  app.post('/api/projects/:projectId/contextual-evidence/adoption/legacy', async (req, res) => {
    try {
      const result = await adoption.adoptLegacy(req.params.projectId, req.body?.candidateId, req.body?.confirmation);
      return res.status(result.idempotent ? 200 : 201).json({ contextualEvidence: result.inventory, adoption: { status: result.idempotent ? 'already_adopted' : 'adopted', source: 'verified_legacy_upload' } });
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  // The only file-serving endpoint for contextual evidence. It resolves an asset ID
  // against the manifest; it never accepts source paths, page numbers, or crop bounds.
  app.get('/api/projects/:projectId/contextual-assets/:assetId/file', async (req, res) => {
    try {
      return sendContextualEvidenceFile(res, await contextualEvidence.resolveAssetFile(
        req.params.projectId,
        req.params.assetId,
        req.query.variant === undefined ? 'full' : req.query.variant,
      ));
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  app.post('/api/projects/:projectId/contextual-evidence/pages/:pageId/crops', async (req, res) => {
    try {
      const crop = await contextualEvidence.registerCrop(req.params.projectId, req.params.pageId, req.body || {});
      return res.status(201).json(crop);
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  // Serve only a canonical, project-owned stored asset. Client paths are never accepted.
  app.get('/api/projects/:projectId/images/:imageId/file', (req, res) => {
    const { projectId, imageId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    if (!isValidAssetId(imageId)) {
      return res.status(400).json({ code: 'IMAGE_ASSET_INVALID', error: 'Image asset ID is invalid.' });
    }

    const state = listImages(projectId);
    const image = (state.images || []).find((candidate) => candidate.id === imageId);
    if (!image) {
      return res.status(404).json({ code: 'IMAGE_NOT_FOUND', error: 'Image asset was not found in this project.' });
    }

    const source = localImageFile(image.fileKey);
    if (source.state === 'forbidden') {
      return res.status(403).json({ code: 'IMAGE_FILE_FORBIDDEN', error: 'Image asset cannot be served.' });
    }
    if (source.state !== 'available') {
      return res.status(404).json({ code: 'IMAGE_FILE_UNAVAILABLE', error: 'Image asset file is unavailable.' });
    }

    const thumbnail = localImageFile(image.thumbnailKey);
    const file = req.query.variant === 'thumbnail' && thumbnail.state === 'available' && thumbnail.contentType ? thumbnail : source;
    if (!file.contentType) {
      return res.status(415).json({ code: 'IMAGE_TYPE_UNSUPPORTED', error: 'Image asset type is unsupported.' });
    }

    res.set({
      'Cache-Control': 'private, max-age=300, must-revalidate, no-transform',
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
    });
    return res.sendFile(file.path);
  });

  app.use((error, req, res, next) => {
    if (error instanceof URIError && String(req.originalUrl || req.url || '').startsWith('/api/projects/')) {
      return res.status(400).json({ code: 'IMAGE_ASSET_INVALID', error: 'Image asset ID is invalid.' });
    }
    return next(error);
  });

  app.get('/api/projects/:projectId/images', async (req, res) => {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    try {
      const state = listImages(projectId);
      return res.json(await safeImageListResponse(projectId, state, contextualEvidence, projectSource));
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  app.post('/api/projects/:projectId/images/recurate-hephaestus', async (req, res) => {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    try {
      const recuration = recuratePersistedHephaestusAssets(listImages(projectId));
      const state = saveImages(projectId, recuration.images);
      return res.json({
        success: true,
        mode: 'hephaestus-recuration',
        message: `Re-curated ${recuration.stats.rawCount} stored HEPHAESTUS assets.`,
        stats: recuration.stats,
        ...await safeImageListResponse(projectId, state, contextualEvidence, projectSource),
      });
    } catch (error) {
      console.error('[HEPHAESTUS] Re-curation failed:', error);
      return res.status(500).json({ code: 'HEPHAESTUS_RECURATION_FAILED', error: 'Stored HEPHAESTUS assets could not be re-curated.' });
    }
  });

  app.post('/api/projects/:projectId/images/fetch-bgg', async (req, res) => {
    const { projectId } = req.params;
    const { bggUrl } = req.body || {};
    try {
      const fetched = await fetchBggImages(projectId, bggUrl);
      const enhanced = fetched.map(runImageEnhancement);
      const state = appendImages(projectId, enhanced);
      res.json({ images: state.images, componentImages: state.componentImages, componentImageLinkDetails: state.componentImageLinkDetails });
    } catch (err) {
      console.error('Failed to fetch BGG images', err);
      res.status(400).json({ error: err.message || 'Unable to fetch BGG images' });
    }
  });

  app.post('/api/projects/:projectId/images/extract-rulebook', async (req, res) => {
    const { projectId } = req.params;
    const { pdfKey, pdfPath } = req.body || {};
    try {
      const pdfInput = pdfPath || pdfKey;
      const extracted = await extractRulebookImages(projectId, pdfInput);
      const enhanced = extracted.map(runImageEnhancement);
      const state = appendImages(projectId, enhanced);
      res.json({ images: state.images, componentImages: state.componentImages, componentImageLinkDetails: state.componentImageLinkDetails });
    } catch (err) {
      console.error('Failed to extract rulebook images', err);
      res.status(400).json({ error: err.message || 'Unable to extract rulebook images' });
    }
  });

  // Extract images from uploaded PDF file (page-level extraction)
  app.post('/api/projects/:projectId/images/extract-pdf', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    try {
      if (!isValidProjectId(projectId)) {
        return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      await contextualEvidence.persistUpload(projectId, req.file.path, { filename: req.file.originalname });
      console.log('Extracting page images from uploaded PDF:', req.file.path);
      const extracted = await extractRulebookImages(projectId, req.file.path);
      const enhanced = extracted.map(runImageEnhancement);
      const state = appendImages(projectId, enhanced);
      console.log('Extracted', enhanced.length, 'page images from PDF');
      res.json({ 
        mode: 'pages',
        pagesCount: enhanced.length,
        images: state.images, 
        componentImages: state.componentImages,
        componentImageLinkDetails: state.componentImageLinkDetails
      });
    } catch (err) {
      if (err instanceof ContextualEvidenceError) {
        return contextualEvidenceErrorResponse(res, err);
      }
      console.error('[ImageExtraction]', JSON.stringify({
        route: 'extract-pdf',
        engine: 'legacy-page-renderer',
        message: err?.message || 'unknown error',
      }));
      res.status(500).json({ error: 'Legacy PDF page extraction failed. Use local HEPHAESTUS extraction instead.' });
    }
  });

  // Extract native embedded images from PDF (extracts actual image objects, not page renders)
  app.post('/api/projects/:projectId/images/extract-native', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    try {
      if (!isValidProjectId(projectId)) {
        return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      await contextualEvidence.persistUpload(projectId, req.file.path, { filename: req.file.originalname });
      
      console.log('Extracting native embedded images from PDF:', req.file.path);
      const fsModule = await import('fs');
      const pdfBuffer = fsModule.readFileSync(req.file.path);
      
      const result = await extractNativeImages(pdfBuffer, projectId, {
        minWidth: 100,
        minHeight: 100,
      });
      
      if (result.images.length === 0) {
        console.log('No native images found, falling back to page extraction');
        const extracted = await extractRulebookImages(projectId, req.file.path);
        const enhanced = extracted.map(runImageEnhancement);
        appendImages(projectId, enhanced);
        const state = listImages(projectId);
        return res.json({ 
          mode: 'pages',
          message: 'No embedded images found, extracted full pages instead',
          nativeCount: 0,
          pagesCount: enhanced.length,
          newImagesCount: enhanced.length,
          images: state.images, 
          componentImages: state.componentImages,
        componentImageLinkDetails: state.componentImageLinkDetails
        });
      }
      
      const enhanced = result.images.map(runImageEnhancement);
      appendImages(projectId, enhanced);
      const state = listImages(projectId);
      
      console.log(`Extracted ${enhanced.length} native embedded images from PDF`);
      res.json({ 
        mode: 'native',
        nativeCount: enhanced.length,
        newImagesCount: enhanced.length,
        message: result.message,
        images: state.images, 
        componentImages: state.componentImages,
        componentImageLinkDetails: state.componentImageLinkDetails
      });
    } catch (err) {
      if (err instanceof ContextualEvidenceError) {
        return contextualEvidenceErrorResponse(res, err);
      }
      console.error('[ImageExtraction]', JSON.stringify({
        route: 'extract-native',
        engine: 'native-or-legacy-fallback',
        message: err?.message || 'unknown error',
      }));
      res.status(500).json({ error: 'Native PDF extraction failed. Use local HEPHAESTUS extraction instead.' });
    }
  });

  // AI-powered component cropping uses the configured OpenAI-compatible vision model.
  app.post('/api/projects/:projectId/images/crop-components', async (req, res) => {
    const { projectId } = req.params;
    const { components = [], force = false } = req.body || {};
    
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }
    
    // If force flag is set, clear any stuck job lock
    if (force) {
      clearJobLock(projectId);
      console.log(`Force-cleared job lock for ${projectId}`);
    }
    
    if (isJobInProgress(projectId)) {
      const status = getJobStatus(projectId);
      return res.status(409).json({ 
        error: 'Component detection already in progress. Please wait for it to complete.',
        inProgress: true,
        elapsedSeconds: Math.round(status.elapsedMs / 1000),
        hint: 'If stuck, try adding force: true to your request'
      });
    }
    
    try {
      const state = listImages(projectId);
      const pageImages = (state.images || []).filter(img => 
        img.source === 'rulebook' && img.fileKey && fs.existsSync(img.fileKey)
      );
      
      if (pageImages.length === 0) {
        return res.status(400).json({ 
          error: 'No rulebook page images found. Please extract pages from PDF first.' 
        });
      }
      
      const pagePaths = pageImages.map(img => img.fileKey);
      const componentCount = components.length;
      console.log(`Starting component-guided cropping: ${pagePaths.length} pages, ${componentCount} target components`);
      
      removeImagesBySource(projectId, 'ai-component-crop');
      
      const crops = await extractComponentsFromAllPages(openai, projectId, pagePaths, components);
      
      if (crops.length === 0) {
        return res.json({
          success: true,
          message: 'No component images detected in rulebook pages',
          cropsCount: 0,
          images: state.images,
          componentImages: state.componentImages,
          componentImageLinkDetails: state.componentImageLinkDetails
        });
      }
      
      const normalized = crops.map(crop => normalizeImageAsset({
        ...crop,
        quality: { score: 0.8, notes: 'AI-cropped component' }
      }));
      
      const enhanced = normalized.map(runImageEnhancement);
      appendImages(projectId, enhanced);
      const updatedState = listImages(projectId);
      
      console.log(`Component cropping complete: ${enhanced.length} components extracted`);
      res.json({
        success: true,
        message: `Extracted ${enhanced.length} component images from ${pagePaths.length} pages`,
        cropsCount: enhanced.length,
        images: updatedState.images,
        componentImages: updatedState.componentImages,
        componentImageLinkDetails: updatedState.componentImageLinkDetails
      });
    } catch (err) {
      console.error('Component cropping failed:', err);
      res.status(500).json({ error: err.message || 'Failed to crop components' });
    }
  });

  // NEW: Multi-stage pipeline for component detection (CV + OCR + LLM)
  app.post('/api/projects/:projectId/images/detect-components', async (req, res) => {
    const { projectId } = req.params;
    const { components = [], force = false } = req.body || {};
    
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }
    
    if (force) {
      clearPipelineLock(projectId);
      console.log(`Force-cleared pipeline lock for ${projectId}`);
    }
    
    if (isPipelineInProgress(projectId)) {
      return res.status(409).json({ 
        error: 'Component detection pipeline already in progress.',
        inProgress: true,
        hint: 'Click "Force Retry" to restart'
      });
    }
    
    try {
      const state = listImages(projectId);
      const pageImages = (state.images || []).filter(img => 
        img.source === 'rulebook' && img.fileKey && fs.existsSync(img.fileKey)
      );
      
      if (pageImages.length === 0) {
        return res.status(400).json({ 
          error: 'No rulebook page images found. Please extract pages from PDF first.' 
        });
      }
      
      const pagePaths = pageImages.map(img => img.fileKey);
      console.log(`Starting multi-stage component pipeline: ${pagePaths.length} pages, ${components.length} target components`);
      
      removeImagesBySource(projectId, 'ai-component-crop');
      
      const result = await extractComponentsWithPipeline(openai, projectId, pagePaths, components);
      
      if (result.crops.length === 0) {
        return res.json({
          success: true,
          message: 'No component images detected in rulebook pages',
          stats: result.stats,
          images: state.images,
          componentImages: state.componentImages,
          componentImageLinkDetails: state.componentImageLinkDetails
        });
      }
      
      const normalized = result.crops.map(crop => normalizeImageAsset({
        ...crop,
        quality: { score: crop.confidence, notes: crop.tags.includes('high-confidence') ? 'High confidence detection' : 'Needs review' }
      }));
      
      const enhanced = normalized.map(runImageEnhancement);
      appendImages(projectId, enhanced);
      const updatedState = listImages(projectId);
      
      console.log(`Multi-stage pipeline complete: ${enhanced.length} components extracted`);
      res.json({
        success: true,
        message: `Extracted ${enhanced.length} component images using multi-stage pipeline`,
        stats: result.stats,
        cropsCount: enhanced.length,
        images: updatedState.images,
        componentImages: updatedState.componentImages,
        componentImageLinkDetails: updatedState.componentImageLinkDetails
      });
    } catch (err) {
      console.error('Multi-stage pipeline failed:', err);
      res.status(500).json({ error: err.message || 'Pipeline failed' });
    }
  });

  // HEPHAESTUS: extract every native raster image with 3x Lanczos output.
  app.post('/api/projects/:projectId/images/extract-hephaestus', sourceUploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    const temporaryUploadPath = req.file?.path;

    try {
      if (!isValidProjectId(projectId)) {
        return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
      }
      // A browser file is optional for a newly created project after reload. When it
      // is present, first establish the same immutable project-owned source contract.
      if (req.file) {
        await projectSource.persistUpload(projectId, req.file.path, { filename: req.file.originalname });
      }
      const canonicalPdfPath = await projectSource.resolveFile(projectId);

      const available = await isHephaestusAvailable();
      if (!available) {
        return res.status(500).json({ error: 'HEPHAESTUS system not available' });
      }

      const outputDir = path.join(process.cwd(), 'data', projectId, 'hephaestus');
      const result = await extractWithHephaestus(canonicalPdfPath, outputDir, {
        minWidth: 1,
        minHeight: 1,
      });
      if (!result.success && result.error) {
        return res.status(500).json({ error: result.error });
      }

      removeImagesBySource(projectId, 'hephaestus');
      const nativeImages = result.images || [];
      if (nativeImages.length === 0) {
        const state = listImages(projectId);
        return res.json({
          success: true,
          mode: 'hephaestus',
          message: 'No native raster images were found in this PDF.',
          stats: result.stats || {},
          imagesCount: 0,
          images: state.images,
          componentImages: state.componentImages,
          componentImageLinkDetails: state.componentImageLinkDetails,
        });
      }

      const curatedResult = curateHephaestusAssets(nativeImages);
      const images = curatedResult.assets.map((img) => {
        const imageId = `heph_${img.id}`;
        const type = ['card', 'token', 'board', 'tile', 'dice', 'marker', 'miniature', 'currency'].includes(img.type) ? img.type : 'other';
        const localUrl = `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}/file`;
        return normalizeImageAsset({
          id: imageId,
          source: 'hephaestus',
          name: img.label,
          label: img.label,
          type,
          fileKey: img.file_path,
          thumbnailKey: img.thumbnail_path,
          localUrl,
          thumbnailUrl: `${localUrl}?variant=thumbnail`,
          width: img.dimensions?.width,
          height: img.dimensions?.height,
          tags: ['native-pdf', type, img.is_component ? 'component' : 'non-component'],
          metadata: {
            page: img.page_index,
            confidence: img.confidence,
            label: img.label,
            quantity: img.quantity,
            classification: type,
            type,
            native: img.native === true,
            originalDimensions: img.original_dimensions,
            upscaleFactor: img.upscale_factor,
            contentHash: img.contentHash,
            curation: img.curation,
          },
          curation: img.curation,
          quality: { score: img.curation.score, notes: img.curation.reasons.join('; ') || 'Curated native PDF asset' },
        });
      });

      appendImages(projectId, images.map(runImageEnhancement));
      const updatedState = listImages(projectId);

      console.log(`[HEPHAESTUS] Extraction complete: ${images.length} native images`);
      return res.json({
        success: true,
        mode: 'hephaestus',
        message: `Extracted ${images.length} raw native images; ${curatedResult.stats.curatedCount} curated candidates are ready for review`,
        stats: { ...(result.stats || {}), ...curatedResult.stats },
        imagesCount: images.length,
        curatedCount: curatedResult.stats.curatedCount,
        images: updatedState.images,
        componentImages: updatedState.componentImages,
        componentImageLinkDetails: updatedState.componentImageLinkDetails,
      });
    } catch (err) {
      if (err instanceof ProjectSourceError || String(err?.code || '').startsWith('SOURCE_PDF_')) {
        return projectSourceErrorResponse(res, err);
      }
      console.error('[HEPHAESTUS]', JSON.stringify({
        event: 'extraction-failed',
        message: err?.message || 'unknown error',
      }));
      return res.status(500).json({ error: 'HEPHAESTUS extraction failed. Check the server diagnostic and retry.' });
    } finally {
      // Browser-provided source PDFs are accepted only through the private source
      // upload middleware and are removed after canonical persistence or any error.
      if (sourceUpload && temporaryUploadPath) await fs.promises.rm(temporaryUploadPath, { force: true }).catch(() => {});
    }
  });

  app.post('/api/projects/:projectId/images/manual', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File upload is required' });
      }
      const ingested = await ingestManualImage(projectId, {
        filePath: req.file.path,
        originalName: req.file.originalname,
      });
      const enhanced = runImageEnhancement(ingested);
      const state = appendImages(projectId, [enhanced]);
      res.json({ images: state.images, componentImages: state.componentImages, componentImageLinkDetails: state.componentImageLinkDetails });
    } catch (err) {
      console.error('Failed to ingest manual image', err);
      res.status(400).json({ error: err.message || 'Unable to save manual image' });
    }
  });

  app.post('/api/projects/:projectId/images/image-extractor', async (req, res) => {
    const { projectId } = req.params;
    const { url } = req.body || {};
    try {
      const rawImages = await fetchImagesFromExtractor(url, extractorApiKey, 'basic');
      const normalized = rawImages.map((img) =>
        normalizeImageAsset({ ...img, source: 'image-extractor', tags: ['extracted'] })
      );
      const state = appendImages(projectId, normalized.map(runImageEnhancement));
      res.json({ images: state.images, componentImages: state.componentImages, componentImageLinkDetails: state.componentImageLinkDetails });
    } catch (err) {
      console.error('Failed to fetch extractor images', err);
      res.status(400).json({ error: err.message || 'Unable to fetch extractor images' });
    }
  });

  app.patch('/api/projects/:projectId/images/:imageId', (req, res) => {
    const { projectId, imageId } = req.params;
    const { crops, tags, quality } = req.body || {};
    const state = listImages(projectId);
    const image = state.images.find((img) => img.id === imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const updated = {
      ...image,
      ...(Array.isArray(crops) ? { crops } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
      ...(quality ? { quality } : {}),
    };
    upsertImage(projectId, updated);
    const refreshed = listImages(projectId);
    res.json({ images: refreshed.images, componentImages: refreshed.componentImages, componentImageLinkDetails: refreshed.componentImageLinkDetails });
  });

  app.post('/api/projects/:projectId/components/:componentId/images', async (req, res) => {
    const { projectId, componentId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    const { imageIds, manualImageIds } = req.body || {};
    const requestedIds = Array.isArray(imageIds) ? imageIds : [];
    const state = listImages(projectId);
    const availableIds = new Set((state.images || []).map((image) => image.id));
    if (requestedIds.some((imageId) => typeof imageId !== 'string' || !availableIds.has(imageId))) {
      return res.status(400).json({ code: 'IMAGE_ASSET_INVALID', error: 'One or more image assets do not belong to this project.' });
    }
    const links = linkImagesToComponent(
      projectId,
      componentId,
      requestedIds,
      { manualImageIds: Array.isArray(manualImageIds) ? manualImageIds : null },
    );
    const refreshed = listImages(projectId);
    try {
      return res.json({ ...await safeImageListResponse(projectId, refreshed, contextualEvidence, projectSource), componentImages: links });
    } catch (error) {
      return contextualEvidenceErrorResponse(res, error);
    }
  });

  // DEPRECATED: AI-based cropping produced poor results. Use extract-native instead.
  // This endpoint now redirects to page extraction as a fallback.
  app.post('/api/projects/:projectId/images/extract-crops', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      
      console.log('AI-crop endpoint called - redirecting to page extraction');
      
      // Just do page extraction instead of AI cropping
      const extracted = await extractRulebookImages(projectId, req.file.path);
      const enhanced = extracted.map(runImageEnhancement);
      appendImages(projectId, enhanced);
      const state = listImages(projectId);
      
      res.json({ 
        mode: 'pages',
        message: 'Extracted full pages from PDF',
        cropsCount: 0,
        pagesCount: enhanced.length,
        images: state.images, 
        componentImages: state.componentImages,
        componentImageLinkDetails: state.componentImageLinkDetails
      });
    } catch (err) {
      console.error('Failed to extract images:', err);
      res.status(500).json({ error: err.message || 'Failed to extract images' });
    }
  });

  // Auto-gather images from all available sources (PDF, BGG, web search)
  app.post('/api/projects/:projectId/images/auto-gather', async (req, res) => {
    const { projectId } = req.params;
    const { pdfPath, gameName, bggUrl, components = [] } = req.body || {};
    
    console.log('Auto-gathering images for:', gameName, 'with', components.length, 'components');
    
    const results = {
      sources: [],
      totalImages: 0,
      errors: []
    };
    
    try {
      // Step 1: Extract images from PDF rulebook
      if (pdfPath) {
        try {
          console.log('Extracting images from PDF:', pdfPath);
          const extracted = await extractRulebookImages(projectId, pdfPath);
          const enhanced = extracted.map(runImageEnhancement);
          appendImages(projectId, enhanced);
          results.sources.push({ source: 'rulebook', count: enhanced.length });
          results.totalImages += enhanced.length;
        } catch (err) {
          console.error('PDF extraction failed:', err.message);
          results.errors.push({ source: 'rulebook', error: err.message });
        }
      }
      
      // Step 2: Fetch BGG images
      if (bggUrl || gameName) {
        try {
          console.log('Fetching BGG images for:', bggUrl || gameName);
          const fetched = await fetchBggImages(projectId, bggUrl || gameName);
          const enhanced = fetched.map(runImageEnhancement);
          appendImages(projectId, enhanced);
          results.sources.push({ source: 'bgg', count: enhanced.length });
          results.totalImages += enhanced.length;
        } catch (err) {
          console.error('BGG fetch failed:', err.message);
          results.errors.push({ source: 'bgg', error: err.message });
        }
      }
      
      // Step 3: Search web for component images if we have components
      if (gameName && components.length > 0 && openai) {
        try {
          console.log('Searching web for component images...');
          const webImages = await searchWebForComponentImages(gameName, components, openai);
          if (webImages.length > 0) {
            const enhanced = webImages.map(runImageEnhancement);
            appendImages(projectId, enhanced);
            results.sources.push({ source: 'web-search', count: enhanced.length });
            results.totalImages += enhanced.length;
          }
        } catch (err) {
          console.error('Web search failed:', err.message);
          results.errors.push({ source: 'web-search', error: err.message });
        }
      }
      
      const state = listImages(projectId);
      res.json({ 
        ...results,
        images: state.images, 
        componentImages: state.componentImages,
        componentImageLinkDetails: state.componentImageLinkDetails
      });
    } catch (err) {
      console.error('Auto-gather failed:', err);
      res.status(500).json({ error: err.message || 'Auto-gather failed' });
    }
  });

  // Deterministic automatic component-to-image matching. Optional vision is intentionally not used here.
  app.post('/api/projects/:projectId/images/auto-match', async (req, res) => {
    const { projectId } = req.params;
    const { components = [], gameName } = req.body || {};
    const eligibleComponents = components.filter(isEligibleComponentForMatching);

    if (eligibleComponents.length === 0) {
      return res.status(400).json({ error: 'A strict physical component inventory is required before matching.' });
    }

    console.log('[HybridMatch] Starting for', eligibleComponents.length, 'eligible components');

    try {
      const state = listImages(projectId);
      const images = state.images || [];

      if (images.length === 0) {
        const updatedState = reconcileAutomaticLinks(projectId, eligibleComponents, {});
        return res.json({
          message: 'No images available for matching',
          matched: 0,
          stats: { total: eligibleComponents.length, totalMatched: 0, ruleMatched: 0, visionMatched: 0, unmatched: eligibleComponents.length },
          candidates: {},
          images: updatedState.images,
          componentImages: updatedState.componentImages,
        componentImageLinkDetails: updatedState.componentImageLinkDetails,
        });
      }

      const result = await hybridMatch(eligibleComponents, images, gameName, null);
      const updatedState = reconcileAutomaticLinks(projectId, eligibleComponents, result.matches);
      console.log('[HybridMatch] Complete:', result.stats);

      res.json({
        matched: result.stats.totalMatched,
        candidates: result.candidates,
        stats: result.stats,
        images: updatedState.images,
        componentImages: updatedState.componentImages,
        componentImageLinkDetails: updatedState.componentImageLinkDetails,
      });
    } catch (err) {
      console.error('Hybrid match failed:', err);
      res.status(500).json({ error: err.message || 'Auto-match failed' });
    }
  });

  // Learning system endpoints
  app.post('/api/projects/:projectId/match-feedback', (req, res) => {
    const { projectId } = req.params;
    const { gameName, componentId, componentName, componentCategory, imageId, imageTags, imageSource, isCorrect, correctedImageId } = req.body || {};
    
    try {
      const feedback = saveMatchFeedback(projectId, {
        gameName,
        componentId,
        componentName,
        componentCategory,
        imageId,
        imageTags,
        imageSource,
        isCorrect,
        correctedImageId,
      });
      
      console.log('Saved match feedback:', componentName, '->', isCorrect ? 'correct' : 'incorrect');
      res.json({ success: true, feedback });
    } catch (err) {
      console.error('Failed to save feedback:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/learning/patterns', (req, res) => {
    try {
      const patterns = getLearnedPatterns();
      res.json({ patterns });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/learning/stats', async (req, res) => {
    try {
      const { getFeedbackStats } = await import('../services/matchLearning.js');
      const stats = getFeedbackStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

export default registerImageRoutes;

