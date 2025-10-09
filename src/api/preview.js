// src/api/preview.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDirs, resolveDataPath } from '../config/paths.js';
import { Metrics } from '../metrics/metrics.js';

const router = express.Router();

// Preview endpoint - generates a mock video preview
router.post('/preview', async (req, res) => {
  try {
    const { chapterId, chapters } = req.body;
    
    if (!chapterId || !chapters) {
      return res.status(400).json({ error: 'Missing chapterId or chapters data' });
    }
    
    // Find the requested chapter
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    
    // Simulate video generation (in a real implementation, this would call the rendering pipeline)
    const previewId = Date.now().toString(36);
    const previewPath = resolveDataPath('previews', `${previewId}.mp4`);
    
    // Ensure previews directory exists
    const previewsDir = resolveDataPath('previews');
    if (!fs.existsSync(previewsDir)) {
      fs.mkdirSync(previewsDir, { recursive: true });
    }
    
    // Create a mock preview file (in reality, this would be a generated video)
    const mockVideoContent = `Mock preview video for chapter: ${chapter.title}\nGenerated at: ${new Date().toISOString()}\nSteps: ${chapter.steps.length}`;
    fs.writeFileSync(previewPath, mockVideoContent);
    
    Metrics.inc('preview_generated_total');
    
    // Return preview information
    res.json({
      ok: true,
      previewId,
      chapterId,
      chapterTitle: chapter.title,
      previewPath: previewPath.replace(getDirs().root + path.sep, ''),
      estimatedDuration: chapter.steps.length * 4 + 3, // Rough estimate: 3s for chapter title + 4s per step
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    Metrics.inc('preview_errors_total');
    console.error('Preview generation error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Get preview status
router.get('/preview/:previewId', (req, res) => {
  try {
    const { previewId } = req.params;
    const previewPath = resolveDataPath('previews', `${previewId}.mp4`);
    
    if (!fs.existsSync(previewPath)) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    
    const stats = fs.statSync(previewPath);
    
    res.json({
      ok: true,
      previewId,
      exists: true,
      size: stats.size,
      createdAt: stats.birthtime.toISOString(),
      path: previewPath.replace(getDirs().root + path.sep, '')
    });
  } catch (error) {
    Metrics.inc('preview_errors_total');
    console.error('Preview status error:', error);
    res.status(500).json({ error: 'Failed to get preview status' });
  }
});

export default router;