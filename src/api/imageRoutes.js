import fs from 'fs';
import path from 'path';
import {
  appendImages,
  linkImagesToComponent,
  listImages,
  upsertImage,
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
  extractComponentCrops,
  matchCropsToComponents,
} from '../services/intelligentCropper.js';
import {
  extractAllImages as extractNativeImages,
} from '../services/nativeImageExtractor.js';

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
      const fs = await import('fs');
      const pdfBuffer = fs.readFileSync(req.file.path);
      
      const result = await extractNativeImages(pdfBuffer, projectId, {
        minWidth: 100,
        minHeight: 100,
      });
      
      if (result.images.length === 0) {
        console.log('No native images found, falling back to page extraction');
        const extracted = await extractRulebookImages(projectId, req.file.path);
        const enhanced = extracted.map(runImageEnhancement);
        const state = appendImages(projectId, enhanced);
        return res.json({ 
          mode: 'pages',
          message: 'No embedded images found, extracted full pages instead',
          nativeCount: 0,
          pagesCount: enhanced.length,
          images: state.images, 
          componentImages: state.componentImages 
        });
      }
      
      const enhanced = result.images.map(runImageEnhancement);
      const state = appendImages(projectId, enhanced);
      
      console.log(`Extracted ${enhanced.length} native embedded images from PDF`);
      res.json({ 
        mode: 'native',
        nativeCount: enhanced.length,
        message: result.message,
        images: state.images, 
        componentImages: state.componentImages 
      });
    } catch (err) {
      console.error('Failed to extract native images:', err);
      res.status(500).json({ error: err.message || 'Failed to extract native images' });
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

  // Intelligent image cropping - uses AI vision to detect and crop component images from PDF
  app.post('/api/projects/:projectId/images/extract-crops', uploadMiddleware.single('file'), async (req, res) => {
    const { projectId } = req.params;
    const { components = [] } = req.body;
    
    let parsedComponents = components;
    if (typeof components === 'string') {
      try {
        parsedComponents = JSON.parse(components);
      } catch (e) {
        parsedComponents = [];
      }
    }
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      
      if (!openai) {
        return res.status(400).json({ error: 'AI service not configured for vision detection' });
      }
      
      console.log('Extracting component crops from PDF with AI vision...');
      console.log('Components to find:', parsedComponents.length);
      
      const result = await extractComponentCrops(projectId, req.file.path, parsedComponents, openai);
      
      if (result.fallbackToPages) {
        console.log('No AI crops found, falling back to full page extraction');
        const extracted = await extractRulebookImages(projectId, req.file.path);
        const enhanced = extracted.map(runImageEnhancement);
        const state = appendImages(projectId, enhanced);
        return res.json({ 
          mode: 'pages',
          message: 'No distinct component images detected, extracted full pages instead',
          cropsCount: 0,
          pagesCount: enhanced.length,
          images: state.images, 
          componentImages: state.componentImages 
        });
      }
      
      const normalizedCrops = result.crops.map(crop => ({
        id: crop.id,
        source: crop.source,
        fileKey: crop.fileKey,
        width: crop.width,
        height: crop.height,
        tags: crop.tags,
        quality: crop.quality,
        parentPage: crop.parentPage,
        bbox: crop.bbox,
        aiLabels: crop.aiLabels,
        category: crop.category,
        confidence: crop.confidence,
      }));
      
      const state = appendImages(projectId, normalizedCrops);
      
      const matches = await matchCropsToComponents(result.crops, parsedComponents);
      for (const [componentId, imageIds] of Object.entries(matches)) {
        linkImagesToComponent(projectId, componentId, imageIds);
      }
      
      const updatedState = listImages(projectId);
      
      console.log(`Extracted ${normalizedCrops.length} component crops, matched to ${Object.keys(matches).length} components`);
      
      res.json({ 
        mode: 'crops',
        cropsCount: normalizedCrops.length,
        matchedComponents: Object.keys(matches).length,
        images: updatedState.images, 
        componentImages: updatedState.componentImages 
      });
    } catch (err) {
      console.error('Failed to extract component crops:', err);
      res.status(500).json({ error: err.message || 'Failed to extract component crops' });
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

