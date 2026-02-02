import express from 'express';
import db from './db.js';

const router = express.Router();

/**
 * Get all projects
 */
router.get('/', async (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    const projects = stmt.all();
    res.json({
      success: true,
      projects: projects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get a specific project by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = stmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    res.json({
      success: true,
      project: project
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    const { name, metadata, components, images, script, audio } = req.body;
    
    const stmt = db.prepare(`
      INSERT INTO projects (name, metadata, components, images, script, audio, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    
    const projectId = stmt.run(
      name || `Project ${Date.now()}`,
      JSON.stringify(metadata || {}),
      JSON.stringify(components || []),
      JSON.stringify(images || []),
      script ? JSON.stringify(script) : null,
      audio ? JSON.stringify(audio) : null
    ).lastInsertRowid;
    
    res.json({
      success: true,
      projectId: projectId,
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Update project metadata
 */
router.patch('/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { metadata } = req.body;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Update metadata
    const stmt = db.prepare(`
      UPDATE projects 
      SET metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(JSON.stringify(metadata), id);
    
    res.json({
      success: true,
      message: 'Project metadata updated successfully'
    });
  } catch (error) {
    console.error('Error updating project metadata:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Save a project (stub for validation)
 */
router.post('/:id/save', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // In a real implementation, this would trigger a save operation
    // For validation purposes, we'll just return success
    res.json({
      success: true,
      message: 'Project saved successfully',
      projectId: id,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving project:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Apply theme to a project (stub for validation)
 */
router.post('/:id/theme', async (req, res) => {
  try {
    const { id } = req.params;
    const { theme } = req.body;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Update project with theme information
    const currentMetadata = JSON.parse(project.metadata || '{}');
    const updatedMetadata = {
      ...currentMetadata,
      theme: theme,
      themeAppliedAt: new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      UPDATE projects 
      SET metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(JSON.stringify(updatedMetadata), id);
    
    res.json({
      success: true,
      message: 'Theme applied successfully',
      projectId: id,
      theme: theme
    });
  } catch (error) {
    console.error('Error applying theme:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Create/update callouts for a project
 */
router.post('/:id/callouts', async (req, res) => {
  try {
    const { id } = req.params;
    const { callouts } = req.body;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Update project with callout information
    const currentMetadata = JSON.parse(project.metadata || '{}');
    const updatedMetadata = {
      ...currentMetadata,
      callouts: callouts,
      calloutsUpdatedAt: new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      UPDATE projects 
      SET metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(JSON.stringify(updatedMetadata), id);
    
    res.json({
      success: true,
      message: 'Callouts created/updated successfully',
      projectId: id,
      callouts: callouts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating/updating callouts:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get callouts for a project
 */
router.get('/:id/callouts', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Get callouts from project metadata
    const currentMetadata = JSON.parse(project.metadata || '{}');
    const callouts = currentMetadata.callouts || [];
    
    res.json({
      success: true,
      projectId: id,
      callouts: callouts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching callouts:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Generate transition preview for a project
 */
router.post('/:id/transitions/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const { transitionType, duration } = req.body;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Generate mock transition preview data
    const previewData = {
      id: `transition_${Date.now()}`,
      projectId: id,
      transitionType: transitionType || 'fade',
      duration: duration || 1.0,
      previewUrl: `http://localhost:5001/previews/transition_${Date.now()}.mp4`,
      metadata: {
        width: 1920,
        height: 1080,
        format: 'mp4',
        duration: duration || 1.0
      },
      generatedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Transition preview generated successfully',
      projectId: id,
      preview: previewData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating transition preview:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Apply color palette to a project
 */
router.post('/:id/color-palette', async (req, res) => {
  try {
    const { id } = req.params;
    const { palette } = req.body;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Update project with color palette information
    const currentMetadata = JSON.parse(project.metadata || '{}');
    const updatedMetadata = {
      ...currentMetadata,
      colorPalette: palette,
      paletteAppliedAt: new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      UPDATE projects 
      SET metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(JSON.stringify(updatedMetadata), id);
    
    res.json({
      success: true,
      message: 'Color palette applied successfully',
      projectId: id,
      palette: palette,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error applying color palette:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Save layout for a project
 */
router.post('/:id/layout/save', async (req, res) => {
  try {
    const { id } = req.params;
    const { layout } = req.body;
    
    // First check if project exists
    const checkStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = checkStmt.get(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Update project with layout information
    const currentMetadata = JSON.parse(project.metadata || '{}');
    const updatedMetadata = {
      ...currentMetadata,
      layout: layout,
      layoutSavedAt: new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      UPDATE projects 
      SET metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(JSON.stringify(updatedMetadata), id);
    
    res.json({
      success: true,
      message: 'Layout saved successfully',
      projectId: id,
      layout: layout,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving layout:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;