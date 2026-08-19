import fs from 'fs';
import path from 'path';
import {
  appendImages,
  linkImagesToComponent,
  listImages,
  reconcileAutomaticLinks,
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

function isValidProjectId(projectId) {
  return typeof projectId === 'string' && projectId.length <= 128 && PROJECT_ID_PATTERN.test(projectId);
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
    localUrl: assetPath,
    thumbnailUrl: `${assetPath}?variant=thumbnail`,
  };
}

function isReviewImageAvailable(image) {
  if (typeof image?.fileKey === 'string' && image.fileKey) return fs.existsSync(image.fileKey);
  return typeof image?.originalUrl === 'string' && image.originalUrl.length > 0;
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

function safeImageListResponse(projectId, state) {
  return {
    images: (state.images || []).filter((image) => typeof image?.id === 'string' && image.id && isReviewImageAvailable(image)).map((image) => safeImageForReview(projectId, image)),
    componentImages: state.componentImages || {},
    componentImageLinkDetails: safeComponentImageLinkDetails(state.componentImageLinkDetails),
  };
}


export function registerImageRoutes(app, { upload, extractorApiKey, openai } = {}) {
  const uploadMiddleware = upload || { single: () => (_req, _res, next) => next() };

  // Serve image files from data directory
  app.get('/api/projects/:projectId/images/:imageId/file', (req, res) => {
    const { projectId, imageId } = req.params;
    const state = listImages(projectId);
    const image = (state.images || []).find(img => img.id === imageId);
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Serve either the 3x full-resolution asset or its generated thumbnail.
    const filePath = req.query.variant === 'thumbnail' && image.thumbnailKey
      ? image.thumbnailKey
      : image.fileKey;
    
    if (!filePath) {
      // For BGG images, redirect to original URL
      if (image.originalUrl) {
        return res.redirect(image.originalUrl);
      }
      return res.status(404).json({ error: 'No file path for image' });
    }
    
    // Security: Ensure path is within allowed directories
    const allowedDirs = [
      path.resolve(process.cwd(), 'data'),
      path.resolve(process.cwd(), 'src/api/uploads'),
    ];
    const resolvedPath = path.resolve(filePath);
    const isAllowed = allowedDirs.some(dir => resolvedPath.startsWith(dir));
    
    if (!isAllowed) {
      console.error('Attempted access to disallowed path:', resolvedPath);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Serve the file
    res.sendFile(resolvedPath);
  });

  app.get('/api/projects/:projectId/images', (req, res) => {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });
    }
    const state = listImages(projectId);
    return res.json(safeImageListResponse(projectId, state));
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
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
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
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      
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
  app.post('/api/projects/:projectId/images/extract-hephaestus', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }

      const available = await isHephaestusAvailable();
      if (!available) {
        return res.status(500).json({ error: 'HEPHAESTUS system not available' });
      }

      const outputDir = path.join(process.cwd(), 'data', projectId, 'hephaestus');
      const result = await extractWithHephaestus(req.file.path, outputDir, {
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
          manifestPath: result.manifest_path,
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
        manifestPath: result.manifest_path,
        imagesCount: images.length,
        curatedCount: curatedResult.stats.curatedCount,
        images: updatedState.images,
        componentImages: updatedState.componentImages,
        componentImageLinkDetails: updatedState.componentImageLinkDetails,
      });
    } catch (err) {
      console.error('[HEPHAESTUS]', JSON.stringify({
        event: 'extraction-failed',
        message: err?.message || 'unknown error',
      }));
      return res.status(500).json({ error: 'HEPHAESTUS extraction failed. Check the server diagnostic and retry.' });
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

  app.post('/api/projects/:projectId/components/:componentId/images', (req, res) => {
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
    return res.json({ ...safeImageListResponse(projectId, refreshed), componentImages: links });
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

