import fs from 'fs';
import path from 'path';
import {
  appendImages,
  linkImagesToComponent,
  listImages,
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
    
    // Get file path from fileKey or construct from source
    let filePath = image.fileKey;
    
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
    const state = listImages(projectId);
    res.json({ images: state.images, componentImages: state.componentImages });
  });

  app.post('/api/projects/:projectId/images/fetch-bgg', async (req, res) => {
    const { projectId } = req.params;
    const { bggUrl } = req.body || {};
    try {
      const fetched = await fetchBggImages(projectId, bggUrl);
      const enhanced = fetched.map(runImageEnhancement);
      const state = appendImages(projectId, enhanced);
      res.json({ images: state.images, componentImages: state.componentImages });
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
      res.json({ images: state.images, componentImages: state.componentImages });
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
        componentImages: state.componentImages 
      });
    } catch (err) {
      console.error('Failed to extract PDF images', err);
      res.status(400).json({ error: err.message || 'Unable to extract PDF images' });
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
          componentImages: state.componentImages 
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
        componentImages: state.componentImages 
      });
    } catch (err) {
      console.error('Failed to extract native images:', err);
      res.status(500).json({ error: err.message || 'Failed to extract native images' });
    }
  });

  // AI-powered component cropping - uses GPT-4o Vision to detect and crop game components
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
          componentImages: state.componentImages
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
        componentImages: updatedState.componentImages
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
          componentImages: state.componentImages
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
        componentImages: updatedState.componentImages
      });
    } catch (err) {
      console.error('Multi-stage pipeline failed:', err);
      res.status(500).json({ error: err.message || 'Pipeline failed' });
    }
  });

  // HEPHAESTUS: PyMuPDF-based component extraction with hybrid classification
  app.post('/api/projects/:projectId/images/extract-hephaestus', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    const { minWidth = 100, minHeight = 100 } = req.body || {};
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      
      const available = await isHephaestusAvailable();
      if (!available) {
        return res.status(500).json({ error: 'HEPHAESTUS system not available' });
      }
      
      console.log('[HEPHAESTUS] Starting extraction from:', req.file.path);
      
      const outputDir = path.join(process.cwd(), 'data', projectId, 'hephaestus');
      const result = await extractWithHephaestus(req.file.path, outputDir, {
        minWidth: parseInt(minWidth),
        minHeight: parseInt(minHeight)
      });
      
      // Handle extraction errors vs empty results
      if (!result.success && result.error) {
        return res.status(500).json({ error: result.error });
      }
      
      // Remove old HEPHAESTUS images
      removeImagesBySource(projectId, 'hephaestus');
      
      // Handle zero-image extraction (valid but empty)
      if (!result.images || result.images.length === 0) {
        const state = listImages(projectId);
        return res.json({
          success: true,
          mode: 'hephaestus',
          message: 'No component images found in PDF. Try adjusting size thresholds or use page extraction instead.',
          stats: result.stats || {},
          manifestPath: result.manifest_path,
          imagesCount: 0,
          images: state.images,
          componentImages: state.componentImages
        });
      }
      
      // Convert HEPHAESTUS output to MOBIUS image format
      const images = (result.images || []).map(img => normalizeImageAsset({
        id: `heph_${img.id}`,
        fileKey: img.file_path,
        source: 'hephaestus',
        width: img.dimensions?.width,
        height: img.dimensions?.height,
        tags: [
          img.classification,
          img.is_component ? 'component' : 'non-component',
          img.label || 'unlabeled'
        ].filter(Boolean),
        metadata: {
          page: img.page_index,
          confidence: img.confidence,
          label: img.label,
          quantity: img.quantity,
          classification: img.classification
        }
      }));
      
      const enhanced = images.map(runImageEnhancement);
      appendImages(projectId, enhanced);
      const updatedState = listImages(projectId);
      
      console.log(`[HEPHAESTUS] Extraction complete: ${enhanced.length} images`);
      res.json({
        success: true,
        mode: 'hephaestus',
        message: `Extracted ${enhanced.length} images using HEPHAESTUS`,
        stats: result.stats,
        manifestPath: result.manifest_path,
        imagesCount: enhanced.length,
        images: updatedState.images,
        componentImages: updatedState.componentImages
      });
    } catch (err) {
      console.error('[HEPHAESTUS] Extraction failed:', err);
      res.status(500).json({ error: err.message || 'HEPHAESTUS extraction failed' });
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
      res.json({ images: state.images, componentImages: state.componentImages });
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
      res.json({ images: state.images, componentImages: state.componentImages });
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
    res.json({ images: refreshed.images, componentImages: refreshed.componentImages });
  });

  app.post('/api/projects/:projectId/components/:componentId/images', (req, res) => {
    const { projectId, componentId } = req.params;
    const { imageIds } = req.body || {};
    const links = linkImagesToComponent(projectId, componentId, Array.isArray(imageIds) ? imageIds : []);
    const state = listImages(projectId);
    res.json({ images: state.images, componentImages: links });
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
        componentImages: state.componentImages 
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
        componentImages: state.componentImages 
      });
    } catch (err) {
      console.error('Auto-gather failed:', err);
      res.status(500).json({ error: err.message || 'Auto-gather failed' });
    }
  });

  // AI-powered automatic component-to-image matching
  app.post('/api/projects/:projectId/images/auto-match', async (req, res) => {
    const { projectId } = req.params;
    const { components = [], gameName } = req.body || {};
    
    if (!openai) {
      return res.status(400).json({ error: 'AI service not configured' });
    }
    
    console.log('Auto-matching', components.length, 'components to images');
    
    try {
      const state = listImages(projectId);
      const images = state.images || [];
      
      if (images.length === 0) {
        return res.json({ 
          message: 'No images available for matching',
          images: [],
          componentImages: {} 
        });
      }
      
      // Use AI to match components to images
      const matches = await matchComponentsToImages(components, images, gameName, openai);
      
      // Apply the matches
      for (const [componentId, imageIds] of Object.entries(matches)) {
        linkImagesToComponent(projectId, componentId, imageIds);
      }
      
      const updatedState = listImages(projectId);
      res.json({ 
        matched: Object.keys(matches).length,
        images: updatedState.images, 
        componentImages: updatedState.componentImages 
      });
    } catch (err) {
      console.error('Auto-match failed:', err);
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

